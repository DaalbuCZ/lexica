import {stateLabel,transitionLabel} from './labels.js?v=17';
import {commentLayout,commentNodeIds,commentLinks} from './comments.js?v=16';
import {destination,statePortalBox} from './portals.js';
export {destination,enablePortal,renamePortal,statePortalBox} from './portals.js';
import {routeEdges} from './layout.js?v=41';
export function validate(m){
 if(!m||!Array.isArray(m.states)||!Array.isArray(m.edges))throw Error('A machine needs states and transitions.');
 if(m.machineType!==undefined&&!['fsm','extended'].includes(m.machineType))throw Error('Invalid machine type.');
 if(m.cells!==undefined&&!Array.isArray(m.cells))throw Error('Memory cells must be an array.');
 const cells=new Map();for(const cell of m.cells??[]){if(!cell||typeof cell.name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cell.name)||cells.has(cell.name)||!Number.isSafeInteger(cell.initial??0))throw Error('Invalid or duplicate memory cell.');cells.set(cell.name,cell)}
 if(m.tester!==undefined&&(!m.tester||typeof m.tester!=='object'||Array.isArray(m.tester)||typeof m.tester.input!=='string'||(m.tester.showSkipped!==undefined&&typeof m.tester.showSkipped!=='boolean')))throw Error('Invalid lexer tester data.');
 if(m.labelBoxes!==undefined&&typeof m.labelBoxes!=='boolean')throw Error('Invalid label box setting.');
 if(m.comments!==undefined&&!Array.isArray(m.comments))throw Error('Invalid comments.');
 const commentIds=new Set();for(const c of m.comments??[]){if(typeof c.id!=='string'||commentIds.has(c.id)||typeof c.text!=='string'||c.text.length>10000||!Number.isFinite(c.x)||!Number.isFinite(c.y))throw Error('Invalid comment label.');commentIds.add(c.id)}
 const ids=new Set();for(const s of m.states){if(typeof s.id!=='string'||ids.has(s.id)||!Number.isFinite(s.x)||!Number.isFinite(s.y)||typeof s.name!=='string'||typeof s.token!=='string'||(s.portal!==undefined&&typeof s.portal!=='string')||(s.accepting!==undefined&&typeof s.accepting!=='boolean'))throw Error('Invalid or duplicate state.');ids.add(s.id)}
 for(const c of m.comments??[])if((c.nodeIds!==undefined&&(!Array.isArray(c.nodeIds)||new Set(c.nodeIds).size!==c.nodeIds.length))||commentNodeIds(c).some(id=>!ids.has(id)))throw Error('Invalid comment attachment.');
 if(m.start!==null&&!ids.has(m.start))throw Error('Choose a start state.');
 for(const e of m.edges){if(!ids.has(e.from)||(e.portal==null&&!ids.has(e.to))||typeof e.label!=='string'||(e.invert!==undefined&&typeof e.invert!=='boolean')||(e.portal!=null&&typeof e.portal!=='string'))throw Error('Invalid transition.');if(e.label)matcher(e.label,e.invert);if(e.guard!==undefined){const g=e.guard;if(!g||!cells.has(g.cell)||!['==','!=','>','>=','<','<='].includes(g.op)||!Number.isSafeInteger(g.value))throw Error('Invalid transition guard.')}if(e.effect!==undefined){const a=e.effect;if(!a||!cells.has(a.cell)||!['add','set'].includes(a.op)||!Number.isSafeInteger(a.value))throw Error('Invalid transition side effect.')}}return m;
}
export function parseMachine(text){
 if(new TextEncoder().encode(text).length>1000000)throw Error('Machine is too large (maximum 1 MB).');
 if(!text.trim())throw Error('Paste machine JSON to import.');
 let machine;try{machine=JSON.parse(text)}catch{throw Error('Invalid JSON. Paste an exported machine JSON document.')}
 return validate(machine);
}
export function matcher(label,invert=false){if(!label)throw Error('Transition cannot be empty.');let r;try{r=new RegExp('^(?:'+label+')$','u')}catch{throw Error('Invalid character expression: '+label)}if(r.test(''))throw Error('Transitions must consume one character.');return c=>invert?!r.test(c):r.test(c)}
export function transitionError(m,e){try{matcher(e.label,e.invert);if(e.guard&&(!e.guard||!(m.cells??[]).some(c=>c.name===e.guard.cell)||!['==','!=','>','>=','<','<='].includes(e.guard.op)||!Number.isSafeInteger(e.guard.value)))throw Error('Invalid transition guard.');if(e.effect&&(!e.effect||!(m.cells??[]).some(c=>c.name===e.effect.cell)||!['add','set'].includes(e.effect.op)||!Number.isSafeInteger(e.effect.value)))throw Error('Invalid transition side effect.');destination(m,e);return ''}catch(error){return error.message}}
export function isAccepting(state){return !!state.token&&state.accepting!==false}
export function setAccepting(state,value){state.accepting=value;if(value&&!state.token)state.token=state.name.toUpperCase()||'TOKEN'}
export function* lexerSteps(m,input,stepping=true,startOffset=0){
 validate(m);if(m.start===null)throw Error('Choose an initial state to test the lexer.');
 const states=new Map(m.states.map(s=>[s.id,s])),edges=m.edges.map((e,index)=>({...e,index,to:destination(m,e).id,test:matcher(e.label,e.invert)}));
 const extended=m.machineType==='extended'||(m.machineType===undefined&&((m.cells??[]).length||m.edges.some(edge=>edge.guard||edge.effect)));
 const initialMemory=Object.fromEntries((extended?m.cells??[]:[]).map(c=>[c.name,c.initial??0]));let memory={...initialMemory};
 const enabled=(edge,mem)=>!extended||!edge.guard||({'==':mem[edge.guard.cell]===edge.guard.value,'!=':mem[edge.guard.cell]!==edge.guard.value,'>':mem[edge.guard.cell]>edge.guard.value,'>=':mem[edge.guard.cell]>=edge.guard.value,'<':mem[edge.guard.cell]<edge.guard.value,'<=':mem[edge.guard.cell]<=edge.guard.value})[edge.guard.op];
 const apply=(edge,mem)=>{if(!extended||!edge.effect)return mem;const next=edge.effect.op==='set'?edge.effect.value:mem[edge.effect.cell]+edge.effect.value;if(!Number.isSafeInteger(next))throw Object.assign(Error('Memory cell '+edge.effect.cell+' exceeded the safe integer range.'),{stateId:edge.from,edgeIndices:[edge.index]});return {...mem,[edge.effect.cell]:next}};
 let pos=Number.isInteger(startOffset)?Math.max(0,Math.min(input.length,startOffset)):0;
 if(pos>0&&pos<input.length&&input.charCodeAt(pos)>=0xdc00&&input.charCodeAt(pos)<=0xdfff&&input.charCodeAt(pos-1)>=0xd800&&input.charCodeAt(pos-1)<=0xdbff)pos--;
 while(pos<input.length){
  const tokenMemory={...memory};let state=m.start,end=pos,last=null,pathStates=[state],pathEdges=[];
  const frame=(kind,offset,message,extra={})=>({kind,offset,end:offset,state,traceStates:[...pathStates],traceEdges:[...pathEdges],message,memory:{...memory},...extra});
  if(stepping)yield frame('start',pos,'Start token at '+pos);
  while(end<input.length){
   const c=String.fromCodePoint(input.codePointAt(end)),next=edges.filter(e=>e.from===state&&e.test?.(c)&&enabled(e,memory));
   if(next.length>1)throw Object.assign(Error('Ambiguous transitions from '+states.get(state).name+' on '+JSON.stringify(c)),{stateId:state,edgeIndices:next.map(e=>e.index)});
   if(!next.length){if(stepping)yield frame('blocked',end,'No transition for '+JSON.stringify(c),{end:end+c.length,character:c});break}
   const edge=next[0];memory=apply(edge,memory);state=edge.to;pathStates.push(state);pathEdges.push(edge.index);const offset=end;end+=c.length;
   if(isAccepting(states.get(state)))last={end,state:states.get(state),pathStates:[...pathStates],pathEdges:[...pathEdges],memory:{...memory}};
   if(stepping)yield frame('character',offset,'Read '+JSON.stringify(c)+' → '+states.get(state).name,{end,character:c,accepting:isAccepting(states.get(state))});
  }
  let token;
  if(!last){memory=tokenMemory;token={token:'ERROR',value:String.fromCodePoint(input.codePointAt(pos)),offset:pos,traceStates:[...pathStates],traceEdges:[...pathEdges],failureState:state};pos+=token.value.length}
  else{memory={...last.memory};token={token:last.state.token,value:input.slice(pos,last.end),offset:pos,skip:!!last.state.skip,traceStates:last.pathStates,traceEdges:last.pathEdges};pos=last.end}
  yield {...frame('emit',token.offset,(last&&end>last.end?'Backtrack to '+last.end+' · ':'')+(token.skip?'Skip ':'Emit ')+token.token),end:pos,traceStates:token.traceStates,traceEdges:token.traceEdges,result:token,token:token.token,memory:{...memory}};
 }
 if(stepping)yield {kind:'done',offset:pos,end:pos,traceStates:[],traceEdges:[],message:'End of input'};
}
export function tokenize(m,input){const result=[];for(const step of lexerSteps(m,input,false))if(step.result)result.push(step.result);return result}

const tex=s=>s.replace(/[\\{}$&#%_^~]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]));
export function toTikz(m,standalone=true){
 validate(m);const names=new Map(m.states.map((s,i)=>[s.id,'q'+i]));
 const coord=p=>`(${(p.x/60).toFixed(3)},${(-p.y/60).toFixed(3)})`;
 const lines=['\\begin{tikzpicture}[>=stealth,semithick,', '  every state/.style={minimum size=12mm,inner sep=0pt,font=\\scriptsize}]'];
 for(const link of commentLinks(m))lines.push('  \\draw[dashed,gray] '+coord(link.from)+' -- '+coord(link.to)+';');
 for(const s of m.states){const label=stateLabel(s.name),content=label.lines.length===1?'\\resizebox{10mm}{!}{\\strut '+tex(s.name)+'}':'\\resizebox{8.7mm}{'+Math.min(8,label.lines.length*2.3).toFixed(1)+'mm}{\\shortstack{'+label.lines.map(line=>'\\strut '+tex(line)).join('\\\\')+'}}';lines.push('  \\node[state'+(s.id===m.start?',initial,initial text={}':'')+(isAccepting(s)?',accepting,label=below:{\\scriptsize\\texttt{'+tex(s.token)+(s.skip?' (skip)':'')+'}}':'')+'] ('+names.get(s.id)+') at '+coord(s)+' {'+content+'};');}

 const portalTag=(name,box)=>{const left=box.x-box.w/2,right=box.x+box.w/2,top=box.y-box.h/2,bottom=box.y+box.h/2;lines.push('  \\draw[fill=white] '+coord({x:left,y:box.y})+' -- '+coord({x:left+7,y:top})+' -- '+coord({x:right,y:top})+' -- '+coord({x:right,y:bottom})+' -- '+coord({x:left+7,y:bottom})+' -- cycle;');lines.push('  \\node[font=\\scriptsize,inner sep=0pt] at '+coord(box)+' {\\texttt{'+tex(name)+'}};')};
 for(const state of m.states)if(state.portal){const box=statePortalBox(state);portalTag(state.portal,box);lines.push('  \\draw '+coord({x:box.x,y:box.y+box.h/2})+' -- '+coord({x:state.x,y:state.y-36})+';')}
 const routes=routeEdges(m),edgeLabels=[];
 m.edges.forEach((e,i)=>{const r=routes[i];if(r.portalBox)portalTag(e.portal||'?',r.portalBox);lines.push('  \\draw[->] '+coord(r.p0)+' .. controls '+coord(r.c1)+' and '+coord(r.c2)+' .. '+coord(r.p3)+';');edgeLabels.push('  \\node[fill=white,'+(m.labelBoxes&&e.label?'draw=gray,rounded corners=1pt,':'')+'inner sep=2pt,font=\\scriptsize] at '+coord({...r.label,y:r.label.y-4})+' {\\texttt{'+tex(transitionLabel(e))+'}};')});
 lines.push(...edgeLabels);
 for(const c of m.comments??[]){const layout=commentLayout(c);lines.push('  \\node[draw=gray,fill=yellow!10,anchor=north west,align=left,font=\\tiny,text width='+((layout.w-24)/60).toFixed(3)+'cm,inner sep=4pt] at '+coord(c)+' {'+layout.lines.map(tex).join('\\\\')+'};')}
 lines.push('\\end{tikzpicture}');const body=lines.join('\n');return standalone?'\\documentclass[tikz,border=10pt]{standalone}\n\\usepackage[T1]{fontenc}\n\\usepackage{graphicx}\n\\usetikzlibrary{automata,positioning,arrows}\n\\begin{document}\n'+body+'\n\\end{document}\n':body;
}
export const example=()=>({start:'s0',states:[{id:'s0',name:'start',token:'',x:140,y:250},{id:'s1',name:'identifier',token:'IDENT',x:400,y:145},{id:'s2',name:'number',token:'NUMBER',x:400,y:355},{id:'s3',name:'whitespace',token:'WS',skip:true,x:665,y:250}],edges:[{from:'s0',to:'s1',label:'[a-zA-Z_]'},{from:'s1',to:'s1',label:'[a-zA-Z0-9_]'},{from:'s0',to:'s2',label:'[0-9]'},{from:'s2',to:'s2',label:'[0-9]'},{from:'s0',to:'s3',label:'\\s'},{from:'s3',to:'s3',label:'\\s'}]});
