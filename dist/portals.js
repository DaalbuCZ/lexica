export function destination(machine,edge){
 if(edge.portal==null)return machine.states.find(s=>s.id===edge.to);
 const matches=machine.states.filter(s=>s.portal&&s.portal===edge.portal);
 if(!matches.length)throw Error(`Portal "${edge.portal}" has no destination.`);
 if(matches.length>1)throw Error(`Portal "${edge.portal}" has multiple destinations.`);
 return matches[0];
}
export function enablePortal(machine,edge){const target=machine.states.find(s=>s.id===edge.to);if(!target.portal){const base=target.name.toUpperCase();let name=base,suffix=2;while(machine.states.some(s=>s.portal===name))name=base+'_'+suffix++;target.portal=name}edge.portal=target.portal}
export function renamePortal(machine,state,name){const old=state.portal;if(old&&name&&machine.states.filter(s=>s.portal===old).length===1)for(const edge of machine.edges)if(edge.portal===old)edge.portal=name;state.portal=name}
export const statePortalBox=s=>({x:s.x,y:s.y-66,w:Math.max(60,(s.portal?.length??0)*7+20),h:22});
