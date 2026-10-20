import {stateLabel} from './labels.js';
import {commentLayout} from './comments.js';
import {destination,statePortalBox} from './portals.js';
export {destination,enablePortal,renamePortal,statePortalBox} from './portals.js';
import {routeEdges} from './layout.js';
export function validate(m){
 if(!m||!Array.isArray(m.states)||!Array.isArray(m.edges))throw Error('A machine needs states and transitions.');
 if(m.labelBoxes!==undefined&&typeof m.labelBoxes!=='boolean')throw Error('Invalid label box setting.');
 if(m.comments!==undefined&&!Array.isArray(m.comments))throw Error('Invalid comments.');
 const commentIds=new Set();for(const c of m.comments??[]){if(typeof c.id!=='string'||commentIds.has(c.id)||typeof c.text!=='string'||c.text.length>10000||!Number.isFinite(c.x)||!Number.isFinite(c.y))throw Error('Invalid comment label.');commentIds.add(c.id)}
 const ids=new Set();for(const s of m.states){if(typeof s.id!=='string'||ids.has(s.id)||!Number.isFinite(s.x)||!Number.isFinite(s.y)||typeof s.name!=='string'||typeof s.token!=='string'||(s.portal!==undefined&&typeof s.portal!=='string')||(s.accepting!==undefined&&typeof s.accepting!=='boolean'))throw Error('Invalid or duplicate state.');ids.add(s.id)}
 if(m.start!==null&&!ids.has(m.start))throw Error('Choose a start state.');
 for(const e of m.edges){if(!ids.has(e.from)||(e.portal==null&&!ids.has(e.to))||typeof e.label!=='string'||(e.portal!=null&&typeof e.portal!=='string'))throw Error('Invalid transition.');if(e.label)matcher(e.label)}return m;
}
export function matcher(label){if(!label)throw Error('Transition cannot be empty.');let r;try{r=new RegExp('^(?:'+label+')$','u')}catch{throw Error('Invalid character expression: '+label)}if(r.test(''))throw Error('Transitions must consume one character.');return c=>r.test(c)}
export function isAccepting(state){return !!state.token&&state.accepting!==false}
export function setAccepting(state,value){state.accepting=value;if(value&&!state.token)state.token=state.name.toUpperCase()||'TOKEN'}
export function tokenize(m,input){validate(m);if(m.start===null)throw Error('Choose an initial state to test the lexer.');const edges=m.edges.map(e=>({...e,to:destination(m,e).id,test:matcher(e.label)}));const result=[];let pos=0;while(pos<input.length){let state=m.start,end=pos,last=null;while(end<input.length){const c=String.fromCodePoint(input.codePointAt(end));const next=edges.filter(e=>e.from===state&&e.test(c));if(next.length>1)throw Error('Ambiguous transitions from '+m.states.find(s=>s.id===state).name+' on '+JSON.stringify(c));if(!next.length)break;state=next[0].to;end+=c.length;const s=m.states.find(s=>s.id===state);if(isAccepting(s))last={end,state:s}}if(!last){result.push({token:'ERROR',value:String.fromCodePoint(input.codePointAt(pos)),offset:pos});pos+=result.at(-1).value.length}else{result.push({token:last.state.token,value:input.slice(pos,last.end),offset:pos,skip:!!last.state.skip});pos=last.end}}return result}
const tex=s=>s.replace(/[\\{}$&#%_^~]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]));
export function toTikz(m,standalone=true){
 validate(m);const names=new Map(m.states.map((s,i)=>[s.id,'q'+i]));
 const coord=p=>`(${(p.x/60).toFixed(3)},${(-p.y/60).toFixed(3)})`;
 const lines=['\\begin{tikzpicture}[>=stealth,semithick,', '  every state/.style={minimum size=12mm,inner sep=0pt,font=\\scriptsize}]'];
 for(const s of m.states){const label=stateLabel(s.name),content=label.lines.length===1?'\\resizebox{10mm}{!}{\\strut '+tex(s.name)+'}':'\\resizebox{8.7mm}{'+Math.min(8,label.lines.length*2.3).toFixed(1)+'mm}{\\shortstack{'+label.lines.map(line=>'\\strut '+tex(line)).join('\\\\')+'}}';lines.push('  \\node[state'+(s.id===m.start?',initial,initial text={}':'')+(isAccepting(s)?',accepting,label=below:{\\scriptsize\\texttt{'+tex(s.token)+(s.skip?' (skip)':'')+'}}':'')+'] ('+names.get(s.id)+') at '+coord(s)+' {'+content+'};');}

 const portalTag=(name,box)=>{const left=box.x-box.w/2,right=box.x+box.w/2,top=box.y-box.h/2,bottom=box.y+box.h/2;lines.push('  \\draw[fill=white] '+coord({x:left,y:box.y})+' -- '+coord({x:left+7,y:top})+' -- '+coord({x:right,y:top})+' -- '+coord({x:right,y:bottom})+' -- '+coord({x:left+7,y:bottom})+' -- cycle;');lines.push('  \\node[font=\\scriptsize,inner sep=0pt] at '+coord(box)+' {\\texttt{'+tex(name)+'}};')};
 for(const state of m.states)if(state.portal){const box=statePortalBox(state);portalTag(state.portal,box);lines.push('  \\draw '+coord({x:box.x,y:box.y+box.h/2})+' -- '+coord({x:state.x,y:state.y-36})+';')}
 const routes=routeEdges(m),edgeLabels=[];
 m.edges.forEach((e,i)=>{const r=routes[i];if(r.portalBox)portalTag(e.portal||'?',r.portalBox);lines.push('  \\draw[->] '+coord(r.p0)+' .. controls '+coord(r.c1)+' and '+coord(r.c2)+' .. '+coord(r.p3)+';');edgeLabels.push('  \\node[fill=white,'+(m.labelBoxes&&e.label?'draw=gray,rounded corners=1pt,':'')+'inner sep=2pt,font=\\scriptsize] at '+coord({...r.label,y:r.label.y-4})+' {\\texttt{'+tex(e.label)+'}};')});
 lines.push(...edgeLabels);
 for(const c of m.comments??[]){const layout=commentLayout(c);lines.push('  \\node[draw=gray,fill=yellow!10,anchor=north west,align=left,font=\\tiny,text width='+((layout.w-24)/60).toFixed(3)+'cm,inner sep=4pt] at '+coord(c)+' {'+layout.lines.map(tex).join('\\\\')+'};')}
 lines.push('\\end{tikzpicture}');const body=lines.join('\n');return standalone?'\\documentclass[tikz,border=10pt]{standalone}\n\\usepackage[T1]{fontenc}\n\\usepackage{graphicx}\n\\usetikzlibrary{automata,positioning,arrows}\n\\begin{document}\n'+body+'\n\\end{document}\n':body;
}
export const example=()=>({start:'s0',states:[{id:'s0',name:'start',token:'',x:140,y:250},{id:'s1',name:'identifier',token:'IDENT',x:400,y:145},{id:'s2',name:'number',token:'NUMBER',x:400,y:355},{id:'s3',name:'whitespace',token:'WS',skip:true,x:665,y:250}],edges:[{from:'s0',to:'s1',label:'[a-zA-Z_]'},{from:'s1',to:'s1',label:'[a-zA-Z0-9_]'},{from:'s0',to:'s2',label:'[0-9]'},{from:'s2',to:'s2',label:'[0-9]'},{from:'s0',to:'s3',label:'\\s'},{from:'s3',to:'s3',label:'\\s'}]});
