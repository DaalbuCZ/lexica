const sides=['top','bottom','left','right'];
export function nearestDock(x,y,width,height){
 const distances=[y,height-y,x,width-x];
 return sides[distances.indexOf(Math.min(...distances))];
}
export function dockSettings(value){return {toolbar:sides.includes(value?.toolbar)?value.toolbar:'top',tester:sides.includes(value?.tester)?value.tester:'bottom'}}
export function setupDocking(){
 let settings=dockSettings();try{settings=dockSettings(JSON.parse(localStorage.getItem('lexica-docks')))}catch{}
 const preview=document.createElement('div');preview.className='dock-preview';preview.hidden=true;preview.setAttribute('aria-hidden','true');document.body.append(preview);
 function apply(){for(const name of ['toolbar','tester'])document.body.dataset[name+'Dock']=settings[name];window.dispatchEvent(new Event('resize'))}
 function save(name,side){settings[name]=side;apply();try{localStorage.setItem('lexica-docks',JSON.stringify(settings))}catch{}}
 for(const name of ['toolbar','tester']){
  const grip=document.getElementById(name+'-grip');let drag=null;
  grip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();grip.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,side:settings[name],moved:false};};
  grip.onpointermove=e=>{if(!drag)return;e.stopPropagation();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(!drag.moved)return;drag.side=nearestDock(e.clientX,e.clientY,window.innerWidth,window.innerHeight);preview.dataset.side=drag.side;preview.dataset.panel=name;preview.hidden=false;document.body.classList.add('docking');};
  function finish(e,cancel=false){if(!drag)return;e.stopPropagation();const target=drag;drag=null;preview.hidden=true;document.body.classList.remove('docking');if(grip.hasPointerCapture(target.id))grip.releasePointerCapture(target.id);if(target.moved&&!cancel)save(name,target.side)}
  grip.onpointerup=e=>finish(e);grip.onpointercancel=e=>finish(e,true);grip.onlostpointercapture=e=>finish(e,true);
  grip.onkeydown=e=>{const side={ArrowUp:'top',ArrowDown:'bottom',ArrowLeft:'left',ArrowRight:'right'}[e.key];if(side){e.preventDefault();e.stopPropagation();save(name,side)}else if(e.key==='Escape'&&drag){e.preventDefault();finish(e,true)}};
 }
 apply();
}
