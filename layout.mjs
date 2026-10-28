/** Desktop split-pane sizing. This preference is independent of saved drive data. */
export const PANEL_WIDTH_STORE='glowroute:planner-width:v1';
const DEFAULT_WIDTH=490,MIN_WIDTH=355,DIVIDER_WIDTH=24,MIN_MAP_WIDTH=320;

export function panelBounds(layoutWidth){
 const width=Number.isFinite(layoutWidth)?Math.max(0,layoutWidth):0;
 return {min:MIN_WIDTH,max:Math.max(MIN_WIDTH,Math.min(Math.floor(width*.65),width-DIVIDER_WIDTH-MIN_MAP_WIDTH))};
}
export function panelWidth(preferred,layoutWidth){
 const {min,max}=panelBounds(layoutWidth);
 return Math.round(Math.max(min,Math.min(max,Number.isFinite(preferred)?preferred:DEFAULT_WIDTH)));
}

export function initPanelResize({layout,handle,mapArea,onMapResize=()=>{}}){
 const desktop=window.matchMedia('(min-width:851px)');
 let preferred=null,drag=null,frame=null;
 try{const raw=localStorage.getItem(PANEL_WIDTH_STORE),value=raw===null?null:Number(raw);if(Number.isFinite(value)&&value>=MIN_WIDTH)preferred=value;}catch{}

 const redraw=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;onMapResize();});};
 function apply(){
  const total=layout.getBoundingClientRect().width,{min,max}=panelBounds(total),width=panelWidth(preferred,total);
  if(desktop.matches)layout.style.setProperty('--planner-width',`${width}px`);
  else layout.style.removeProperty('--planner-width');
  const percent=value=>Math.round(value/Math.max(1,total)*100);
  handle.setAttribute('aria-valuemin',String(percent(min)));handle.setAttribute('aria-valuemax',String(percent(max)));handle.setAttribute('aria-valuenow',String(percent(width)));
  handle.setAttribute('aria-valuetext',`Route planner ${width} pixels wide`);
  redraw();
 }
 function remember(){try{if(preferred===null)localStorage.removeItem(PANEL_WIDTH_STORE);else localStorage.setItem(PANEL_WIDTH_STORE,String(preferred));}catch{}}
 function finish(commit){
  if(!drag)return;
  const previous=drag;drag=null;
  if(!commit)preferred=previous.preferred;
  document.documentElement.classList.remove('resizing-panels');
  if(handle.hasPointerCapture?.(previous.id))handle.releasePointerCapture(previous.id);
  apply();if(commit)remember();
 }
 function reset(){finish(false);preferred=null;remember();apply();}

 handle.addEventListener('pointerdown',event=>{
  if(!desktop.matches||event.button!==0||event.isPrimary===false||drag)return;
  event.preventDefault();handle.focus({preventScroll:true});
  drag={id:event.pointerId,x:event.clientX,width:panelWidth(preferred,layout.getBoundingClientRect().width),preferred};
  handle.setPointerCapture(event.pointerId);document.documentElement.classList.add('resizing-panels');
 });
 handle.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  preferred=panelWidth(drag.width+event.clientX-drag.x,layout.getBoundingClientRect().width);apply();
 });
 handle.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)finish(true);});
 for(const type of ['pointercancel','lostpointercapture'])handle.addEventListener(type,event=>{if(drag?.id===event.pointerId)finish(false);});
 handle.addEventListener('dblclick',()=>{if(desktop.matches)reset();});
 handle.addEventListener('keydown',event=>{
  if(!desktop.matches)return;
  if(event.key==='Escape'&&drag){event.preventDefault();finish(false);return;}
  if(event.key==='Enter'){event.preventDefault();reset();return;}
  const {min,max}=panelBounds(layout.getBoundingClientRect().width),width=panelWidth(preferred,layout.getBoundingClientRect().width),step=event.shiftKey?100:20;
  const next={ArrowLeft:width-step,ArrowRight:width+step,Home:min,End:max}[event.key];
  if(next===undefined)return;
  event.preventDefault();finish(false);preferred=panelWidth(next,layout.getBoundingClientRect().width);apply();remember();
 });
 window.addEventListener('resize',()=>{finish(false);apply();});
 // Leaflet must remeasure the map after column/viewport or Live Drive layout changes.
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(redraw).observe(mapArea);
 apply();
}
