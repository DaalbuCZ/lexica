export function commentLayout(comment){
 const lines=[];
 for(const paragraph of comment.text.split('\n')){
  if(!paragraph){lines.push('');continue}
  let rest=paragraph;
  while(rest.length>40){let cut=rest.lastIndexOf(' ',40);if(cut<1)cut=40;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart()}
  lines.push(rest);
 }
 return {lines,w:Math.max(110,Math.max(...lines.map(x=>x.length))*6.7+24),h:Math.max(42,lines.length*17+20)};
}

export function nearestState(machine,point){
 return machine.states.reduce((best,s)=>!best||Math.hypot(s.x-point.x,s.y-point.y)<Math.hypot(best.x-point.x,best.y-point.y)?s:best,null);
}
export function makeComment(machine,position,id=crypto.randomUUID()){
 return {id,text:'Comment',x:position.x,y:position.y,nodeId:nearestState(machine,position)?.id??null};
}
export function commentAnchors(machine){
 return (machine.comments??[]).flatMap(comment=>{
  if(comment.nodeId===undefined)comment.nodeId=nearestState(machine,comment)?.id??null;
  const state=machine.states.find(s=>s.id===comment.nodeId);
  return state?[{comment,state,dx:comment.x-state.x,dy:comment.y-state.y}]:[];
 });
}
