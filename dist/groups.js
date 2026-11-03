// Groups are a view of the same states and transitions, never a second lexer model.
import {destination} from './portals.js';
export function groupFor(machine, stateId) {
  return (machine.groups ?? []).find(group => group.stateIds.includes(stateId));
}

export function createGroup(machine, ids, name) {
  const members = [...new Set(ids)].filter(id => machine.states.some(state => state.id === id));
  if (!members.length) throw Error('Select at least one state to make a group.');
  if (members.some(id => groupFor(machine, id))) throw Error('A state can belong to one group.');
  const used = new Set((machine.groups ?? []).map(group => group.id));
  let id = crypto.randomUUID();
  while (used.has(id)) id = crypto.randomUUID();
  const group = {id, name: name.trim() || 'New group', stateIds: members};
  (machine.groups ??= []).push(group);
  return group;
}

export function dissolveGroup(machine, id) {
  machine.groups = (machine.groups ?? []).filter(group => group.id !== id);
}

export function graphView(machine, focus = null, includeOutside = true) {
  const groups = machine.groups ?? [], membership = new Map(groups.flatMap(group => group.stateIds.map(id => [id, group.id])));
  if (!groups.length && !focus) return machine;
  if (focus && !groups.some(group => group.id === focus)) focus = null;
  if (focus) {
    const ids = new Set(groups.find(group => group.id === focus).stateIds);
    const states=machine.states.filter(state=>ids.has(state.id)),incoming=new Map();
    const edges=machine.edges.flatMap((edge,originalIndex)=>{
      let to;try{to=destination(machine,edge)?.id}catch{return []}
      if(!ids.has(to))return [];
      if(ids.has(edge.from))return [{...edge,to,originalIndex}];
      if(!includeOutside)return [];
      if(!incoming.has(edge.from))incoming.set(edge.from,[]);
      incoming.get(edge.from).push(machine.states.find(s=>s.id===to).y);
      return [{...edge,to,portal:undefined,portalOffset:undefined,bend:undefined,originalIndex,outside:true}];
    });
    const left=Math.min(...states.map(s=>s.x))-280;
    let previous=-Infinity;
    for(const [id,targets] of [...incoming].sort((a,b)=>a[1].reduce((s,n)=>s+n,0)/a[1].length-b[1].reduce((s,n)=>s+n,0)/b[1].length)){
      const y=Math.max(previous+180,targets.reduce((s,n)=>s+n,0)/targets.length);previous=y;
      states.push({...machine.states.find(s=>s.id===id),x:left,y,outside:true,portal:undefined,portalOffset:undefined});
    }
    return {start: ids.has(machine.start) ? machine.start : null,
      states,edges,
      comments: (machine.comments ?? []).filter(comment => (comment.nodeIds ?? (comment.nodeId ? [comment.nodeId] : [])).some(id => ids.has(id))),
      labelBoxes: machine.labelBoxes};
  }
  const states = machine.states.filter(state => !membership.has(state.id));
  for (const group of groups) {
    const members = machine.states.filter(state => group.stateIds.includes(state.id));
    if (!members.length) continue;
    states.push({id: group.id, name: group.name, token: '', x: members.reduce((sum, s) => sum + s.x, 0) / members.length,
      y: members.reduce((sum, s) => sum + s.y, 0) / members.length, group: true, count: members.length});
  }
  const edges = [], seen = new Map();
  for (const [originalIndex, edge] of machine.edges.entries()) {
    let target;try{target=destination(machine,edge)?.id}catch{continue}
    const from = membership.get(edge.from) ?? edge.from, to = membership.get(target) ?? target;
    if ((from === to && membership.has(edge.from)) || !states.some(s => s.id === from) || !states.some(s => s.id === to)) continue;
    if (!membership.has(edge.from) && !membership.has(target)) {edges.push({...edge, originalIndex}); continue;}
    const key = JSON.stringify([from, to]);
    if (!seen.has(key)) {seen.set(key, edges.length); edges.push({from, to, label: '', summary: true, count: 0, edgeIndices: []});}
    edges[seen.get(key)].count++;edges[seen.get(key)].edgeIndices.push(originalIndex);
  }
  return {start: membership.get(machine.start) ?? machine.start, states, edges,
    comments: (machine.comments ?? []).filter(comment => !(comment.nodeIds ?? (comment.nodeId ? [comment.nodeId] : [])).some(id => membership.has(id))),
    labelBoxes: machine.labelBoxes};
}

export function validateGroups(machine) {
  if (machine.groups === undefined) return;
  if (!Array.isArray(machine.groups)) throw Error('Invalid groups.');
  const ids = new Set(machine.states.map(state => state.id)), groups = new Set(), members = new Set();
  for (const group of machine.groups) {
    if (!group || typeof group.id !== 'string' || groups.has(group.id) || ids.has(group.id) ||
      typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.stateIds) || !group.stateIds.length) throw Error('Invalid group.');
    groups.add(group.id);
    for (const id of group.stateIds) {
      if (!ids.has(id) || members.has(id)) throw Error('Invalid group membership.');
      members.add(id);
    }
  }
}
