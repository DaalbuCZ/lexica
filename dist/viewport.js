export function screenToWorld(point,view,rect){
 const scale=Math.min(rect.width/view.width,rect.height/view.height)||1;
 const left=rect.left+(rect.width-view.width*scale)/2,top=rect.top+(rect.height-view.height*scale)/2;
 return {x:view.x+(point.clientX-left)/scale,y:view.y+(point.clientY-top)/scale};
}

// Keep the logical view current between input events, but paint at most once
// per frame. Wheel deltas accumulate even before the preceding paint runs.
export function createViewportController(canvas,onChange,{requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
 const initial=canvas.viewBox.baseVal;let current={x:initial.x,y:initial.y,width:initial.width,height:initial.height},frame=null,dirty=false;
 function get(){return {...current}}
 function flush(){
  if(frame!==null){cancelFrame(frame);frame=null}if(!dirty)return;dirty=false;
  const metrics={width:canvas.clientWidth,height:canvas.clientHeight};
  canvas.setAttribute('viewBox',`${current.x} ${current.y} ${current.width} ${current.height}`);
  onChange(get(),metrics);
 }
 function set(next){
  if(![next.x,next.y,next.width,next.height].every(Number.isFinite)||next.width<=0||next.height<=0)return;
  if(['x','y','width','height'].every(key=>next[key]===current[key]))return;
  current={x:next.x,y:next.y,width:next.width,height:next.height};dirty=true;
  if(frame===null)frame=requestFrame(flush);
 }
 return {get,set,flush};
}
