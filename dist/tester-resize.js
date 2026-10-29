export function testerSize(value,side,width,height){
 const vertical=side==='left'||side==='right',limit=vertical?width:height,min=Math.min(vertical?220:140,limit*.5),max=Math.max(min,limit-240);
 return Math.round(Math.max(min,Math.min(Number.isFinite(value)?value:vertical?320:190,max)));
}
export function setupTesterResize(){
 const handle=document.getElementById('tester-resize'),panel=document.querySelector('.tester'),body=document.body;
 let sizes={height:190,width:320},drag=null,frame=null,pending=null;
 try{const saved=JSON.parse(localStorage.getItem('lexica-tester-size'));for(const key of ['height','width'])if(Number.isFinite(saved?.[key]))sizes[key]=saved[key]}catch{}
 const side=()=>body.dataset.testerDock||'bottom',vertical=()=>side()==='left'||side()==='right';
 function apply(){
  const width=testerSize(sizes.width,'left',window.innerWidth,window.innerHeight),height=testerSize(sizes.height,'bottom',window.innerWidth,window.innerHeight);
  body.style.setProperty('--tester-width',width+'px');body.style.setProperty('--tester-height',height+'px');
  handle.setAttribute('aria-orientation',vertical()?'vertical':'horizontal');handle.setAttribute('aria-valuenow',String(vertical()?width:height));
 }
 function persist(){try{localStorage.setItem('lexica-tester-size',JSON.stringify(sizes))}catch{}}
 function update(value){sizes[vertical()?'width':'height']=testerSize(value,side(),window.innerWidth,window.innerHeight);apply()}
 function flush(){if(frame!==null)cancelAnimationFrame(frame);frame=null;if(pending!==null){update(pending);pending=null}}
 handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const box=panel.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,size:vertical()?box.width:box.height,original:{...sizes}};handle.setPointerCapture(e.pointerId);body.classList.add('resizing-tester')};
 handle.onpointermove=e=>{if(!drag)return;e.stopPropagation();const delta=vertical()?e.clientX-drag.x:e.clientY-drag.y;pending=drag.size+delta*(side()==='left'||side()==='top'?1:-1);if(frame===null)frame=requestAnimationFrame(()=>{frame=null;flush()})};
 function finish(e,cancel=false){if(!drag)return;e.stopPropagation();const previous=drag;flush();drag=null;if(cancel){sizes=previous.original;apply()}else persist();body.classList.remove('resizing-tester');window.dispatchEvent(new Event('resize'));if(handle.hasPointerCapture(previous.id))handle.releasePointerCapture(previous.id)}
 handle.onpointerup=e=>finish(e);handle.onpointercancel=e=>finish(e,true);handle.onlostpointercapture=e=>finish(e,true);
 handle.onkeydown=e=>{if(e.key==='Escape'&&drag){e.preventDefault();finish(e,true);return}const delta=vertical()?{ArrowLeft:-20,ArrowRight:20}[e.key]:{ArrowUp:-20,ArrowDown:20}[e.key];if(delta!==undefined){e.preventDefault();e.stopPropagation();const box=panel.getBoundingClientRect();update((vertical()?box.width:box.height)+delta*(side()==='left'||side()==='top'?1:-1));persist();window.dispatchEvent(new Event('resize'))}};
 window.addEventListener('resize',apply);apply();
}
