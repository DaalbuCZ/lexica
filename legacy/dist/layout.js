// Layered layout reserves space for state circles, token labels, and self loops.
export function autoLayout(machine) {
 const root=machine.start??machine.states[0].id,levels=new Map([[root,0]]),queue=[root];
 for(let i=0;i<queue.length;i++)for(const e of machine.edges){if(e.from===queue[i]&&!levels.has(e.to)){levels.set(e.to,levels.get(e.from)+1);queue.push(e.to)}}
 let last=Math.max(...levels.values());for(const s of machine.states)if(!levels.has(s.id))levels.set(s.id,++last);
 const columns=new Map();for(const s of machine.states){const rank=levels.get(s.id);if(!columns.has(rank))columns.set(rank,[]);columns.get(rank).push(s)}
 const height=Math.max(...[...columns.values()].map(c=>c.length))*160;
 for(const [rank,states] of columns)states.forEach((s,i)=>{s.x=160+rank*220;s.y=150+(height-states.length*160)/2+i*160});
 return machine;
}
const at=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function sample(c,t){const a=at(c.p0,c.c1,t),b=at(c.c1,c.c2,t),d=at(c.c2,c.p3,t);return at(at(a,b,t),at(b,d,t),t)}
function overlaps(a,b){return Math.abs(a.x-b.x)<(a.w+b.w)/2+8&&Math.abs(a.y-b.y)<(a.h+b.h)/2+8}
export function routeEdges(machine){
 const reserved=machine.states.flatMap(s=>[{x:s.x,y:s.y,w:90,h:90},...(s.token?[{x:s.x,y:s.y+57,w:Math.max(70,s.token.length*7),h:20}]:[])]),routes=[];
 const ordered=machine.edges.map((e,i)=>({e,i})).sort((a,b)=>(a.e.from!==a.e.to)-(b.e.from!==b.e.to));
 for(const {e,i} of ordered){const a=machine.states.find(s=>s.id===e.from),b=machine.states.find(s=>s.id===e.to);let best,bestScore=Infinity;
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
