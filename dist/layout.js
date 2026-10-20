import {commentLayout} from './comments.js';
import {destination,statePortalBox} from './portals.js';
// Each branch owns a vertical band so deeper subtrees never interleave.
export function autoLayout(machine) {
 if(!machine.states.length)return machine;
 const states=new Map(machine.states.map(s=>[s.id,s])),children=new Map(machine.states.map(s=>[s.id,[]])),seen=new Set(),order=[],roots=[];
 const outgoing=new Map(machine.states.map(s=>[s.id,[]]));
 for(const e of machine.edges){let target;try{target=destination(machine,e)?.id}catch{continue}if(target&&e.from!==target)outgoing.get(e.from)?.push(target)}
 for(const root of [machine.start,...states.keys()]){
  if(!states.has(root)||seen.has(root))continue;
  roots.push(root);seen.add(root);const queue=[root];
  for(let i=0;i<queue.length;i++){const id=queue[i];order.push(id);for(const next of outgoing.get(id))if(!seen.has(next)){seen.add(next);children.get(id).push(next);queue.push(next)}}
 }
 const heights=new Map(),gap=60;
 for(const id of [...order].reverse()){
  const loops=machine.edges.filter(e=>e.from===id&&e.to===id&&e.portal==null).length;
  const own=220+Math.max(0,loops-1)*55;
  const branches=children.get(id);
  heights.set(id,Math.max(own,branches.reduce((sum,c)=>sum+heights.get(c),0)+Math.max(0,branches.length-1)*gap));
 }
 const step=Math.max(320,...machine.edges.map(e=>e.label.length*7+180),...machine.states.map(s=>Math.max((s.token?.length??0)*7+140,(s.portal?.length??0)*7+280)));
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
  forestTop+=heights.get(root)+120;
 }
 let noteTop=forestTop+40;
 for(const c of machine.comments??[]){c.x=160;c.y=noteTop;noteTop+=commentLayout(c).h+40}
 return machine;
}
const at=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function sample(c,t){const a=at(c.p0,c.c1,t),b=at(c.c1,c.c2,t),d=at(c.c2,c.p3,t);return at(at(a,b,t),at(b,d,t),t)}
function overlaps(a,b){return Math.abs(a.x-b.x)<(a.w+b.w)/2+8&&Math.abs(a.y-b.y)<(a.h+b.h)/2+8}
export function routeEdges(machine){
 const reserved=machine.states.flatMap(s=>[{x:s.x,y:s.y,w:90,h:90},...(s.portal?[statePortalBox(s)]:[]),...(s.token?[{x:s.x,y:s.y+57,w:Math.max(70,s.token.length*7),h:20}]:[])]),routes=[];
 for(const c of machine.comments??[]){const size=commentLayout(c);reserved.push({x:c.x+size.w/2,y:c.y+size.h/2,w:size.w,h:size.h})}
 const ordered=machine.edges.map((e,i)=>({e,i})).sort((a,b)=>(a.e.from!==a.e.to)-(b.e.from!==b.e.to));
 for(const {e,i} of ordered){const a=machine.states.find(s=>s.id===e.from),b=machine.states.find(s=>s.id===e.to);if(e.portal!=null){const siblings=machine.edges.filter(x=>x.from===e.from&&x.portal!=null),fan=(siblings.indexOf(e)-(siblings.length-1)/2)*85,width=Math.max(60,e.portal.length*7+20);let best,bestScore=Infinity;for(const [dx,dy] of [[140,fan],[-140,fan],[110,fan-115],[-110,fan-115],[110,fan+115],[-110,fan+115]]){const len=Math.hypot(dx,dy),p0={x:a.x+dx/len*37,y:a.y+dy/len*37},p3={x:a.x+dx,y:a.y+dy},c={p0,p3,c1:at(p0,p3,1/3),c2:at(p0,p3,2/3)};const center=sample(c,.5);c.label={x:center.x,y:center.y-13,w:e.label.length*7+14,h:22};c.portalBox={x:p3.x+(dx<0?-width/2:width/2),y:p3.y,w:width,h:22};let score=0;for(const box of reserved){if(overlaps(c.label,box))score+=1000;if(overlaps(c.portalBox,box))score+=1000}if(score<bestScore){best=c;bestScore=score}}best.d=`M ${best.p0.x} ${best.p0.y} C ${best.c1.x} ${best.c1.y}, ${best.c2.x} ${best.c2.y}, ${best.p3.x} ${best.p3.y}`;routes[i]=best;reserved.push(best.label,best.portalBox);continue}
 let best,bestScore=Infinity;
 for(let attempt=0;attempt<31;attempt++){
 let c;if(a===b){const size=80+Math.floor(attempt/4)*25,angle=(attempt%4)*Math.PI/2;const rotate=(x,y)=>({x:a.x+x*Math.cos(angle)-y*Math.sin(angle),y:a.y+x*Math.sin(angle)+y*Math.cos(angle)});c={p0:rotate(-22,-29),c1:rotate(-size,-size*1.45),c2:rotate(size,-size*1.45),p3:rotate(22,-29)}}else{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;const reverse=machine.edges.some(x=>x.from===e.to&&x.to===e.from);const bend=(attempt===0?0:Math.ceil(attempt/2)*65*(attempt%2?1:-1))+(reverse?45:0);const mid={x:(a.x+b.x)/2-uy*bend,y:(a.y+b.y)/2+ux*bend};const startAngle=Math.atan2(mid.y-a.y,mid.x-a.x),endAngle=Math.atan2(mid.y-b.y,mid.x-b.x);const p0={x:a.x+Math.cos(startAngle)*37,y:a.y+Math.sin(startAngle)*37},p3={x:b.x+Math.cos(endAngle)*42,y:b.y+Math.sin(endAngle)*42};c={p0,p3,c1:at(p0,mid,2/3),c2:at(p3,mid,2/3)}}
 const center=sample(c,.5);c.label={x:center.x,y:center.y-13,w:e.label.length*7+14,h:22};let score=attempt*.1;
 for(const box of reserved)if(overlaps(c.label,box))score+=1000;
 for(let t=.12;t<.9;t+=.08){const p=sample(c,t);for(const s of machine.states)if(s!==a&&s!==b&&Math.hypot(p.x-s.x,p.y-s.y)<65)score+=500}
 if(score<bestScore){best=c;bestScore=score}if(score<1)break;
 }
 best.d=`M ${best.p0.x} ${best.p0.y} C ${best.c1.x} ${best.c1.y}, ${best.c2.x} ${best.c2.y}, ${best.p3.x} ${best.p3.y}`;routes[i]=best;reserved.push(best.label);
 }
 return routes;
}
