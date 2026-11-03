import {simpleTransitionLabel} from './editor-settings.js';

const turn=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const crosses=(a,b,c,d)=>turn(a,b,c)*turn(a,b,d)<-1e-6&&turn(c,d,a)*turn(c,d,b)<-1e-6;
export function boundaryContext(machine,states,edges){
 const nodes=new Map(states.map(s=>[s.id,s])),ghosts=[],placedEdges=edges.filter(e=>!e.outside),sources=[...new Set(edges.filter(e=>e.outside).map(e=>e.from))];
 for(const source of sources){
  const incoming=edges.filter(e=>e.outside&&e.from===source);
  function find(links){
   const targets=[...new Set(links.map(e=>e.to))].map(id=>nodes.get(id)),clearance=Math.max(260,...links.map(e=>simpleTransitionLabel(e).length*7+130));
   const xs=states.map(s=>s.x),ys=states.map(s=>s.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),cx=targets.reduce((sum,s)=>sum+s.x,0)/targets.length,cy=targets.reduce((sum,s)=>sum+s.y,0)/targets.length;
   const candidates=[...new Set([cy,...targets.map(s=>s.y)])].flatMap(y=>[{x:left-clearance,y},{x:right+clearance,y}]);
   for(const x of new Set([cx,...targets.map(s=>s.x)]))candidates.push({x,y:top-clearance},{x,y:bottom+clearance});
   for(const target of targets)for(let i=0;i<16;i++)candidates.push({x:target.x+Math.cos(i*Math.PI/8)*clearance,y:target.y+Math.sin(i*Math.PI/8)*clearance});
   let best;
   candidates.push({x:Math.min(...[...nodes.values()].map(state=>state.x))-clearance,y:cy});
   for(const point of candidates){let bad=0,length=0;
    if([...nodes.values()].some(s=>Math.hypot(s.x-point.x,s.y-point.y)<160))continue;
    for(const target of targets){const dx=target.x-point.x,dy=target.y-point.y,d2=dx*dx+dy*dy;length+=Math.sqrt(d2);
     for(const s of nodes.values()){if(s===target)continue;const t=d2?((s.x-point.x)*dx+(s.y-point.y)*dy)/d2:0;if(t>0&&t<1&&Math.hypot(s.x-point.x-t*dx,s.y-point.y-t*dy)<75)bad++}
     for(const edge of placedEdges){if(edge.from===target.id||edge.to===target.id)continue;const a=nodes.get(edge.from),b=nodes.get(edge.to);if(a&&b&&crosses(point,target,a,b))bad++}
    }
    const alignment=targets.length===1?80*Math.abs(point.y-cy)/Math.max(1,length):0;
    const width=Math.max(right,point.x)-Math.min(left,point.x),height=Math.max(bottom,point.y)-Math.min(top,point.y),score=bad*100000+length+alignment+(width*height-(right-left)*(bottom-top))/1500;
    if(!best||score<best.score)best={...point,bad,score};
   }
   return best;
  }
  const point=find(incoming);
  const ghost={...machine.states.find(s=>s.id===source),x:point.x,y:point.y,outside:true,outsideSource:source,portal:undefined,portalOffset:undefined};
  ghosts.push(ghost);nodes.set(source,ghost);placedEdges.push(...incoming);
 }
 return {states:[...states,...ghosts],edges};
}
