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
export function commentNodeIds(comment){return comment.nodeIds??(comment.nodeId?[comment.nodeId]:[])}
export function makeComment(machine,position,id=crypto.randomUUID()){
 const node=nearestState(machine,position);
 return {id,text:'Comment',x:position.x,y:position.y,nodeIds:node?[node.id]:[]};
}
export function toggleCommentNode(machine,commentId,nodeId){
 const comment=machine.comments?.find(c=>c.id===commentId);
 if(!comment||!machine.states.some(s=>s.id===nodeId))throw Error('Invalid comment attachment.');
 const ids=commentNodeIds(comment);comment.nodeIds=ids.includes(nodeId)?ids.filter(id=>id!==nodeId):[...ids,nodeId];delete comment.nodeId;
}
export function commentAnchors(machine){
 return (machine.comments??[]).flatMap(comment=>{
  if(comment.nodeIds===undefined){const nearest=nearestState(machine,comment);comment.nodeIds=comment.nodeId===undefined?(nearest?[nearest.id]:[]):commentNodeIds(comment);delete comment.nodeId}
  const nodes=machine.states.filter(s=>comment.nodeIds.includes(s.id));
  return nodes.length?[{comment,nodes,dx:comment.x-nodes.reduce((sum,s)=>sum+s.x,0)/nodes.length,dy:comment.y-nodes.reduce((sum,s)=>sum+s.y,0)/nodes.length}]:[];
 });
}
export function positionComments(anchors){
 for(const {comment,nodes,dx,dy} of anchors){comment.x=nodes.reduce((sum,s)=>sum+s.x,0)/nodes.length+dx;comment.y=nodes.reduce((sum,s)=>sum+s.y,0)/nodes.length+dy}
}
export function commentLinks(machine){
 return (machine.comments??[]).flatMap(comment=>{
  const {w,h}=commentLayout(comment),center={x:comment.x+w/2,y:comment.y+h/2};
  return machine.states.filter(s=>commentNodeIds(comment).includes(s.id)).flatMap(s=>{
   const dx=s.x-center.x,dy=s.y-center.y,length=Math.hypot(dx,dy),t=Math.min(dx?w/2/Math.abs(dx):Infinity,dy?h/2/Math.abs(dy):Infinity);
   if(!length||t>=1-36/length)return [];
   return [{commentId:comment.id,nodeId:s.id,from:{x:center.x+dx*t,y:center.y+dy*t},to:{x:s.x-dx*36/length,y:s.y-dy*36/length}}];
  });
 });
}

export const commentLinkKey=(commentId,nodeId)=>JSON.stringify([commentId,nodeId]);
export function connectCommentNode(machine,commentId,nodeId){
 const comment=machine.comments?.find(c=>c.id===commentId);
 if(!comment||!machine.states.some(s=>s.id===nodeId))throw Error('Invalid comment attachment.');
 comment.nodeIds=[...new Set([...commentNodeIds(comment),nodeId])];delete comment.nodeId;
}
export function removeCommentLinks(machine,keys){
 for(const comment of machine.comments??[]){comment.nodeIds=commentNodeIds(comment).filter(id=>!keys.has(commentLinkKey(comment.id,id)));delete comment.nodeId}
}
