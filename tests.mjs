import {test} from 'node:test';import assert from 'node:assert/strict';import {example,tokenize,toTikz,validate,isAccepting,setAccepting} from './dist/lexer.js';
test('lexer emits longest matches and marks whitespace skipped',()=>{assert.deepEqual(tokenize(example(),'hello_2 42+').map(t=>[t.token,t.value,!!t.skip]),[['IDENT','hello_2',false],['WS',' ',true],['NUMBER','42',false],['ERROR','+',false]])});
test('ambiguity is reported instead of selecting a random transition',()=>{const m=example();m.edges.push({from:'s0',to:'s2',label:'[a-z]'});assert.throws(()=>tokenize(m,'a'),/Ambiguous/)});
test('TikZ exports positions, loops, accepting and initial states; escapes labels',()=>{const m=example();m.states[1].token='ID_%';const t=toTikz(m);assert.match(t,/documentclass/);assert.match(t,/state,initial/);assert.match(t,/state,accepting/);assert.match(t,/controls/);assert.ok(t.includes('ID\\_\\%'));assert.ok(t.includes('\\textbackslash{}s'));assert.ok(!toTikz(m,false).includes('documentclass'))});
test('import rejects broken references and malformed regex',()=>{const m=example();m.edges[0].to='missing';assert.throws(()=>validate(m));m.edges[0].to='s1';m.edges[0].label='[';assert.throws(()=>validate(m))});
test('longest match backtracks to last accepting state',()=>{const m={start:'a',states:[{id:'a',name:'a',token:'',x:0,y:0},{id:'b',name:'b',token:'B',x:1,y:1},{id:'c',name:'c',token:'',x:2,y:2}],edges:[{from:'a',to:'b',label:'a'},{from:'b',to:'c',label:'b'}]};assert.deepEqual(tokenize(m,'ab').map(t=>t.token),['B','ERROR'])});

import {autoLayout,routeEdges} from './dist/layout.js';
test('auto layout separates all states and retains topology',()=>{const m=example();for(const s of m.states){s.x=0;s.y=0}const edges=JSON.stringify(m.edges);autoLayout(m);assert.equal(JSON.stringify(m.edges),edges);for(let i=0;i<m.states.length;i++)for(let j=i+1;j<m.states.length;j++)assert.ok(Math.hypot(m.states[i].x-m.states[j].x,m.states[i].y-m.states[j].y)>=160);assert.ok(m.states.find(s=>s.id===m.start).x<m.states[1].x)});
test('routed labels avoid nodes and one another after layout',()=>{const m=autoLayout(example()),routes=routeEdges(m);for(const r of routes){for(const s of m.states)assert.ok(Math.abs(r.label.x-s.x)>(r.label.w+90)/2||Math.abs(r.label.y-s.y)>(r.label.h+90)/2);assert.ok(!r.d.includes('NaN'))}for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){const a=routes[i].label,b=routes[j].label;assert.ok(Math.abs(a.x-b.x)>(a.w+b.w)/2||Math.abs(a.y-b.y)>(a.h+b.h)/2)}});
test('layout handles disconnected states and multiple loops',()=>{const m=example();m.states.push({id:'unused',name:'unused',token:'',x:0,y:0});m.edges.push({from:'s1',to:'s1',label:'[0-9]'});autoLayout(m);assert.equal(new Set(m.states.map(s=>s.x+','+s.y)).size,m.states.length);const r=routeEdges(m);assert.notEqual(r[1].d,r.at(-1).d);assert.equal(r.length,m.edges.length)});

test('accepting toggles preserve token names and affect lexer and TikZ',()=>{const m=example(),s=m.states[1];s.token='CUSTOM';setAccepting(s,false);assert.equal(s.token,'CUSTOM');assert.equal(isAccepting(s),false);assert.equal(tokenize(m,'a')[0].token,'ERROR');assert.ok(!toTikz(m).includes('texttt{CUSTOM}'));setAccepting(s,true);assert.equal(tokenize(m,'a')[0].token,'CUSTOM');assert.ok(toTikz(m).includes('texttt{CUSTOM}'))});
test('an unassigned initial state can be saved and exported, but cannot run',()=>{const m=example();m.start=null;assert.equal(validate(m),m);assert.ok(!toTikz(m).includes('state,initial'));assert.throws(()=>tokenize(m,'a'),/initial state/);m.start='s1';assert.equal((toTikz(m).match(/state,initial/g)||[]).length,1)});

import {destination,enablePortal,renamePortal} from './dist/lexer.js';
import {readFileSync} from 'node:fs';
test('portal aliases preserve tokenization, survive JSON and export as TeX tags',()=>{const m=example(),before=tokenize(m,'hello 42');enablePortal(m,m.edges[0]);assert.deepEqual(tokenize(m,'hello 42'),before);assert.equal(destination(m,m.edges[0]).id,'s1');assert.deepEqual(validate(JSON.parse(JSON.stringify(m))),m);assert.ok(routeEdges(m)[0].portalBox);assert.match(toTikz(m),/IDENTIFIER/)});
test('portal resolution uses its name and detects missing or duplicate targets',()=>{const m=example();enablePortal(m,m.edges[0]);m.states[1].portal='';assert.throws(()=>tokenize(m,'a'),/no destination/);m.states[2].portal='IDENTIFIER';assert.equal(tokenize(m,'a')[0].token,'NUMBER');m.states[1].portal='IDENTIFIER';assert.throws(()=>tokenize(m,'a'),/multiple destinations/)});
test('portal rename updates references and deleted targets remain repairable',()=>{const m=example();enablePortal(m,m.edges[0]);renamePortal(m,m.states[1],'NAME_%');assert.equal(m.edges[0].portal,'NAME_%');assert.ok(toTikz(m).includes('NAME\\_\\%'));m.states=m.states.filter(s=>s.id!=='s1');m.edges=m.edges.filter(e=>e.from!=='s1');validate(m);assert.throws(()=>tokenize(m,'a'),/no destination/);assert.doesNotThrow(()=>toTikz(m))});
test('portal JSON fixture produces the expected tokens',()=>{const m=validate(JSON.parse(readFileSync(new URL('./fixtures/portal_machine.json',import.meta.url))));assert.deepEqual(tokenize(m,'hello 42').filter(t=>!t.skip).map(t=>t.token),['IDENT','NUMBER'])});

import {copySelection,pasteSelection} from './dist/selection.js';
import {commentLayout} from './dist/comments.js';
test('pasting a group remaps state IDs and internal edges without duplicating the initial state',()=>{const m=example();const fragment=copySelection(m,new Set(['s0','s1']),new Set(),new Set());let n=0;const group=pasteSelection(m,fragment,{x:40,y:60},()=>`copy${n++}`);assert.equal(group.states.size,2);assert.equal(m.states.length,6);assert.equal(m.start,'s0');assert.equal(m.states.at(-2).x,180);assert.equal(m.states.at(-2).y,310);assert.equal(m.edges.at(-2).from,'copy0');assert.equal(m.edges.at(-2).to,'copy1');assert.equal(m.edges.at(-1).from,'copy1');assert.equal(m.edges.at(-1).to,'copy1');validate(m)});
test('pasted portals rename copied destinations and update their copied references',()=>{const m=example();enablePortal(m,m.edges[0]);const fragment=copySelection(m,new Set(['s0','s1']),new Set(),new Set());let n=0;pasteSelection(m,fragment,{x:20,y:20},()=>`portal-copy${n++}`);assert.equal(m.states.at(-1).portal,'IDENTIFIER_2');assert.equal(m.edges.at(-2).portal,'IDENTIFIER_2');assert.equal(destination(m,m.edges.at(-2)).id,m.states.at(-1).id)});
test('copying a portal source alone preserves its link to the existing destination',()=>{const m=example();enablePortal(m,m.edges[0]);const fragment=copySelection(m,new Set(['s0']),new Set(),new Set());let n=0;pasteSelection(m,fragment,{x:20,y:20},()=>`source-copy${n++}`);assert.equal(m.edges.at(-1).portal,'IDENTIFIER');assert.equal(destination(m,m.edges.at(-1)).id,'s1')});
test('comments round trip, export with TeX escaping, and do not change lexer output',()=>{const m=example(),before=tokenize(m,'hello 42');m.comments=[{id:'note',x:-100,y:20,text:'Lexer & tokens\nuse ID_%'}];validate(m);assert.deepEqual(tokenize(m,'hello 42'),before);const tex=toTikz(m);assert.ok(tex.includes('Lexer \\& tokens'));assert.ok(tex.includes('ID\\_\\%'));assert.ok(commentLayout(m.comments[0]).lines.length===2);assert.deepEqual(JSON.parse(JSON.stringify(m)).comments,m.comments)});
test('comments can be copied and pasted without states, including into an empty machine',()=>{const m=example();m.comments=[{id:'note',text:'Notes',x:10,y:20}];const f=copySelection(m,new Set(),new Set(),new Set(['note']));const empty={states:[],edges:[],comments:[],start:null};let n=0;const result=pasteSelection(empty,f,{x:40,y:40},()=>`note-copy${n++}`);assert.equal(empty.states.length,0);assert.equal(empty.comments[0].x,50);assert.equal(empty.comments[0].y,60);assert.equal(result.comments.size,1);validate(empty);autoLayout(empty);assert.doesNotThrow(()=>toTikz(empty))});
test('invalid clipboard data and comments are rejected before changing the machine',()=>{const m=example(),before=JSON.stringify(m);assert.throws(()=>pasteSelection(m,{kind:'wrong'}));assert.equal(JSON.stringify(m),before);m.comments=[{id:'bad',text:'bad',x:NaN,y:0}];assert.throws(()=>validate(m),/comment/)});

test('unfinished blank transition rules survive saves and exports but cannot run as epsilon',()=>{const m=example();m.edges[0].label='';assert.deepEqual(validate(JSON.parse(JSON.stringify(m))),m);assert.doesNotThrow(()=>toTikz(m));assert.throws(()=>tokenize(m,'hello'),/Transition cannot be empty/)});

import {insertState} from './dist/transitions.js';
test('inserting an intermediary connects parent to new state to destination',()=>{const m=example(),before=structuredClone(m),s=insertState(m,'s0','s2',undefined,'middle');assert.equal(m.states.length,before.states.length+1);assert.deepEqual(m.edges.slice(-2),[{from:'s0',to:'middle',label:''},{from:'middle',to:'s2',label:''}]);assert.equal(s.x,(before.states[0].x+before.states[2].x)/2);assert.deepEqual(m.edges.slice(0,-2),before.edges);assert.equal(m.start,before.start);validate(m)});
test('inserting on blank canvas leaves a connected state for continuing the arrow',()=>{const m=example();insertState(m,'s0',null,{x:-150,y:900},'middle');assert.deepEqual(m.edges.at(-1),{from:'s0',to:'middle',label:''});assert.equal(m.states.at(-1).x,-150);validate(m);const before=JSON.stringify(m);assert.throws(()=>insertState(m,'s0','missing'));assert.equal(JSON.stringify(m),before)});

import {runInNewContext} from 'node:vm';
test('Ctrl-left-drag release inserts between states or continues from blank canvas',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
 const start=app.slice(app.indexOf('function startDrag('),app.indexOf('function view('));
 const release=app.slice(app.indexOf("window.addEventListener('pointerup'"),app.indexOf('function add('));
 for(const target of ['s2',null]){
  let pointerup,inserted;
  const context={commentSource:null,source:null,space:false,marquee:null,rightStart:null,drag:null,pan:null,connectPoint:null,
   point:e=>({x:e.clientX,y:e.clientY}),draw:()=>{},showProperties:()=>{},$:()=>({setPointerCapture:()=>{}}),
   insertBetween:(...args)=>{inserted=args},
   window:{addEventListener:(_,fn)=>{pointerup=fn}},
   document:{elementFromPoint:()=>({closest:selector=>selector==='[data-node]'?(target?{dataset:{node:target}}:null):selector==='[data-comment]'?null:{}}),body:{classList:{remove:()=>{}}}}};
  runInNewContext(start+release,context);
  context.startDrag({button:0,ctrlKey:true,clientX:10,clientY:20,stopPropagation(){},preventDefault(){}},'s0');
  assert.equal(context.source,'s0');
  pointerup({clientX:200,clientY:100,ctrlKey:false});
  assert.deepEqual(inserted,target?['s2']:[null,{x:200,y:100}]);
 }
});

test('tree layout reserves separate bands for uneven subtrees and centers each parent',()=>{
 const m={start:'root',states:['root','a','b','a1','a2','a3','b1','b2'].map(id=>({id,name:id,token:'',x:0,y:0})),edges:[['root','a'],['root','b'],['a','a1'],['a','a2'],['a2','a3'],['b','b1'],['b','b2'],['b2','root']].map(([from,to])=>({from,to,label:'[a-z]'})),comments:[{id:'note',text:'Notes',x:0,y:0}]};
 autoLayout(m);const get=id=>m.states.find(s=>s.id===id);
 assert.ok(Math.max(...['a','a1','a2','a3'].map(id=>get(id).y))+150<Math.min(...['b','b1','b2'].map(id=>get(id).y)));
 assert.equal(get('root').y,(get('a').y+get('b').y)/2);
 assert.ok(get('a').x>get('root').x);assert.ok(get('a3').x>get('a2').x);
 assert.deepEqual(m.comments[0].nodeIds,['root']);assert.equal(m.comments[0].x,get('root').x);assert.equal(m.comments[0].y,get('root').y);
 const first=JSON.stringify(m);autoLayout(m);assert.equal(JSON.stringify(m),first);validate(m);
});

test('Ctrl-drag can start from the active connection source without inserting a self-loop immediately',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
 const start=app.slice(app.indexOf('function startDrag('),app.indexOf('function view('));
 let captured=false,inserted=false;
 const context={commentSource:null,source:'s0',space:false,point:e=>({x:e.clientX,y:e.clientY}),draw:()=>{},showProperties:()=>{},$:()=>({setPointerCapture:()=>{captured=true}}),insertBetween:()=>{inserted=true}};
 runInNewContext(start,context);
 context.startDrag({button:0,ctrlKey:true,pointerId:1,clientX:10,clientY:20,stopPropagation(){},preventDefault(){}},'s0');
 assert.equal(inserted,false);assert.equal(captured,true);assert.equal(context.rightStart.insert,true);assert.equal(context.source,'s0');
});
test('Ctrl pressed during an arrow drag stays latched until release',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
 const move=app.slice(app.indexOf("window.addEventListener('pointermove'"),app.indexOf("window.addEventListener('pointerup'"));
 let pointermove;
 const context={commentSource:null,source:'s0',marquee:null,pan:null,rightStart:{insert:false},point:()=>({x:100,y:200}),draw:()=>{},window:{addEventListener:(_,fn)=>{pointermove=fn}}};
 runInNewContext(move,context);pointermove({ctrlKey:true});pointermove({ctrlKey:false});assert.equal(context.rightStart.insert,true);
});

test('tree layout keeps a shared destination with its specific parent instead of a distant root shortcut',()=>{
 const m={start:'root',states:['root','integer','other','dot','double','underscore'].map(id=>({id,name:id,token:'',x:0,y:0})),edges:[['root','integer'],['root','other'],['integer','dot'],['dot','double'],['integer','underscore'],['underscore','integer'],['root','dot']].map(([from,to])=>({from,to,label:'x'}))};
 const edges=JSON.stringify(m.edges);autoLayout(m);const get=id=>m.states.find(s=>s.id===id);
 assert.ok(get('dot').x>get('integer').x);assert.ok(Math.abs(get('dot').y-get('integer').y)<300);
 assert.ok(get('other').y>Math.max(get('integer').y,get('dot').y,get('double').y,get('underscore').y));
 assert.equal(JSON.stringify(m.edges),edges);validate(m);
});
test('radial layout centers the parent and spreads children around it with descendants farther out',()=>{
 for(const count of [1,2,8,40]){
  const m={start:'q0',states:Array.from({length:count},(_,i)=>({id:'q'+i,name:'q'+i,token:'TOKEN_'+i,x:0,y:0})),edges:Array.from({length:count-1},(_,i)=>({from:'q0',to:'q'+(i+1),label:'x'}))};
  const edges=JSON.stringify(m.edges);autoLayout(m,'circle');const parent=m.states[0];
  const radii=m.states.slice(1).map(s=>Math.hypot(s.x-parent.x,s.y-parent.y));
  for(const r of radii)assert.ok(Math.abs(r-radii[0])<.00001);
  if(count>2){assert.ok(m.states.some(s=>s.x<parent.x-1));assert.ok(m.states.some(s=>s.x>parent.x+1))}
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)assert.ok(Math.hypot(m.states[i].x-m.states[j].x,m.states[i].y-m.states[j].y)>=319.99);
  assert.equal(JSON.stringify(m.edges),edges);validate(m);assert.doesNotThrow(()=>toTikz(m));const first=JSON.stringify(m);autoLayout(m,'circle');assert.equal(JSON.stringify(m),first);
 }
 const m={start:'root',states:['root','a','b','a1','a2','b1','isolated'].map(id=>({id,name:id,token:'',x:0,y:0})),edges:[['root','a'],['root','b'],['a','a1'],['a','a2'],['b','b1'],['a2','root']].map(([from,to])=>({from,to,label:'x'}))};
 autoLayout(m,'circle');const get=id=>m.states.find(s=>s.id===id),distance=id=>Math.hypot(get(id).x-get('root').x,get(id).y-get('root').y);
 assert.ok(distance('a1')>distance('a'));assert.ok(distance('b1')>distance('b'));
 for(let i=0;i<m.states.length;i++)for(let j=i+1;j<m.states.length;j++)assert.ok(Math.hypot(m.states[i].x-m.states[j].x,m.states[i].y-m.states[j].y)>=319.99);
 assert.doesNotThrow(()=>autoLayout({states:[],edges:[],start:null},'circle'));
});

test('layout density adjusts spacing in both modes without changing connections',()=>{
 for(const mode of ['tree','circle']){
  const source=example(),edges=JSON.stringify(source.edges),sizes=[];
  for(const spacing of [.35,.5,.75,1]){
   const m=autoLayout(structuredClone(source),mode,spacing),xs=m.states.map(s=>s.x),ys=m.states.map(s=>s.y);sizes.push((Math.max(...xs)-Math.min(...xs))+(Math.max(...ys)-Math.min(...ys)));
   assert.equal(JSON.stringify(m.edges),edges);assert.equal(m.start,source.start);validate(m);
   for(let i=0;i<m.states.length;i++)for(let j=i+1;j<m.states.length;j++)assert.ok(Math.hypot(m.states[i].x-m.states[j].x,m.states[i].y-m.states[j].y)>110);
  }
  assert.ok(sizes.every((size,i)=>i===0||size>sizes[i-1]));assert.ok(sizes[0]<=sizes[1]*.9);
  assert.deepEqual(autoLayout(structuredClone(source),mode,NaN),autoLayout(structuredClone(source),mode));
 }
});

test('transition label boxes round trip and toggle in TikZ without changing lexer behavior',()=>{
 const m=example(),before=tokenize(m,'hello 42'),plain=toTikz(m);
 assert.ok(!plain.includes('rounded corners=1pt'));
 m.labelBoxes=true;assert.equal(validate(JSON.parse(JSON.stringify(m))).labelBoxes,true);
 const boxed=toTikz(m);assert.equal((boxed.match(/draw=gray,rounded corners=1pt/g)||[]).length,m.edges.length);
 assert.deepEqual(tokenize(m,'hello 42'),before);
 m.labelBoxes=false;assert.equal(toTikz(m),plain);
 m.labelBoxes='yes';assert.throws(()=>validate(m),/label box/);
});

test('opaque TeX label boxes render after every transition arrow',()=>{
 const m=example();m.labelBoxes=true;const tex=toTikz(m);
 assert.ok(tex.indexOf('node[fill=white,draw=gray,rounded corners=1pt')>tex.lastIndexOf('draw[->]'));
 assert.equal((tex.match(/node\[fill=white,draw=gray/g)||[]).length,m.edges.length);
});

import {stateLabel} from './dist/labels.js';
test('state names wrap at whitespace only when too long, stay centered, and escape TeX',()=>{
 assert.deepEqual(stateLabel('  text in   string ').lines,['text in','string']);assert.deepEqual(stateLabel('a b').lines,['a b']);assert.deepEqual(stateLabel('identifier').lines,['identifier']);
 const label=stateLabel('one two three four five six seven eight nine ten eleven twelve');assert.ok(label.fontSize<12);assert.ok(label.lineHeight*label.lines.length<50);
 const m=example();m.states[1].name='string with ID_%';const before=JSON.stringify(m),tex=toTikz(m);assert.ok(tex.includes('\\shortstack{\\strut string\\\\\\strut with ID\\_\\%}'));assert.equal(JSON.stringify(m),before);
});

test('theme follows the system until overridden and remembers a manual choice',()=>{
 const script=readFileSync(new URL('./dist/theme.js',import.meta.url),'utf8');
 function run(saved,blocked=false){let systemChange,ready;const attrs={},savedValues={},button={setAttribute:(key,value)=>{attrs[key]=value}},root={dataset:{}};const media={matches:true,addEventListener:(_,fn)=>{systemChange=fn}};const context={matchMedia:()=>media,localStorage:{getItem:()=>{if(blocked)throw Error('blocked');return saved},setItem:(key,value)=>{if(blocked)throw Error('blocked');savedValues[key]=value}},document:{documentElement:root,getElementById:()=>button,addEventListener:(_,fn)=>{ready=fn}}};runInNewContext(script,context);ready();return {root,button,attrs,media,change:()=>systemChange(),savedValues}}
 const theme=run(null);assert.equal(theme.root.dataset.theme,'dark');theme.media.matches=false;theme.change();assert.equal(theme.root.dataset.theme,'light');theme.button.onclick();assert.equal(theme.root.dataset.theme,'dark');assert.equal(theme.attrs['aria-pressed'],'true');assert.equal(theme.savedValues['lexica-theme'],'dark');theme.media.matches=false;theme.change();assert.equal(theme.root.dataset.theme,'dark');
 assert.equal(run('light').root.dataset.theme,'light');assert.equal(run('dark').root.dataset.theme,'dark');const blocked=run(null,true);assert.doesNotThrow(()=>blocked.button.onclick());assert.equal(blocked.root.dataset.theme,'light');
});

import {makeComment} from './dist/comments.js';
test('comments begin exactly at the cursor and attach to the nearest state',()=>{
 const m=example(),p={x:450,y:100},c=makeComment(m,p,'cursor-note');
 assert.equal(c.x,p.x);assert.equal(c.y,p.y);assert.deepEqual(c.nodeIds,['s1']);
 assert.deepEqual(makeComment({states:[]},p,'free').nodeIds,[]);
});
test('tree and radial layouts preserve note offsets and leave detached notes in place',()=>{
 for(const mode of ['tree','circle'])for(const spacing of [.35,.75,1]){
  const m=example(),s=m.states[1];m.comments=[{id:'attached',text:'About identifiers',nodeId:s.id,x:s.x+80,y:s.y-100},{id:'free',text:'Free note',nodeId:null,x:-300,y:-500}];
  autoLayout(m,mode,spacing);assert.equal(m.comments[0].x-s.x,80);assert.equal(m.comments[0].y-s.y,-100);assert.equal(m.comments[1].x,-300);assert.equal(m.comments[1].y,-500);
  const first=JSON.stringify(m);autoLayout(m,mode,spacing);assert.equal(JSON.stringify(m),first);validate(m);
 }
});
test('copying states carries attached notes and remaps attachments, while notes alone detach',()=>{
 const m=example();m.comments=[makeComment(m,{x:450,y:100},'note')];
 const group=copySelection(m,new Set(['s1']),new Set(),new Set());assert.equal(group.comments.length,1);
 let n=0;pasteSelection(m,group,{x:40,y:40},()=>`attached-copy${n++}`);
 assert.deepEqual(m.comments.at(-1).nodeIds,['attached-copy0']);assert.equal(m.comments.at(-1).x,490);
 const noteOnly=copySelection(m,new Set(),new Set(),new Set(['note']));assert.deepEqual(noteOnly.comments[0].nodeIds,[]);
 const empty={start:null,states:[],edges:[]};pasteSelection(empty,noteOnly,{x:0,y:0},()=> 'free-copy');validate(empty);assert.deepEqual(empty.comments[0].nodeIds,[]);
 m.comments[0].nodeIds=['missing'];assert.throws(()=>validate(m),/attachment/);
});

import {commentAnchors,positionComments,commentLinks,toggleCommentNode} from './dist/comments.js';
test('several states share one comment with toggleable dashed attachments and centroid movement',()=>{
 const m=example();m.comments=[makeComment(m,{x:600,y:100},'note')];m.comments[0].nodeIds=['s0'];
 toggleCommentNode(m,'note','s1');assert.deepEqual(m.comments[0].nodeIds,['s0','s1']);
 const links=commentLinks(m);assert.equal(links.length,2);assert.ok(links.every(link=>Number.isFinite(link.from.x)&&Number.isFinite(link.to.y)));
 const anchors=commentAnchors(m);m.states[0].x+=100;positionComments(anchors);assert.equal(m.comments[0].x,650);
 const before=tokenize(m,'hi 42');assert.ok(toTikz(m).includes('draw[dashed,gray]'));assert.deepEqual(tokenize(m,'hi 42'),before);
 toggleCommentNode(m,'note','s0');assert.deepEqual(m.comments[0].nodeIds,['s1']);validate(m);
 m.comments[0].nodeIds=['s1','s1'];assert.throws(()=>validate(m),/attachment/);
});
test('many-state comment layouts preserve the centroid offset and copies remap only copied connections',()=>{
 for(const mode of ['tree','circle']){
  const m=example();m.comments=[{id:'note',text:'Shared explanation',x:700,y:50,nodeIds:['s0','s1']}];
  const center=()=>({x:(m.states[0].x+m.states[1].x)/2,y:(m.states[0].y+m.states[1].y)/2});const c=center(),dx=700-c.x,dy=50-c.y;
  autoLayout(m,mode);const after=center();assert.ok(Math.abs(m.comments[0].x-after.x-dx)<1e-8);assert.ok(Math.abs(m.comments[0].y-after.y-dy)<1e-8);
  const fragment=copySelection(m,new Set(['s1']),new Set(),new Set());assert.deepEqual(fragment.comments[0].nodeIds,['s1']);
  let n=0;pasteSelection(m,fragment,{x:40,y:40},()=>`multi-copy${n++}`);assert.deepEqual(m.comments.at(-1).nodeIds,['multi-copy0']);validate(m);
 }
});

test('comment joining finishes after one destination, in either direction, like state joining',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),handlers=app.slice(app.indexOf('function connectComment('),app.indexOf('function view('));
 const m=example();m.comments=[makeComment(m,{x:500,y:100},'note')];let checkpoints=0,chosen;
 const context={machine:m,source:null,commentSource:null,space:false,connectPoint:null,point:e=>({x:e.clientX,y:e.clientY}),connectCommentNode,commentLinkKey,checkpoint:()=>checkpoints++,choose:(...args)=>chosen=args,changed:()=>{},draw:()=>{},showProperties:()=>{},$:()=>({textContent:'',setPointerCapture:()=>{}}),cancelConnect:()=>{context.source=null;context.commentSource=null}};
 runInNewContext(handlers,context);const event=button=>({button,pointerId:1,clientX:10,clientY:20,stopPropagation(){},preventDefault(){}});
 const before=m.edges.length;context.startCommentConnection(event(2),'note');assert.equal(context.commentSource,'note');
 context.startDrag(event(0),'s0');assert.ok(m.comments[0].nodeIds.includes('s0'));assert.equal(context.commentSource,null);assert.equal(chosen[0],'comment-link');
 context.source='s2';context.startCommentConnection(event(2),'note');assert.ok(m.comments[0].nodeIds.includes('s2'));assert.equal(context.source,null);assert.equal(context.commentSource,null);assert.equal(m.edges.length,before);assert.equal(checkpoints,2);
 context.source='s2';context.startCommentConnection(event(0),'note');assert.equal(m.comments[0].nodeIds.filter(id=>id==='s2').length,1);
});

test('both layout dropdowns persist across reloads and reject invalid saved choices',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function restoreLayoutSettings('),app.indexOf("$('label-boxes').onclick"));
 const saved={'lexica-layout-mode':'circle','lexica-layout-density':'0.35'};
 const boot=()=>{const fields={'layout-mode':{value:'tree'},'layout-density':{value:'0.75'}};runInNewContext(script,{$:id=>fields[id],localStorage:{getItem:key=>saved[key],setItem:(key,value)=>saved[key]=value}});return fields};
 let fields=boot();assert.equal(fields['layout-mode'].value,'circle');assert.equal(fields['layout-density'].value,'0.35');
 fields['layout-mode'].value='tree';fields['layout-mode'].onchange();fields['layout-density'].value='0.5';fields['layout-density'].onchange();
 fields=boot();assert.equal(fields['layout-mode'].value,'tree');assert.equal(fields['layout-density'].value,'0.5');
 saved['lexica-layout-mode']='unknown';saved['lexica-layout-density']='1.5';fields=boot();assert.equal(fields['layout-mode'].value,'tree');assert.equal(fields['layout-density'].value,'1');
 const fallback={'layout-mode':{value:'tree'},'layout-density':{value:'0.75'}};
 assert.doesNotThrow(()=>runInNewContext(script,{$:id=>fallback[id],localStorage:{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}}}));
 assert.doesNotThrow(()=>fallback['layout-mode'].onchange());
});
test('dashed comment links terminate on the state circle and the comment box border',()=>{
 const m=example();m.comments=[{id:'note',text:'Explanation',x:650,y:50,nodeIds:['s0','s1']}];
 for(const link of commentLinks(m)){
  const state=m.states.find(s=>s.id===link.nodeId),note=m.comments[0],size=commentLayout(note);
  assert.ok(Math.abs(Math.hypot(link.to.x-state.x,link.to.y-state.y)-36)<1e-8);
  assert.ok(Math.min(Math.abs(link.from.x-note.x),Math.abs(link.from.x-note.x-size.w),Math.abs(link.from.y-note.y),Math.abs(link.from.y-note.y-size.h))<1e-8);
 }
});

import {parseMachine} from './dist/lexer.js';
test('pasted machine JSON shares file validation and enforces the 1 MB limit',()=>{
 const machine=example();machine.comments=[{id:'note',text:'Imported note',nodeIds:['s1'],x:450,y:100}];
 assert.deepEqual(parseMachine(JSON.stringify(machine)),machine);
 assert.throws(()=>parseMachine('   '),/Paste machine JSON/);assert.throws(()=>parseMachine('{broken'),/Invalid JSON/);
 assert.throws(()=>parseMachine(JSON.stringify({...machine,start:'missing'})),/start state/);
 assert.throws(()=>parseMachine('é'.repeat(500001)),/too large/);
});
test('invalid pasted imports preserve the graph and valid imports can be undone',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function importMachine('),app.indexOf("$('import').onclick"));
 const original=example(),history=[],fields={'import-dialog':{open:true,close(){this.open=false}},'import-json':{value:'pasted JSON'}};
 const context={machine:original,parseMachine,$:id=>fields[id],checkpoint:()=>history.push(JSON.stringify(context.machine)),cancelConnect:()=>{},clearSelection:()=>{},showProperties:()=>{},changed:()=>{},fit:()=>{},toast:()=>{}};
 runInNewContext(script,context);assert.throws(()=>context.importMachine('{broken'),/Invalid JSON/);assert.equal(context.machine,original);assert.equal(history.length,0);assert.equal(fields['import-dialog'].open,true);
 const next=example();next.states[1].name='Imported identifier';context.importMachine(JSON.stringify(next));
 assert.deepEqual(context.machine,next);assert.equal(fields['import-dialog'].open,false);assert.equal(fields['import-json'].value,'');assert.deepEqual(JSON.parse(history.pop()),original);
});

import {commentLinkKey,connectCommentNode,removeCommentLinks} from './dist/comments.js';
test('deleting selected dashed lines preserves their endpoints and unrelated connections',()=>{
 const m=example();m.comments=[{id:'note',text:'Shared note',x:550,y:50,nodeIds:['s0','s1']},{id:'note-two',text:'Second note',x:10,y:30,nodeIds:['s1']}];
 const before=structuredClone(m),keys=new Set([commentLinkKey('note','s1')]);removeCommentLinks(m,keys);
 assert.deepEqual(m.states,before.states);assert.deepEqual(m.edges,before.edges);assert.equal(m.comments.length,2);assert.deepEqual(m.comments[0].nodeIds,['s0']);assert.deepEqual(m.comments[1].nodeIds,['s1']);
 removeCommentLinks(m,new Set([commentLinkKey('note','s0')]));assert.deepEqual(m.comments[0].nodeIds,[]);commentAnchors(m);assert.deepEqual(m.comments[0].nodeIds,[]);validate(m);
});
test('selecting a dashed line can be copied with its comment and state endpoint',()=>{
 const m=example();m.comments=[{id:'note',text:'Note',x:550,y:50,nodeIds:['s0','s1']}];
 const fragment=copySelection(m,new Set(),new Set(),new Set(),new Set([commentLinkKey('note','s1')]));assert.deepEqual(fragment.states.map(s=>s.id),['s1']);assert.deepEqual(fragment.comments[0].nodeIds,['s1']);
 let n=0;pasteSelection(m,fragment,{x:40,y:40},()=>`connection-copy${n++}`);assert.deepEqual(m.comments.at(-1).nodeIds,['connection-copy0']);validate(m);
});
test('comment connection identities do not collide with arbitrary imported IDs',()=>{
 assert.notEqual(commentLinkKey('a:b','c'),commentLinkKey('a','b:c'));
 const m=example();m.comments=[{id:'note',text:'Note',x:500,y:80,nodeIds:[]}];
 connectCommentNode(m,'note','s1');connectCommentNode(m,'note','s1');assert.deepEqual(m.comments[0].nodeIds,['s1']);assert.throws(()=>connectCommentNode(m,'missing','s1'),/attachment/);
});

test('right-drag joins comments and states in either direction and cancels on blank canvas',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf("window.addEventListener('pointerup'"),app.indexOf('function add('));
 for(const scenario of ['comment-to-state','state-to-comment','comment-to-blank']){
  let release,joined,added,cancelled=0;
  const context={marquee:null,drag:null,pan:null,source:scenario==='state-to-comment'?'s0':null,commentSource:scenario==='state-to-comment'?null:'note',rightStart:scenario==='state-to-comment'?{id:'s0',x:0,y:0}:{commentId:'note',x:0,y:0},point:e=>({x:e.clientX,y:e.clientY}),connectComment:(...args)=>joined=args,add:(...args)=>added=args,cancelConnect:()=>cancelled++,window:{addEventListener:(_,fn)=>release=fn},document:{elementFromPoint:()=>({closest:selector=>selector==='[data-node]'&&scenario==='comment-to-state'?{dataset:{node:'s2'}}:selector==='[data-comment]'&&scenario==='state-to-comment'?{dataset:{comment:'note'}}:selector==='#canvas'?{}:null}),body:{classList:{remove:()=>{}}}}};
  runInNewContext(script,context);release({clientX:200,clientY:100,ctrlKey:false});
  if(scenario==='comment-to-blank'){assert.equal(added,undefined);assert.equal(cancelled,1)}else assert.deepEqual(joined,['note',scenario==='state-to-comment'?'s0':'s2']);
 }
});

test('direct links to shared destinations keep sibling branches close in tree and radial layouts',()=>{
 const punctuation=Array.from({length:18},(_,i)=>'punctuation'+i),ids=['root','integer','decimal','double',...punctuation,'period'];
 const source={start:'root',states:ids.map(id=>({id,name:id,token:'',x:0,y:0})),edges:[['root','integer'],['integer','decimal'],['decimal','double'],...punctuation.map(id=>['root',id]),['root','period'],['period','double']].map(([from,to])=>({from,to,label:'x'}))};
 for(const mode of ['tree','circle'])for(const density of [.35,.5,.75,1]){
  const m=autoLayout(structuredClone(source),mode,density),get=id=>m.states.find(s=>s.id===id),step=Math.max(120,320*density);
  assert.ok(Math.hypot(get('period').x-get('double').x,get('period').y-get('double').y)<step*4);
  assert.deepEqual(m.edges,source.edges);assert.equal(m.states.length,source.states.length);
  for(let i=0;i<m.states.length;i++)for(let j=i+1;j<m.states.length;j++)assert.ok(Math.hypot(m.states[i].x-m.states[j].x,m.states[i].y-m.states[j].y)>=72);
  const first=JSON.stringify(m);autoLayout(m,mode,density);assert.equal(JSON.stringify(m),first);
 }
});
test('clicking blank canvas during comment joining cancels without creating a state',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf("$('canvas').onpointerdown="),app.indexOf("$('canvas').oncontextmenu="));
 const canvas={};let cancelled=0,added=0;
 const context={$:()=>canvas,source:null,commentSource:'note',cancelConnect:()=>cancelled++,add:()=>added++};runInNewContext(script,context);
 canvas.onpointerdown({button:0,target:{closest:()=>null}});assert.equal(cancelled,1);assert.equal(added,0);
});

test('tips can be hidden, restored, and remember the choice without requiring storage',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function setTipsVisible('),app.indexOf("$('fit').onclick="));
 for(const unavailable of [false,true]){
  const elements={'tips-panel':{hidden:false},'show-tips':{hidden:true},'hide-tips':{}},saved={};
  const context={$:id=>elements[id],localStorage:{getItem:key=>{if(unavailable)throw Error();return saved[key]},setItem:(key,value)=>{if(unavailable)throw Error();saved[key]=value}}};
  runInNewContext(script,context);elements['hide-tips'].onclick();assert.equal(elements['tips-panel'].hidden,true);assert.equal(elements['show-tips'].hidden,false);
  if(!unavailable){runInNewContext(script,context);assert.equal(elements['tips-panel'].hidden,true)}
  elements['show-tips'].onclick();assert.equal(elements['tips-panel'].hidden,false);assert.equal(elements['show-tips'].hidden,true);
 }
});
