import {commentLinks,commentLinkKey} from './comments.js?v=16';
function attribute(element,name,value){value=String(value);if(element.getAttribute(name)!==value)element.setAttribute(name,value)}

// Keep the routed curves while dragging; resolve collisions again on release.
export function captureDragGeometry(machine,routes){
 return {routes,states:new Map(machine.states.map(s=>[s.id,{x:s.x,y:s.y}])),bindings:null};
}
export function updateDragGeometry(root,machine,snapshot){
 if(!snapshot.bindings)snapshot.bindings={nodes:[...root.querySelectorAll('[data-node]')],edges:[...root.querySelectorAll('[data-edge]')],comments:[...root.querySelectorAll('[data-comment]')],links:[...root.querySelectorAll('[data-comment-link]')]};
 const nodes=new Map(machine.states.map(s=>[s.id,s])),comments=new Map((machine.comments??[]).map(c=>[c.id,c]));
 const delta=id=>{const a=snapshot.states.get(id),b=nodes.get(id);return a&&b?{x:b.x-a.x,y:b.y-a.y}:{x:0,y:0}};
 for(const node of snapshot.bindings.nodes){const s=nodes.get(node.dataset.node);attribute(node,'transform',`translate(${s.x} ${s.y})`)}
 for(const group of snapshot.bindings.edges){const index=+group.dataset.edge,e=machine.edges[index],r=snapshot.routes[index],a=delta(e.from),b=e.portal!=null?a:delta(e.to);
  const shift=(p,t)=>({x:p.x+a.x*(1-t)+b.x*t,y:p.y+a.y*(1-t)+b.y*t}),p0=shift(r.p0,0),p3=shift(r.p3,1),c1=shift(r.c1,1/3),c2=shift(r.c2,2/3),d=`M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p3.x} ${p3.y}`;
  for(const path of group.querySelectorAll('.edge,.edge-hit'))attribute(path,'d',d);
  const x=r.label.x+(a.x+b.x)/2,y=r.label.y+(a.y+b.y)/2,text=group.querySelector('.edge-text'),box=group.querySelector('.edge-label-box');
  if(text){attribute(text,'x',x);attribute(text,'y',y)}if(box){attribute(box,'x',x-r.label.w/2);attribute(box,'y',y-15)}
  const portal=group.querySelector('.portal');if(portal)attribute(portal,'transform',`translate(${a.x} ${a.y})`);
 }
 for(const group of snapshot.bindings.comments){const c=comments.get(group.dataset.comment);attribute(group,'transform',`translate(${c.x} ${c.y})`)}
 const links=new Map(commentLinks(machine).map(link=>[commentLinkKey(link.commentId,link.nodeId),link]));
 for(const group of snapshot.bindings.links){const link=links.get(group.dataset.commentLink);if(!link)continue;const d=`M ${link.from.x} ${link.from.y} L ${link.to.x} ${link.to.y}`;for(const path of group.querySelectorAll('path'))attribute(path,'d',d)}
}
