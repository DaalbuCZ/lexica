// Merge subtree contours instead of reserving the full height at every depth.
export function tidyTree(machine,spacing=.75){
 spacing=Number.isFinite(spacing)?Math.max(.35,Math.min(2,spacing)):.75;
 const nodes=new Map(machine.states.map(s=>[s.id,s])),children=new Map(machine.states.map(s=>[s.id,[]])),outgoing=new Map(machine.states.map(s=>[s.id,[]])),seen=new Set(),roots=[],order=[];
 for(const e of machine.edges)if(e.from!==e.to&&nodes.has(e.to))outgoing.get(e.from)?.push(e.to);
 for(const root of [machine.start,...nodes.keys()]){if(!nodes.has(root)||seen.has(root))continue;roots.push(root);const stack=[{id:root,parent:null}];while(stack.length){const {id,parent}=stack.pop();if(seen.has(id))continue;seen.add(id);order.push(id);if(parent!==null)children.get(parent).push(id);for(const id2 of [...outgoing.get(id)].reverse())if(!seen.has(id2))stack.push({id:id2,parent:id})}}
 const gap=Math.max(170,240*spacing),step=Math.max(220,Math.min(420,Math.max(320,...machine.edges.map(e=>(e.label?.length??0)*7+140)))*spacing),trees=new Map();
 for(const id of [...order].reverse()){
  const points=[],contour=[],centers=[];
  for(const child of children.get(id)){const tree=trees.get(child);let offset=0;for(let d=0;d<tree.contour.length;d++)if(contour[d])offset=Math.max(offset,contour[d].max+gap-tree.contour[d].min);
   centers.push(offset);for(const p of tree.points)points.push({...p,depth:p.depth+1,y:p.y+offset});for(let d=0;d<tree.contour.length;d++){const c=tree.contour[d],previous=contour[d];contour[d]={min:Math.min(previous?.min??Infinity,c.min+offset),max:Math.max(previous?.max??-Infinity,c.max+offset)}}
  }
  const center=centers.length?(centers[0]+centers.at(-1))/2:0;
  for(const p of points)p.y-=center;
  trees.set(id,{points:[{id,depth:0,y:0},...points],contour:[{min:0,max:0},...contour.map(c=>({min:c.min-center,max:c.max-center}))]});
 }
 let top=100;for(const root of roots){const tree=trees.get(root),min=Math.min(...tree.points.map(p=>p.y)),max=Math.max(...tree.points.map(p=>p.y));for(const p of tree.points){const state=nodes.get(p.id);state.x=160+p.depth*step;state.y=top+p.y-min}top+=max-min+gap*1.5}
 return machine;
}

// Breadth-first rings keep direct neighbors around their shared parent. A DFS
// can incorrectly turn a ring with cross-links into one very long branch.
export function radialTree(machine,spacing=.75){
 spacing=Number.isFinite(spacing)?Math.max(.35,Math.min(2,spacing)):.75;
 const nodes=new Map(machine.states.map(s=>[s.id,s])),outgoing=new Map(machine.states.map(s=>[s.id,[]])),seen=new Set();let left=100;
 for(const e of machine.edges)if(e.from!==e.to&&nodes.has(e.to))outgoing.get(e.from)?.push(e.to);
 const gap=Math.max(180,240*spacing),step=Math.max(240,320*spacing);
 for(const root of [machine.start,...nodes.keys()]){
  if(!nodes.has(root)||seen.has(root))continue;const queue=[{id:root,depth:0,children:[]}],items=new Map([[root,queue[0]]]);seen.add(root);
  for(let i=0;i<queue.length;i++)for(const next of outgoing.get(queue[i].id)){if(seen.has(next))continue;seen.add(next);const child={id:next,depth:queue[i].depth+1,children:[]};queue[i].children.push(child);queue.push(child);items.set(next,child)}
  for(const item of [...queue].reverse())item.weight=Math.max(1,item.children.reduce((sum,c)=>sum+c.weight,0));
  queue[0].start=-Math.PI/2;queue[0].span=Math.PI*2;
  for(const item of queue){item.angle=item.start+item.span/2;let angle=item.start;for(const child of item.children){child.start=angle;child.span=item.span*child.weight/item.weight;angle+=child.span}}
  const layers=[];for(const item of queue)(layers[item.depth]??=[]).push(item);let radius=0;
  for(let depth=1;depth<layers.length;depth++){const layer=layers[depth],angles=layer.map(i=>i.angle).sort((a,b)=>a-b);let separation=Math.PI*2;for(let i=0;i<angles.length;i++)separation=Math.min(separation,(angles[(i+1)%angles.length]-angles[i]+Math.PI*2)%(Math.PI*2)||Math.PI*2);
   radius=Math.max(radius+step,layer.length>1?gap/(2*Math.sin(separation/2)):0);for(const item of layer)item.radius=radius;
  }
  const center={x:left+radius,y:100+radius};for(const item of queue){const state=nodes.get(item.id),r=item.radius??0;state.x=center.x+Math.cos(item.angle)*r;state.y=center.y+Math.sin(item.angle)*r}left+=radius*2+step;
 }
 return machine;
}
