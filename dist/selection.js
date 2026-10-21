import {commentNodeIds,commentLinkKey} from './comments.js?v=12';
import {validate} from './lexer.js?v=12';
export function copySelection(machine,stateIds,edgeIndices,commentIds,linkIds=new Set()){
 const ids=new Set(stateIds),notes=new Set(commentIds);
 for(const c of machine.comments??[])for(const id of commentNodeIds(c))if(linkIds.has(commentLinkKey(c.id,id))){ids.add(id);notes.add(c.id)}
 for(const i of edgeIndices){const e=machine.edges[i];if(!e)continue;ids.add(e.from);if(e.portal==null)ids.add(e.to)}
 return structuredClone({kind:'lexica-selection',version:1,start:ids.has(machine.start)?machine.start:null,
  states:machine.states.filter(s=>ids.has(s.id)),
  edges:machine.edges.filter((e,i)=>edgeIndices.has(i)||(ids.has(e.from)&&(e.portal!=null||ids.has(e.to)))),
  comments:(machine.comments??[]).filter(c=>notes.has(c.id)||commentNodeIds(c).some(id=>ids.has(id))).map(({nodeId,...c})=>({...c,nodeIds:commentNodeIds({...c,nodeId}).filter(id=>ids.has(id))}))});
}
export function pasteSelection(machine,fragment,offset={x:40,y:40},idFactory=()=>crypto.randomUUID()){
 if(fragment?.kind!=='lexica-selection'||fragment.version!==1||!Array.isArray(fragment.states)||!Array.isArray(fragment.edges)||!Array.isArray(fragment.comments))throw Error('Clipboard does not contain a Lexica selection.');
 validate({states:fragment.states,edges:fragment.edges,comments:fragment.comments,start:fragment.start});
 const ids=new Map(fragment.states.map(s=>[s.id,idFactory()]));
 const portalNames=new Set(machine.states.map(s=>s.portal).filter(Boolean)),portalMap=new Map();
 for(const s of fragment.states)if(s.portal&&!portalMap.has(s.portal)){let name=s.portal,index=2;while(portalNames.has(name))name=s.portal+'_'+index++;portalNames.add(name);portalMap.set(s.portal,name)}
 const states=fragment.states.map(s=>({...s,id:ids.get(s.id),x:s.x+offset.x,y:s.y+offset.y,...(s.portal?{portal:portalMap.get(s.portal)}:{})}));
 const edges=fragment.edges.map(e=>({...e,from:ids.get(e.from),to:ids.get(e.to)??e.to,...(e.portal!=null?{portal:portalMap.get(e.portal)??e.portal}:{})}));
 const comments=fragment.comments.map(({nodeId,...c})=>({...c,id:idFactory(),x:c.x+offset.x,y:c.y+offset.y,nodeIds:commentNodeIds({...c,nodeId}).map(id=>ids.get(id)).filter(Boolean)}));
 const edgeStart=machine.edges.length;
 const next={...machine,states:[...machine.states,...states],edges:[...machine.edges,...edges],comments:[...(machine.comments??[]),...comments],start:machine.start??ids.get(fragment.start)??null};
 validate(next);
 Object.assign(machine,next);
 return {states:new Set(states.map(s=>s.id)),edges:new Set(edges.map((_,i)=>edgeStart+i)),comments:new Set(comments.map(c=>c.id))};
}
