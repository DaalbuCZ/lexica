import {canvasTransform} from './canvas-graph.js';

export function wheelZoomFactor(delta,sensitivity=1){return Math.exp(Math.max(-.35,Math.min(.35,delta*.006*sensitivity)))}
export function pinchView(view,anchor,center,size,factor){
 const width=Math.max(160,Math.min(30000,view.width*factor)),height=view.height*width/view.width,t=canvasTransform({x:0,y:0,width,height},size.width,size.height);
 return {x:anchor.x-(center.x-t.x)/t.scale,y:anchor.y-(center.y-t.y)/t.scale,width,height};
}
export function setupCanvasGestures(canvas,{getView,setView,toWorld,onInterrupt,sensitivity=()=>1}){
 const pointers=new Map();let gesture=null,pinching=false;
 const center=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
 const distance=()=>{const [a,b]=[...pointers.values()];return Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
 canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size<2&&!pinching)return;event.preventDefault();event.stopImmediatePropagation();
  if(pointers.size===2){onInterrupt();const point=center();gesture={view:getView(),anchor:toWorld({clientX:point.x,clientY:point.y}),distance:distance()};pinching=true}
  for(const id of pointers.keys())try{canvas.setPointerCapture(id)}catch{}
 },true);
 canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(!pinching)return;event.preventDefault();event.stopImmediatePropagation();if(pointers.size!==2||!gesture)return;
  const point=center(),rect=canvas.getBoundingClientRect();setView(pinchView(gesture.view,gesture.anchor,{x:point.x-rect.left,y:point.y-rect.top},{width:canvas.clientWidth,height:canvas.clientHeight},(gesture.distance/distance())**sensitivity()));
 },true);
 const end=event=>{pointers.delete(event.pointerId);if(!pinching)return;event.preventDefault();event.stopImmediatePropagation();gesture=null;if(!pointers.size)pinching=false};
 canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);
}
