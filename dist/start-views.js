import {destination} from './portals.js';
export function visualMachine(machine){
 const root=machine.states.find(s=>s.id===machine.start);if(machine.states.some(s=>s.startView!==undefined)||!root||!machine.startViews?.length)return machine;
 const used=new Set(machine.states.map(s=>s.id));
 const aliases=machine.startViews.map((view,i)=>{let id=`${root.id}:view:${i}`;while(used.has(id))id+=':';used.add(id);return {...root,id,name:root.name+' ↔',portal:undefined,portalOffset:undefined,x:view.x,y:view.y,startView:i}});
 const edges=machine.edges.map(edge=>{if(edge.from!==root.id&&edge.to!==root.id)return edge;let target;try{target=destination(machine,edge)?.id}catch{}const index=machine.startViews.findIndex(v=>v.targets.includes(edge.from===root.id?target:edge.from));return index<0?edge:{...edge,from:edge.from===root.id?aliases[index].id:edge.from,to:edge.to===root.id?aliases[index].id:edge.to}});
 return {...machine,states:[...machine.states.map(s=>s.id===root.id?{...s,name:s.name+' ↔'}:s),...aliases],edges};
}
export function startGroups(machine){
 const ids=new Set(machine.states.filter(s=>s.id!==machine.start).map(s=>s.id)),neighbors=new Map([...ids].map(id=>[id,[]]));
 for(const edge of machine.edges){let to;try{to=destination(machine,edge)?.id}catch{continue}if(ids.has(edge.from)&&ids.has(to)){neighbors.get(edge.from).push(to);neighbors.get(to).push(edge.from)}}
 const groups=[];for(const id of ids){if(!ids.has(id))continue;const group=[],queue=[id];ids.delete(id);while(queue.length){const next=queue.pop();group.push(next);for(const n of neighbors.get(next))if(ids.delete(n))queue.push(n)}groups.push(group)}
 const fanout=group=>machine.edges.filter(e=>e.from===machine.start&&group.includes(e.to)).length;
 const packed=[];for(const group of groups){const shared=packed.find(existing=>existing.length+group.length<=12&&fanout(existing)+fanout(group)<=6);if(shared)shared.push(...group);else packed.push(group)}return packed;
}
