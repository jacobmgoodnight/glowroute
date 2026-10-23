/**
 * Fixed-endpoint, asymmetric-TSP optimizer.
 * Matrix indices: 0=start, 1..N=stops, N+1=end.
 * Objective units are whatever the provided matrix contains.
 */
export function routeCost(order, matrix) {
  let prev = 0, cost = 0;
  const finish = matrix.length - 1;
  for (const stop of order) {
    const value = matrix[prev]?.[stop];
    if (!Number.isFinite(value)) return Infinity;
    cost += value;
    prev = stop;
  }
  const value = matrix[prev]?.[finish];
  return Number.isFinite(value) ? cost + value : Infinity;
}

function assertMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2 || matrix.some(row => !Array.isArray(row) || row.length !== matrix.length)) {
    throw new Error('The travel-time matrix has invalid dimensions.');
  }
}

// Held-Karp exact DP for up to twelve selected stops; fully respects one-way travel costs.
function exact(matrix, n) {
  const full = (1 << n) - 1;
  const values = new Float64Array((full + 1) * n).fill(Infinity);
  const parent = new Int16Array((full + 1) * n).fill(-1);
  for (let i = 0; i < n; i++) values[(1 << i) * n + i] = matrix[0][i + 1];
  for (let mask = 1; mask <= full; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const index = mask * n + last;
      const base = values[index];
      if (!Number.isFinite(base)) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next), idx = nextMask * n + next;
        const alt = base + matrix[last + 1][next + 1];
        if (alt < values[idx]) { values[idx] = alt; parent[idx] = last; }
      }
    }
  }
  let best = Infinity, last = -1;
  for (let j = 0; j < n; j++) {
    const candidate = values[full * n + j] + matrix[j + 1][n + 1];
    if (candidate < best) { best = candidate; last = j; }
  }
  if (!Number.isFinite(best)) throw new Error('No drivable path connects all selected stops.');
  const order = [], result = []; let mask = full;
  while (last !== -1) {
    order.push(last + 1);
    const old = parent[mask * n + last];
    mask ^= 1 << last;
    last = old;
  }
  while(order.length) result.push(order.pop());
  return result;
}

function greedyInsert(matrix, n, seed = 0) {
  const remaining = Array.from({length:n},(_,i)=>i+1);
  const startAt = seed % n;
  const order = [remaining.splice(startAt,1)[0]];
  while (remaining.length) {
    let choice = null;
    for (const node of remaining) for (let i=0;i<=order.length;i++) {
      const trial=order.slice(); trial.splice(i,0,node);
      const cost=routeCost(trial,matrix);
      if (choice === null || cost < choice.cost) choice={node,index:i,cost};
    }
    order.splice(choice.index,0,choice.node);
    remaining.splice(remaining.indexOf(choice.node),1);
  }
  return order;
}

function improve(matrix, sequence) {
  let current = sequence.slice(), cost=routeCost(current,matrix), changed=true;
  let passes=0;
  while(changed && passes++ < 35) {
    changed=false;
    for(let i=0;i<current.length && !changed;i++) {
      for(let j=i+1;j<current.length;j++) {
        const trial = [...current.slice(0,i),...current.slice(i,j+1).reverse(),...current.slice(j+1)];
        const c=routeCost(trial,matrix);
        if(c < cost-1e-7){current=trial;cost=c;changed=true;break;}
      }
    }
    for(let i=0;i<current.length && !changed;i++) {
      for(let j=0;j<current.length;j++) {
        if(i===j)continue;
        const trial=current.slice();const [node]=trial.splice(i,1);trial.splice(j,0,node);
        const c=routeCost(trial,matrix);
        if(c < cost-1e-7){current=trial;cost=c;changed=true;break;}
      }
    }
  }
  return current;
}

export function optimize(matrix) {
  assertMatrix(matrix);
  const n=matrix.length-2;
  if (n<1) throw new Error('Choose at least one display.');
  if (n>70) throw new Error('For this version, select up to 70 displays.');
  const baseline=Array.from({length:n},(_,i)=>i+1);
  let order;
  if (n<=12) order=exact(matrix,n);
  else {
    let best=Infinity;
    for(let s=0;s<Math.min(n,12);s++) {
      const candidate=improve(matrix,greedyInsert(matrix,n,s));
      const score=routeCost(candidate,matrix);
      if (score<best) { best=score; order=candidate; }
    }
  }
  if(routeCost(baseline,matrix)<routeCost(order,matrix))order=baseline;
  if(!Number.isFinite(routeCost(order,matrix)))throw new Error('The driving network could not connect all of these stops.');
  return { order, score:routeCost(order,matrix), baseline:routeCost(baseline,matrix), method:n<=12?'exact':'heuristic' };
}

/** Split into consecutive navigation legs. Max NEW stops per leg; prior final stop becomes next start. */
export function splitLegs(order,maxNewStops=4) {
  if(!Number.isInteger(maxNewStops)||maxNewStops<1)throw Error('Invalid segment size');
  const legs=[];
  for(let i=0;i<order.length;i+=maxNewStops) {
    legs.push({ start:i===0?null:order[i-1], stops:order.slice(i,i+maxNewStops) });
  }
  return legs;
}

export function googleDirections(origin, destinations) {
  if(!destinations.length)throw Error('No destinations');
  const params=new URLSearchParams({api:'1',origin, destination:destinations.at(-1), travelmode:'driving'});
  if(destinations.length>1)params.set('waypoints',destinations.slice(0,-1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
export function appleDirections(origin, destinations) {
  if(!destinations.length)throw Error('No destinations');
  const params = new URLSearchParams();
  params.set('source',origin);
  for(const stop of destinations.slice(0,-1))params.append('waypoint',stop);
  params.set('destination',destinations.at(-1)); params.set('mode','driving');
  return `https://maps.apple.com/directions?${params.toString()}`;
}
