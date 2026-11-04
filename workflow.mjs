/** In-memory navigation only: stages never change saved drive data. */
export function initWorkflow({initial='plan',onChange=()=>{}}={}){
 const names=['discover','plan','drive'],tabs=names.map(name=>document.getElementById(`workflow-${name}`));
 let active=null,revision=0;
 function show(name,{focus=false,user=false}={}){
  if(!names.includes(name))return;
  const previous=active;
  if(user||name!==active)revision++;
  active=name;
  for(const [i,tab] of tabs.entries()){
   const selected=names[i]===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
   document.getElementById(`stage-${names[i]}`).hidden=!selected;
  }
  document.body.dataset.stage=name;
  onChange(name,previous,{user});
  if(focus){
   const heading=document.getElementById(`${name}-heading`),planner=document.getElementById('planner-panel');
   const nav=document.getElementById('workflow-nav'),offset=nav.offsetHeight+12;
   if(getComputedStyle(planner).overflowY==='auto'){
    planner.scrollTo({top:planner.scrollTop+heading.getBoundingClientRect().top-planner.getBoundingClientRect().top-offset,behavior:'instant'});
    const overlap=nav.getBoundingClientRect().bottom+12-heading.getBoundingClientRect().top;
    if(overlap>0)planner.scrollBy({top:-overlap,behavior:'instant'});
   }
   else window.scrollTo({top:window.scrollY+heading.getBoundingClientRect().top-offset,behavior:'instant'});
   heading.focus({preventScroll:true});
  }
 }
 for(const [i,tab] of tabs.entries()){
  tab.addEventListener('click',()=>show(names[i],{focus:true,user:true}));
  tab.addEventListener('keydown',event=>{
   const index={ArrowRight:(i+1)%3,ArrowLeft:(i+2)%3,Home:0,End:2}[event.key];if(index===undefined)return;
   event.preventDefault();show(names[index],{user:true});tabs[index].focus({preventScroll:true});
  });
 }
 document.querySelectorAll('[data-go-stage]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.goStage,{focus:true,user:true})));
 show(initial);
 return {show,get active(){return active;},get revision(){return revision;}};
}
