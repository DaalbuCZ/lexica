export function insertState(machine,from,to,position,id=crypto.randomUUID()){
 const parent=machine.states.find(s=>s.id===from),target=to==null?null:machine.states.find(s=>s.id===to);
 if(!parent||(to!=null&&!target))throw Error('Choose existing source and destination states.');
 const p=position??(from===to?{x:parent.x+150,y:parent.y-100}:{x:(parent.x+target.x)/2,y:(parent.y+target.y)/2});
 const state={id,name:'q'+machine.states.length,token:'',x:p.x,y:p.y};
 machine.states.push(state);machine.edges.push({from,to:id,label:''});
 if(target)machine.edges.push({from:id,to:target.id,label:''});
 return state;
}
