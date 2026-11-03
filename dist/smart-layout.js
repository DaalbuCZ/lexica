import {autoLayout,crossingPairs} from './layout.js';
import {graphView,createGroup,groupFor} from './groups.js';
import {destination} from './portals.js';
import {commentAnchors,positionComments} from './comments.js';

function place(machine,focus,options){
 const shown=graphView(machine,focus),copy=structuredClone(shown),anchors=commentAnchors(machine);
 if(focus&&!copy.start){const members=new Set(copy.states.map(s=>s.id)),inbound=new Map();for(const edge of machine.edges){let to;try{to=destination(machine,edge)?.id}catch{continue}if(!members.has(edge.from)&&members.has(to))inbound.set(to,(inbound.get(to)??0)+1)}copy.start=[...inbound].sort((a,b)=>b[1]-a[1])[0]?.[0]??copy.states[0]?.id}
 for(const edge of copy.edges)delete edge.bend;
 autoLayout(copy,options.mode??'circle',options.spacing??.75,false,options.forces??{},false);
 untangle(copy);
 for(const edge of shown.edges)if(!edge.summary)delete machine.edges[edge.originalIndex??machine.edges.indexOf(edge)]?.bend;
 const positions=new Map(copy.states.map(s=>[s.id,s]));
 for(const state of shown.states){const next=positions.get(state.id);if(!next)continue;
  if(state.group){const group=machine.groups.find(g=>g.id===state.id),dx=next.x-state.x,dy=next.y-state.y;for(const member of machine.states)if(group.stateIds.includes(member.id)){member.x+=dx;member.y+=dy}}
  else {state.x=next.x;state.y=next.y}
 }
 delete machine.startViews;positionComments(anchors);
}

// Swapping occupied positions preserves node clearance while reducing wire crossings and detours.
export function untangle(machine){
 if(machine.states.length>120)return;
 const byId=new Map(machine.states.map(s=>[s.id,s]));
 const links=machine.edges.filter(e=>e.from!==e.to&&byId.has(e.from)&&byId.has(e.to)).map(e=>[byId.get(e.from),byId.get(e.to)]);
 const score=()=>{let value=crossingPairs(machine).length*10000;for(const [a,b] of links){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;value+=Math.sqrt(length)*.1;for(const s of machine.states){if(s===a||s===b||!length)continue;const t=((s.x-a.x)*dx+(s.y-a.y)*dy)/length;if(t>0&&t<1&&(s.x-a.x-t*dx)**2+(s.y-a.y-t*dy)**2<65**2)value+=20000}}return value};
 let best=score(),evaluations=0;
 for(let pass=0;pass<3;pass++){let changed=false;const pairs=crossingPairs(machine),involved=new Set(pairs.flatMap(pair=>pair.flatMap(i=>[machine.edges[i].from,machine.edges[i].to])));
  if(!involved.size&&pass>0)break;
  for(let i=0;i<machine.states.length;i++)for(let j=i+1;j<machine.states.length;j++){
   const a=machine.states[i],b=machine.states[j];if(a.id===machine.start||b.id===machine.start||(!involved.has(a.id)&&!involved.has(b.id)))continue;
   if(++evaluations>1200)return;
   [a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];const next=score();
   if(next<best-.01){best=next;changed=true}else{[a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y]}
  }if(!changed)break;
 }
}

export function layoutQuality(machine){
 const shown=graphView(machine),xs=shown.states.map(s=>s.x),ys=shown.states.map(s=>s.y);
 const extent=xs.length?Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)):0;
 const crossings=crossingPairs(shown).length;
 return {nodes:shown.states.length,crossings,extent,score:shown.states.length+crossings*4+extent/500};
}

// Remove the shared start hub, then find actual connected branches. Never combine unrelated islands.
export function groupingCandidates(machine){
 const ids=new Set(machine.states.filter(s=>s.id!==machine.start&&!groupFor(machine,s.id)).map(s=>s.id));
 const neighbors=new Map([...ids].map(id=>[id,new Set()]));
 for(const edge of machine.edges){let to;try{to=destination(machine,edge)?.id}catch{continue}if(ids.has(edge.from)&&ids.has(to)){neighbors.get(edge.from).add(to);neighbors.get(to).add(edge.from)}}
 const result=[];
 for(const first of [...ids]){if(!ids.delete(first))continue;const component=[first];for(let i=0;i<component.length;i++)for(const next of neighbors.get(component[i]))if(ids.delete(next))component.push(next);
  if(component.length>=3&&component.length<=30)result.push(component);
 }
 return result.sort((a,b)=>b.length-a.length);
}

export function smartArrange(machine,focus=null,options={}){
 if(!focus)for(const group of machine.groups??[])place(machine,group.id,options);
 place(machine,focus,options);
 if(focus||options.smartGroups===false)return 0;
 const quality=layoutQuality(machine);
 if(quality.nodes<=32&&quality.crossings<=Math.max(4,machine.edges.length*.12)&&quality.extent<=6500)return 0;
 let count=0;
 for(const ids of groupingCandidates(machine)){
  const trial=structuredClone(machine),entry=machine.edges.find(e=>!ids.includes(e.from)&&ids.includes(e.to));
  const state=machine.states.find(s=>s.id===(entry?.to??ids[0]));
  const tokens=[...new Set(machine.states.filter(s=>ids.includes(s.id)&&s.token).map(s=>s.token))];
  let name=tokens.length===1?tokens[0]:state.name||'Branch',suffix=2,base=name;
  while((trial.groups??[]).some(g=>g.name===name))name=base+' '+suffix++;
  const group=createGroup(trial,ids,name);group.automatic=true;
  place(trial,group.id,options);place(trial,null,options);
  if(layoutQuality(trial).score>=layoutQuality(machine).score)continue;
  machine.states=trial.states;machine.groups=trial.groups;machine.comments=trial.comments;count++;
 }
 return count;
}
