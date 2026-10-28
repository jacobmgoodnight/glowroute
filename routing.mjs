/** Small, bounded, in-memory request client. No location history is written to disk. */
export function validCoordinates(point) {
  return Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point?.lon) && Math.abs(point.lon) <= 180;
}

export function coordinateInput(address) {
  const match = String(address).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const point = {lat:Number(match[1]), lon:Number(match[2]), source:'Coordinates', geoSource:'manual'};
  if (!validCoordinates(point)) throw Error('Coordinates must be latitude −90 to 90, longitude −180 to 180.');
  return point;
}

export function locationPath(points) {
  if (!points.every(validCoordinates)) throw Error('Invalid map coordinates. Check addresses or reposition the pin.');
  return points.map(p=>`${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
}

export async function fetchJson(url, {signal, timeoutMs=12000, fetchImpl=globalThis.fetch}={}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = ()=>controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, {once:true});
  let timedOut = false;
  const timer = setTimeout(()=>{timedOut=true;controller.abort();}, timeoutMs);
  try {
    const response = await fetchImpl(url, {signal:controller.signal, credentials:'omit', headers:{Accept:'application/json'}});
    if (!response.ok) {
      const error = Error(response.status===429 ? 'Routing service is busy. Wait a minute before retrying.' : `Mapping service unavailable (HTTP ${response.status}). Try again later.`);
      if (response.status===429) {
        const retry = response.headers?.get('retry-after');
        error.retryAfterMs = Math.max(60000, /^\d+$/.test(retry||'') ? Number(retry)*1000 : Date.parse(retry)-Date.now() || 0);
      }
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timedOut) throw Error('Mapping service timed out. Check your connection and retry, or use rough ordering.');
    if (error instanceof TypeError) throw Error('Mapping service could not be reached. Check your connection or try later.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function validateRoadMatrix(data, size) {
  const valid = matrix=>Array.isArray(matrix) && matrix.length===size && matrix.every(row=>
    Array.isArray(row) && row.length===size && row.every(v=>Number.isFinite(v)&&v>=0));
  if (data?.code!=='Ok' || !valid(data.durations) || !valid(data.distances)) {
    throw Error('Some pins cannot be connected by driving roads, or the service returned incomplete data. Verify pins and try fewer stops.');
  }
  for (const waypoint of [...(data.sources||[]), ...(data.destinations||[])]) {
    if (waypoint?.distance>1500) throw Error('A pin is more than 1.5 km from the modeled road. Verify its address or move the pin.');
  }
  return data;
}

export function createRoutingClient({fetchImpl=globalThis.fetch, now=Date.now, pause=ms=>new Promise(r=>setTimeout(r,ms)), intervalMs=1100, timeoutMs=12000, ttlMs=300000, maxEntries=20}={}) {
  let tail=Promise.resolve(), nextAt=0;
  const cache=new Map(), pending=new Map();
  function request(url, {signal}={}) {
    signal?.throwIfAborted();
    const hit=cache.get(url);
    if (hit && now()-hit.time<ttlMs) return Promise.resolve(hit.data);
    const previous=pending.get(url);
    if (previous && previous.signal===signal) return previous.promise;
    const promise=tail.catch(()=>{}).then(async()=>{
      signal?.throwIfAborted();
      if (nextAt>now()) await new Promise((resolve,reject)=>{
        const cancel=()=>reject(signal.reason);
        signal?.addEventListener('abort',cancel,{once:true});
        pause(nextAt-now()).then(resolve,reject).finally(()=>signal?.removeEventListener('abort',cancel));
      });
      signal?.throwIfAborted();
      nextAt=now()+intervalMs;
      try {
        const data=await fetchJson(url, {signal,timeoutMs,fetchImpl});
        signal?.throwIfAborted();
        if (data.code!=='Ok') throw Error(`Road routing unavailable (${data.code||'invalid response'}). Verify map pins or try later.`);
        if(url.includes('/table/v1/'))validateRoadMatrix(data,url.split('/driving/')[1].split('?')[0].split(';').length);
        cache.delete(url);cache.set(url,{time:now(),data});
        while(cache.size>maxEntries) cache.delete(cache.keys().next().value);
        return data;
      } catch(error) {
        if(error.retryAfterMs) nextAt=Math.max(nextAt,now()+error.retryAfterMs);
        throw error;
      }
    });
    tail=promise;
    pending.set(url,{signal,promise});
    const cleanup=()=>{if(pending.get(url)?.promise===promise)pending.delete(url);};
    promise.then(cleanup,cleanup);
    return promise;
  }
  return {request};
}
