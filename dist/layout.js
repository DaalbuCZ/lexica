import {transitionLabel} from './labels.js?v=16';
import {commentLayout,commentAnchors,positionComments} from './comments.js?v=16';
import {destination,statePortalBox,enablePortal} from './portals.js';
// Each branch owns a vertical band so deeper subtrees never interleave.
export function autoLayout(machine,mode='tree',spacing=1,portals=false) {
 spacing=Number.isFinite(spacing)?Math.max(.35,Math.min(2,spacing)):1;
 if(!machine.states.length)return machine;
 const anchors=commentAnchors(machine);
 if(mode==='spring'){springLayout(machine,spacing);if(portals)portalizeCrossings(machine);positionComments(anchors);return machine}
 const states=new Map(machine.states.map(s=>[s.id,s])),children=new Map(machine.states.map(s=>[s.id,[]])),seen=new Set(),order=[],roots=[],parents=new Map();
 const outgoing=new Map(machine.states.map(s=>[s.id,[]]));
 for(const e of machine.edges){let target;try{target=destination(machine,e)?.id}catch{continue}if(target&&e.from!==target)outgoing.get(e.from)?.push(target)}
 for(const root of [machine.start,...states.keys()]){
  if(!states.has(root)||seen.has(root))continue;
  roots.push(root);const stack=[{id:root,parent:null}];
  while(stack.length){const {id,parent}=stack.pop();if(seen.has(id))continue;seen.add(id);order.push(id);parents.set(id,parent);if(parent!==null)children.get(parent).push(id);for(const next of [...outgoing.get(id)].reverse())if(!seen.has(next))stack.push({id:next,parent:id})}
 }
 // Cross-branch transitions should not span unrelated sibling subtrees.
 const paths=new Map(),related=new Map();
 const pathTo=id=>{if(!paths.has(id)){const path=[];for(let p=id;p!=null;p=parents.get(p))path.push(p);paths.set(id,path.reverse())}return paths.get(id)};
 for(const [from,targets] of outgoing)for(const to of targets){
  const a=pathTo(from),b=pathTo(to);let i=0;while(i<Math.min(a.length,b.length)&&a[i]===b[i])i++;
  if(!i||i===a.length||i===b.length)continue;
  for(const [left,right] of [[a[i],b[i]],[b[i],a[i]]]){if(!related.has(left))related.set(left,new Map());const links=related.get(left);links.set(right,(links.get(right)??0)+1)}
 }
 for(const [parent,branches] of children){
  const positions=new Map(branches.map((id,i)=>[id,i])),placed=new Set(),ordered=[];
  for(const first of branches){const stack=[first];while(stack.length){const id=stack.pop();if(placed.has(id))continue;placed.add(id);ordered.push(id);
   const neighbors=[...(related.get(id)??[])].filter(([next])=>positions.has(next)&&!placed.has(next)).sort((a,b)=>b[1]-a[1]||positions.get(a[0])-positions.get(b[0]));
   for(const [next] of neighbors.reverse())stack.push(next);
  }}
  children.set(parent,ordered);
 }
 const heights=new Map(),gap=60*spacing;
 for(const id of [...order].reverse()){
  const loops=machine.edges.filter(e=>e.from===id&&e.to===id&&e.portal==null).length;
  const own=Math.max(100,(220+Math.max(0,loops-1)*55)*spacing);
  const branches=children.get(id);
  heights.set(id,Math.max(own,branches.reduce((sum,c)=>sum+heights.get(c),0)+Math.max(0,branches.length-1)*gap));
 }
 const step=Math.max(120,Math.max(320,...machine.edges.map(e=>transitionLabel(e).length*7+180),...machine.states.map(s=>Math.max((s.token?.length??0)*7+140,(s.portal?.length??0)*7+280)))*spacing);
 function place(){
 if(mode==='circle'){
  let left=160;
  for(const root of roots){
   const queue=[{id:root,depth:0,start:-Math.PI/2,span:2*Math.PI}],layers=new Map();
   for(let i=0;i<queue.length;i++){
    const item=queue[i],branches=children.get(item.id);item.angle=item.start+item.span/2;
    if(!layers.has(item.depth))layers.set(item.depth,[]);layers.get(item.depth).push(item);
    const weight=branches.reduce((sum,id)=>sum+heights.get(id)+gap,0);let angle=item.start;
    for(const id of branches){const span=item.span*(heights.get(id)+gap)/weight;queue.push({id,depth:item.depth+1,start:angle,span});angle+=span}
   }
   const radii=new Map([[0,0]]);let radius=0;
   for(const [depth,items] of layers){
    if(!depth)continue;
    const angles=items.map(item=>item.angle).sort((a,b)=>a-b);let separation=Infinity;
    if(angles.length>1)for(let i=0;i<angles.length;i++)separation=Math.min(separation,(angles[(i+1)%angles.length]-angles[i]+2*Math.PI)%(2*Math.PI));
    radius=Math.max(radius+step,Number.isFinite(separation)?step/(2*Math.sin(separation/2)):0);radii.set(depth,radius);
   }
   const center={x:left+radius,y:160+radius};
   for(const item of queue){const s=states.get(item.id),r=radii.get(item.depth);s.x=center.x+r*Math.cos(item.angle);s.y=center.y+r*Math.sin(item.angle)}
   left+=radius*2+step;
  }
  return;
 }
 let forestTop=100;
 for(const root of roots){
  const queue=[{id:root,depth:0,top:forestTop}];
  for(let i=0;i<queue.length;i++){
   const {id,depth,top}=queue[i],s=states.get(id),branches=children.get(id);
   s.x=160+depth*step;s.y=top+heights.get(id)/2;
   const childHeight=branches.reduce((sum,c)=>sum+heights.get(c),0)+Math.max(0,branches.length-1)*gap;
   let childTop=top+(heights.get(id)-childHeight)/2;
   for(const child of branches){queue.push({id:child,depth:depth+1,top:childTop});childTop+=heights.get(child)+gap}
  }
  forestTop+=heights.get(root)+120*spacing;
 }
 }
 place();
 if(portals)portalizeCrossings(machine);
 positionComments(anchors);
 return machine;
}
export function springSubtrees(machine){
 const children=new Map(machine.states.map(s=>[s.id,[]])),outgoing=new Map(machine.states.map(s=>[s.id,[]])),seen=new Set(),edges=[];
 for(const e of machine.edges){let target;try{target=destination(machine,e)?.id}catch{continue}if(target&&target!==e.from&&outgoing.has(e.from)){outgoing.get(e.from).push(target);edges.push([e.from,target])}}
 for(const root of [machine.start,...children.keys()]){
  if(!children.has(root)||seen.has(root))continue;const stack=[{id:root,parent:null}];
  while(stack.length){const {id,parent}=stack.pop();if(seen.has(id))continue;seen.add(id);if(parent!==null)children.get(parent).push(id);for(const next of [...outgoing.get(id)].reverse())if(!seen.has(next))stack.push({id:next,parent:id})}
 }
 const descendants=id=>{const result=[],stack=[id];while(stack.length){const next=stack.pop();result.push(next);stack.push(...children.get(next))}return result};
 return [...children].filter(([,branches])=>branches.length>1).map(([parent,branches])=>{
  const groups=branches.map(descendants),owner=new Map(groups.flatMap((ids,i)=>ids.map(id=>[id,i]))),interactions=groups.map(()=>groups.map(()=>0));
  for(const [from,to] of edges){const a=owner.get(from),b=owner.get(to);if(a!==undefined&&b!==undefined&&a!==b){interactions[a][b]++;interactions[b][a]++}}
  return {parent,groups,interactions};
 });
}

export function springLayout(machine,spacing=1){
 const anchors=commentAnchors(machine),starts=['tree','circle'].map(mode=>new Map(autoLayout(structuredClone(machine),mode,spacing).states.map(s=>[s.id,{x:s.x,y:s.y}])));
 const states=new Map(machine.states.map(s=>[s.id,s])),neighbors=new Map(machine.states.map(s=>[s.id,[]]));
 const ideal=Math.max(130,320*spacing),links=[];
 for(const e of machine.edges){let to;try{to=destination(machine,e)}catch{continue}const from=states.get(e.from);if(!from||!to||from===to)continue;links.push({from,to,length:Math.max(ideal,transitionLabel(e).length*7+90)});neighbors.get(from.id).push(to.id);neighbors.get(to.id).push(from.id)}
 const seen=new Set(),components=[];
 for(const root of [machine.start,...[...states.keys()].sort()]){
  if(!states.has(root)||seen.has(root))continue;const ids=[root];seen.add(root);
  for(let i=0;i<ids.length;i++)for(const next of neighbors.get(ids[i]))if(!seen.has(next)){seen.add(next);ids.push(next)}
  const nodes=ids.map(id=>states.get(id));components.push({nodes,links:links.filter(e=>ids.includes(e.from.id))});
 }
 const hierarchy=springSubtrees(machine);
 const looped=new Set(machine.edges.filter(e=>e.portal==null&&e.from===e.to).map(e=>e.from));
 const radius=s=>Math.max(Math.max(88,160*spacing)/2,looped.has(s.id)?100:0,s.portal?80:0,s.token?Math.max(65,s.token.length*3.5):0);
 let best=null;
 // Try eight deterministic starting arrangements; prefer fewer crossings, then shorter links.
 for(let seed=0;seed<8;seed++){
  let left=160;
  for(const component of components){
   const nodes=component.nodes,index=new Map(nodes.map((s,i)=>[s.id,i]));
   const families=hierarchy.filter(h=>index.has(h.parent)).map(h=>({...h,groups:h.groups.map(ids=>ids.map(id=>index.get(id)))}));
   const initial=starts[seed],origin=initial?.get(nodes[0].id);
   nodes.forEach((s,i)=>{if(initial){const p=initial.get(s.id);s.x=p.x-origin.x;s.y=p.y-origin.y}else{const angle=i*(2.3999632297+(seed-2)*.51),r=i?ideal*Math.sqrt(i):0;s.x=Math.cos(angle)*r;s.y=Math.sin(angle)*r}});
   for(let iteration=0;iteration<320;iteration++){
    const forces=nodes.map(()=>({x:0,y:0}));
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
     const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.01){dx=1;dy=0;d=1}
     const minimum=radius(a)+radius(b),repel=ideal*ideal*5/(d*d)+Math.max(0,minimum-d)*.8,fx=dx/d*repel,fy=dy/d*repel;
     forces[i].x-=fx;forces[i].y-=fy;forces[j].x+=fx;forces[j].y+=fy;
    }
    for(const e of component.links){const dx=e.to.x-e.from.x,dy=e.to.y-e.from.y,d=Math.hypot(dx,dy)||1,force=(d-e.length)*.08,fx=dx/d*force,fy=dy/d*force,a=index.get(e.from.id),b=index.get(e.to.id);forces[a].x+=fx;forces[a].y+=fy;forces[b].x-=fx;forces[b].y-=fy}
    // Translate each subtree together: interacting siblings attract, unrelated siblings repel.
    for(const family of families){
     const centers=family.groups.map(group=>{const x=group.reduce((n,i)=>n+nodes[i].x,0)/group.length,y=group.reduce((n,i)=>n+nodes[i].y,0)/group.length;return {x,y,radius:Math.sqrt(group.reduce((n,i)=>n+(nodes[i].x-x)**2+(nodes[i].y-y)**2,0)/group.length)+group.reduce((n,i)=>n+radius(nodes[i]),0)/group.length}});
     for(let a=0;a<centers.length;a++)for(let b=a+1;b<centers.length;b++){
      const p=centers[a],q=centers[b];let dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);if(d<.01){dx=Math.cos(a+b+seed);dy=Math.sin(a+b+seed);d=1}
      const weight=family.interactions[a][b],rest=p.radius+q.radius+ideal*(weight?0.65:1.3),force=(weight?(d-rest)*.055*Math.sqrt(weight):-ideal*ideal*8/(d*d)-Math.max(0,rest-d)*.25)/Math.sqrt(centers.length);
      const fx=dx/d*force,fy=dy/d*force;
      for(const i of family.groups[a]){forces[i].x+=fx;forces[i].y+=fy}for(const i of family.groups[b]){forces[i].x-=fx;forces[i].y-=fy}
     }
     for(let g=0;g<family.groups.length;g++)if(family.groups[g].length>1)for(const i of family.groups[g]){forces[i].x+=(centers[g].x-nodes[i].x)*.006;forces[i].y+=(centers[g].y-nodes[i].y)*.006}
    }
    const temperature=ideal*.25*(1-iteration/320)**2+.1;
    for(let i=1;i<nodes.length;i++){const s=nodes[i],f=forces[i];f.x-=s.x*.001;f.y-=s.y*.001;const scale=Math.min(1,temperature/(Math.hypot(f.x,f.y)||1));s.x+=f.x*scale;s.y+=f.y*scale}
   }
   // Resolve residual collisions after the cooled simulation without changing graph topology.
   for(let pass=0;pass<200;pass++){
    let overlap=false;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
     const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.01){dx=1;dy=0;d=1}const minimum=radius(a)+radius(b)+1;if(d>=minimum)continue;
     overlap=true;const shift=(minimum-d)/2+.01;a.x-=dx/d*shift;a.y-=dy/d*shift;b.x+=dx/d*shift;b.y+=dy/d*shift;
    }
    if(!overlap)break;
   }
   const minX=Math.min(...nodes.map(s=>s.x-radius(s))),minY=Math.min(...nodes.map(s=>s.y-radius(s)));
   for(const s of nodes){s.x+=left-minX;s.y+=120-minY}
   left=Math.max(...nodes.map(s=>s.x+radius(s)))+ideal;
  }
  positionComments(anchors);
  const crossings=crossingPairs(machine,true).length,length=routeEdges(machine).reduce((sum,e)=>sum+Math.hypot(e.c1.x-e.p0.x,e.c1.y-e.p0.y)+Math.hypot(e.c2.x-e.c1.x,e.c2.y-e.c1.y)+Math.hypot(e.p3.x-e.c2.x,e.p3.y-e.c2.y),0);
  if(!best||crossings<best.crossings||crossings===best.crossings&&length<best.length)best={crossings,length,positions:machine.states.map(s=>({x:s.x,y:s.y}))};
 }
 if(best)machine.states.forEach((s,i)=>Object.assign(s,best.positions[i]));
 positionComments(anchors);
 return machine;
}
function portalizeCrossings(machine){
 for(let attempts=0;attempts<machine.edges.length;attempts++){
  const pairs=crossingPairs(machine,true);if(!pairs.length)break;
  const counts=new Map();for(const pair of pairs)for(const i of pair)counts.set(i,(counts.get(i)??0)+1);
  const index=[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];enablePortal(machine,machine.edges[index]);
 }
}

function visibleSegments(machine){
 const states=new Map(machine.states.map(s=>[s.id,s]));
 return machine.edges.flatMap((e,i)=>e.portal==null&&e.from!==e.to&&states.has(e.from)&&states.has(e.to)?[{i,a:states.get(e.from),b:states.get(e.to)}]:[]);
}
function intersects(a,b,c,d){
 const turn=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 return turn(a,b,c)*turn(a,b,d)<-1e-8&&turn(c,d,a)*turn(c,d,b)<-1e-8;
}
export function crossingPairs(machine,routed=false){
 const segments=visibleSegments(machine),pairs=[],routes=routed?routeEdges(machine):null,paths=routed?new Map(segments.map(e=>[e.i,Array.from({length:17},(_,i)=>sample(routes[e.i],i/16))])):null;
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];if(a.a===b.a||a.a===b.b||a.b===b.a||a.b===b.b)continue;
  let crossing=false;
  if(paths){const p=paths.get(a.i),q=paths.get(b.i);for(let u=1;u<p.length&&!crossing;u++)for(let v=1;v<q.length;v++)if(intersects(p[u-1],p[u],q[v-1],q[v])){crossing=true;break}}
  else crossing=intersects(a.a,a.b,b.a,b.b);
  if(crossing)pairs.push([a.i,b.i]);
 }
 return pairs;
}
const at=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function sample(c,t){const a=at(c.p0,c.c1,t),b=at(c.c1,c.c2,t),d=at(c.c2,c.p3,t);return at(at(a,b,t),at(b,d,t),t)}
function overlaps(a,b){return Math.abs(a.x-b.x)<(a.w+b.w)/2+8&&Math.abs(a.y-b.y)<(a.h+b.h)/2+8}
const routeCache=new Map();
export function routeEdges(machine){
 const key=JSON.stringify([machine.states,machine.edges,machine.comments]);
 if(routeCache.has(key))return routeCache.get(key);
 const routes=computeRoutes(machine);routeCache.set(key,routes);
 if(routeCache.size>4)routeCache.delete(routeCache.keys().next().value);
 return routes;
}
function computeRoutes(machine){
 const reserved=machine.states.flatMap(s=>[{x:s.x,y:s.y,w:90,h:90},...(s.portal?[statePortalBox(s)]:[]),...(s.token?[{x:s.x,y:s.y+57,w:Math.max(70,s.token.length*7),h:20}]:[])]),routes=[];
 for(const c of machine.comments??[]){const size=commentLayout(c);reserved.push({x:c.x+size.w/2,y:c.y+size.h/2,w:size.w,h:size.h})}
 const segments=machine.edges.filter(e=>e.from!==e.to&&e.portal==null).map(e=>{const from=machine.states.find(s=>s.id===e.from),to=machine.states.find(s=>s.id===e.to),dx=to.x-from.x,dy=to.y-from.y;return {from,dx,dy,length:dx*dx+dy*dy}});
 const ordered=machine.edges.map((e,i)=>({e,i})).sort((a,b)=>(a.e.from!==a.e.to)-(b.e.from!==b.e.to));
 for(const {e,i} of ordered){const a=machine.states.find(s=>s.id===e.from),b=machine.states.find(s=>s.id===e.to);if(e.portal!=null){const siblings=machine.edges.filter(x=>x.from===e.from&&x.portal!=null),fan=(siblings.indexOf(e)-(siblings.length-1)/2)*85,width=Math.max(60,e.portal.length*7+20);let best,bestScore=Infinity;for(const [dx,dy] of [[140,fan],[-140,fan],[110,fan-115],[-110,fan-115],[110,fan+115],[-110,fan+115]]){const len=Math.hypot(dx,dy),p0={x:a.x+dx/len*37,y:a.y+dy/len*37},p3={x:a.x+dx,y:a.y+dy},c={p0,p3,c1:at(p0,p3,1/3),c2:at(p0,p3,2/3)};const center=sample(c,.5);c.label={x:center.x,y:center.y-13,w:transitionLabel(e).length*7+14,h:22};c.portalBox={x:p3.x+(dx<0?-width/2:width/2),y:p3.y,w:width,h:22};let score=0;for(const box of reserved){if(overlaps(c.label,box))score+=1000;if(overlaps(c.portalBox,box))score+=1000}if(score<bestScore){best=c;bestScore=score}}best.d=`M ${best.p0.x} ${best.p0.y} C ${best.c1.x} ${best.c1.y}, ${best.c2.x} ${best.c2.y}, ${best.p3.x} ${best.p3.y}`;routes[i]=best;reserved.push(best.label,best.portalBox);continue}
 let best,bestScore=Infinity;
 const loop=a===b,rotation=loop?[...a.id].reduce((n,ch)=>n+ch.codePointAt(0),0)%4:0;
 for(let attempt=0;attempt<(loop?64:61);attempt++){
 let c;if(a===b){const size=80+Math.floor(attempt/4)*25,angle=((attempt%4+rotation)%4)*Math.PI/2;const rotate=(x,y)=>({x:a.x+x*Math.cos(angle)-y*Math.sin(angle),y:a.y+x*Math.sin(angle)+y*Math.cos(angle)});c={p0:rotate(-22,-29),c1:rotate(-size,-size*1.45),c2:rotate(size,-size*1.45),p3:rotate(22,-29)}}else{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;const reverse=machine.edges.some(x=>x.from===e.to&&x.to===e.from);const bend=(attempt===0?0:Math.ceil(attempt/2)*65*(attempt%2?1:-1))+(reverse?45:0);const mid={x:(a.x+b.x)/2-uy*bend,y:(a.y+b.y)/2+ux*bend};const startAngle=Math.atan2(mid.y-a.y,mid.x-a.x),endAngle=Math.atan2(mid.y-b.y,mid.x-b.x);const p0={x:a.x+Math.cos(startAngle)*37,y:a.y+Math.sin(startAngle)*37},p3={x:b.x+Math.cos(endAngle)*42,y:b.y+Math.sin(endAngle)*42};c={p0,p3,c1:at(p0,mid,2/3),c2:at(p3,mid,2/3)}}
 const center=sample(c,.5);c.label={x:center.x,y:center.y-13,w:transitionLabel(e).length*7+14,h:22};let score=(loop?Math.floor(attempt/4):attempt)*.1;
 for(const box of reserved)if(overlaps(c.label,box))score+=1000;
 for(let t=.04;t<.98&&score<bestScore;t+=.03){const p=sample(c,t);for(const s of machine.states)if(s!==a&&s!==b&&(p.x-s.x)**2+(p.y-s.y)**2<65**2)score+=10000}
 if(loop)for(let t=.1;t<.95&&score<bestScore;t+=.05){const p=sample(c,t);if((p.x-a.x)**2+(p.y-a.y)**2<48**2)continue;for(const {from,dx,dy,length} of segments){if(!length)continue;const u=Math.max(0,Math.min(1,((p.x-from.x)*dx+(p.y-from.y)*dy)/length));if((p.x-from.x-u*dx)**2+(p.y-from.y-u*dy)**2<14**2)score+=200}}
 if(score<bestScore){best=c;bestScore=score}if(!loop&&score<1||loop&&attempt%4===3&&bestScore<=(Math.floor(attempt/4)+1)*.1)break;
 }
 best.d=`M ${best.p0.x} ${best.p0.y} C ${best.c1.x} ${best.c1.y}, ${best.c2.x} ${best.c2.y}, ${best.p3.x} ${best.p3.y}`;routes[i]=best;reserved.push(best.label);
 }
 return routes;
}
