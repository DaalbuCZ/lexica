export function createBendReset(findEdge,reset){
 let previous=null;
 return event=>{const edge=findEdge(event),now=event.timeStamp;if(edge&&previous&&previous.edge===edge&&now-previous.time>=0&&now-previous.time<=500&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=12){previous=null;reset(edge);return}previous=edge?{edge,time:now,x:event.clientX,y:event.clientY}:null};
}
