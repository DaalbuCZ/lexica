import {routeEdges} from './layout.js';
export function validate(m){
 if(!m||!Array.isArray(m.states)||!Array.isArray(m.edges)||!m.states.length)throw Error('A machine needs states and transitions.');
 const ids=new Set();for(const s of m.states){if(typeof s.id!=='string'||ids.has(s.id)||!Number.isFinite(s.x)||!Number.isFinite(s.y)||typeof s.name!=='string'||typeof s.token!=='string'||(s.accepting!==undefined&&typeof s.accepting!=='boolean'))throw Error('Invalid or duplicate state.');ids.add(s.id)}
 if(m.start!==null&&!ids.has(m.start))throw Error('Choose a start state.');
 for(const e of m.edges){if(!ids.has(e.from)||!ids.has(e.to)||typeof e.label!=='string')throw Error('Invalid transition.');matcher(e.label)}return m;
}
export function matcher(label){if(!label)throw Error('Transition cannot be empty.');let r;try{r=new RegExp('^(?:'+label+')$','u')}catch{throw Error('Invalid character expression: '+label)}if(r.test(''))throw Error('Transitions must consume one character.');return c=>r.test(c)}
export function isAccepting(state){return !!state.token&&state.accepting!==false}
export function setAccepting(state,value){state.accepting=value;if(value&&!state.token)state.token=state.name.toUpperCase()||'TOKEN'}
export function tokenize(m,input){validate(m);if(m.start===null)throw Error('Choose an initial state to test the lexer.');const edges=m.edges.map(e=>({...e,test:matcher(e.label)}));const result=[];let pos=0;while(pos<input.length){let state=m.start,end=pos,last=null;while(end<input.length){const c=String.fromCodePoint(input.codePointAt(end));const next=edges.filter(e=>e.from===state&&e.test(c));if(next.length>1)throw Error('Ambiguous transitions from '+m.states.find(s=>s.id===state).name+' on '+JSON.stringify(c));if(!next.length)break;state=next[0].to;end+=c.length;const s=m.states.find(s=>s.id===state);if(isAccepting(s))last={end,state:s}}if(!last){result.push({token:'ERROR',value:String.fromCodePoint(input.codePointAt(pos)),offset:pos});pos+=result.at(-1).value.length}else{result.push({token:last.state.token,value:input.slice(pos,last.end),offset:pos,skip:!!last.state.skip});pos=last.end}}return result}
const tex=s=>s.replace(/[\\{}$&#%_^~]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]));
export function toTikz(m,standalone=true){
 validate(m);const names=new Map(m.states.map((s,i)=>[s.id,'q'+i]));
 const coord=p=>`(${(p.x/60).toFixed(3)},${(-p.y/60).toFixed(3)})`;
 const lines=['\\begin{tikzpicture}[>=stealth,semithick,', '  every state/.style={minimum size=12mm,inner sep=0pt,font=\\scriptsize}]'];
 for(const s of m.states)lines.push('  \\node[state'+(s.id===m.start?',initial,initial text={}':'')+(isAccepting(s)?',accepting,label=below:{\\scriptsize\\texttt{'+tex(s.token)+(s.skip?' (skip)':'')+'}}':'')+'] ('+names.get(s.id)+') at '+coord(s)+' {\\resizebox{10mm}{!}{\\strut '+tex(s.name)+'}};');
 const routes=routeEdges(m);
 m.edges.forEach((e,i)=>{const r=routes[i];lines.push('  \\draw[->] '+coord(r.p0)+' .. controls '+coord(r.c1)+' and '+coord(r.c2)+' .. '+coord(r.p3)+';');lines.push('  \\node[fill=white,inner sep=2pt,font=\\scriptsize] at '+coord({...r.label,y:r.label.y-4})+' {\\texttt{'+tex(e.label)+'}};')});
 lines.push('\\end{tikzpicture}');const body=lines.join('\n');return standalone?'\\documentclass[tikz,border=10pt]{standalone}\n\\usepackage[T1]{fontenc}\n\\usepackage{graphicx}\n\\usetikzlibrary{automata,positioning,arrows}\n\\begin{document}\n'+body+'\n\\end{document}\n':body;
}
export const example=()=>({start:'s0',states:[{id:'s0',name:'start',token:'',x:140,y:250},{id:'s1',name:'identifier',token:'IDENT',x:400,y:145},{id:'s2',name:'number',token:'NUMBER',x:400,y:355},{id:'s3',name:'whitespace',token:'WS',skip:true,x:665,y:250}],edges:[{from:'s0',to:'s1',label:'[a-zA-Z_]'},{from:'s1',to:'s1',label:'[a-zA-Z0-9_]'},{from:'s0',to:'s2',label:'[0-9]'},{from:'s2',to:'s2',label:'[0-9]'},{from:'s0',to:'s3',label:'\\s'},{from:'s3',to:'s3',label:'\\s'}]});
