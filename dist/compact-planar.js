import {drawingClearance} from './planar-layout.js';

// Compact an already valid embedding. Every accepted move must preserve both
// planarity and clearance; no unconstrained force pass can destroy the solution.
export function compactPlanar(machine,positions,forward=false){
 const states=machine.states.map(s=>({...s,...positions.get(s.id)})),nodes=new Map(states.map(s=>[s.id,s])),neighbors=new Map(states.map(s=>[s.id,new Set()]));
 for(const e of machine.edges)if(e.from!==e.to&&nodes.has(e.from)&&nodes.has(e.to)){neighbors.get(e.from).add(e.to);neighbors.get(e.to).add(e.from)}
 const directions=new Set(machine.edges.map(e=>JSON.stringify([e.from,e.to])));
 const flowEdges=machine.edges.filter(e=>e.from!==e.to&&!directions.has(JSON.stringify([e.to,e.from])));
 const valid=()=>{const c=drawingClearance(states,machine.edges);return !c.crossings&&c.node>=175&&c.wire>=68};
 const cost=()=>{const xs=states.map(s=>s.x),ys=states.map(s=>s.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);let length=0;for(const [id,links] of neighbors)for(const to of links)if(id<to){const a=nodes.get(id),b=nodes.get(to);length+=Math.hypot(a.x-b.x,a.y-b.y)}let backtrack=0;if(forward)for(const e of flowEdges){const a=nodes.get(e.from),b=nodes.get(e.to);if(a&&b)backtrack+=Math.max(0,170-b.x+a.x)+Math.abs(b.y-a.y)*.22}return Math.sqrt(w*h)+.3*length+.2*(w+h)+backtrack};
 if(!valid())return states;
 let best=cost();
 for(let pass=0;pass<18;pass++){let changed=false;
  for(const state of states){if(state.id===machine.start)continue;const links=[...neighbors.get(state.id)].map(id=>nodes.get(id));if(!links.length)continue;
   const cx=links.reduce((sum,s)=>sum+s.x,0)/links.length,cy=links.reduce((sum,s)=>sum+s.y,0)/links.length;
   const targets=[{x:cx,y:cy},...links.flatMap(s=>[{x:s.x,y:state.y},{x:state.x,y:s.y}])];
   for(const target of targets)for(const fraction of [.65,.3]){const x=state.x,y=state.y;state.x+=(target.x-x)*fraction;state.y+=(target.y-y)*fraction;const next=cost();if(next<best-.01&&valid()){best=next;changed=true}else{state.x=x;state.y=y}}
  }
  // Pull whole strips inward as well: an empty span can be blocked if its
  // endpoints are moved one at a time, even though moving both is safe.
  for(const axis of ['x','y']){
   const sorted=[...states].sort((a,b)=>a[axis]-b[axis]);
   for(let i=1;i<sorted.length;i++){
    const gap=sorted[i][axis]-sorted[i-1][axis],strip=sorted.slice(i);if(gap<35||strip.some(s=>s.id===machine.start))continue;
    for(const fraction of [.65,.25]){const delta=gap*fraction,previous=strip.map(s=>s[axis]);for(const s of strip)s[axis]-=delta;const next=cost();if(next<best-.01&&valid()){best=next;changed=true;break}strip.forEach((s,j)=>s[axis]=previous[j])}
   }
  }
  if(!changed)break;
 }
 return states;
}
