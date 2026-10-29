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
  let pointerup,inserted;const canvas={setPointerCapture(){}};
  const context={commentSource:null,source:null,space:false,marquee:null,rightStart:null,drag:null,pan:null,connectPoint:null,
   point:e=>({x:e.clientX,y:e.clientY}),draw:()=>{},showProperties:()=>{},$:()=>canvas,graph:{hitClient:()=>target?{type:'state',id:target}:null},
   insertBetween:(...args)=>{inserted=args},
   window:{addEventListener:(_,fn)=>{pointerup=fn}},
   document:{elementFromPoint:()=>canvas,body:{classList:{remove:()=>{}}}}};
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
 const context={commentSource:null,source:'s0',marquee:null,pan:null,rightStart:{insert:false},point:()=>({x:100,y:200}),queueDraw:()=>{},draw:()=>{},window:{addEventListener:(_,fn)=>{pointermove=fn}}};
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
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function restoreLayoutSettings('),app.indexOf("$('label-boxes').onchange"));
 const saved={'lexica-layout-mode':'circle','lexica-layout-density':'0.35'};
 const boot=()=>{const fields={'layout-mode':{value:'tree'},'layout-density':{value:'0.75'}};runInNewContext(script,{$:id=>fields[id],localStorage:{getItem:key=>saved[key],setItem:(key,value)=>saved[key]=value}});return fields};
 let fields=boot();assert.equal(fields['layout-mode'].value,'circle');assert.equal(fields['layout-density'].value,'0.35');
 fields['layout-mode'].value='tree';fields['layout-mode'].onchange();fields['layout-density'].value='0.5';fields['layout-density'].onchange();
 fields=boot();assert.equal(fields['layout-mode'].value,'tree');assert.equal(fields['layout-density'].value,'0.5');
 saved['lexica-layout-mode']='spring';fields=boot();assert.equal(fields['layout-mode'].value,'spring');
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
 const context={machine:original,parseMachine,restoreTester(){},$:id=>fields[id],checkpoint:()=>history.push(JSON.stringify(context.machine)),cancelConnect:()=>{},clearSelection:()=>{},showProperties:()=>{},changed:()=>{},fit:()=>{},toast:()=>{}};
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
  const context={graph:{hitClient:()=>scenario==='comment-to-state'?{type:'state',id:'s2'}:scenario==='state-to-comment'?{type:'comment',id:'note'}:null},marquee:null,drag:null,pan:null,source:scenario==='state-to-comment'?'s0':null,commentSource:scenario==='state-to-comment'?null:'note',rightStart:scenario==='state-to-comment'?{id:'s0',x:0,y:0}:{commentId:'note',x:0,y:0},point:e=>({x:e.clientX,y:e.clientY}),connectComment:(...args)=>joined=args,add:(...args)=>added=args,cancelConnect:()=>cancelled++,window:{addEventListener:(_,fn)=>release=fn},document:{elementFromPoint:()=>({closest:selector=>selector==='[data-node]'&&scenario==='comment-to-state'?{dataset:{node:'s2'}}:selector==='[data-comment]'&&scenario==='state-to-comment'?{dataset:{comment:'note'}}:selector==='#canvas'?{}:null}),body:{classList:{remove:()=>{}}}}};
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
 const context={graph:{hitClient:()=>null},space:false,$:()=>canvas,source:null,commentSource:'note',cancelConnect:()=>cancelled++,add:()=>added++};runInNewContext(script,context);
 canvas.onpointerdown({button:0,target:{closest:()=>null}});assert.equal(cancelled,1);assert.equal(added,0);
});

test('contextual tips remember their visibility independently of the shortcuts button',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function setTipsVisible('),app.indexOf("$('hide-tips').onclick="));
 for(const unavailable of [false,true]){const panel={hidden:false},saved={},context={$:()=>panel,localStorage:{setItem:(key,value)=>{if(unavailable)throw Error();saved[key]=value}}};runInNewContext(script,context);context.setTipsVisible(false);assert.equal(panel.hidden,true);if(!unavailable)assert.equal(saved['lexica-tips-hidden'],'true');context.setTipsVisible(true);assert.equal(panel.hidden,false)}
});

test('transition diagnostics identify unfinished rules and failed tokens retain the attempted path',async()=>{
 const {transitionError}=await import('./dist/lexer.js');
 const m={start:'a',states:[{id:'a',name:'start',token:'',x:0,y:0},{id:'b',name:'pending',token:'',x:100,y:0}],edges:[{from:'a',to:'b',label:'x'}]};
 assert.equal(transitionError(m,m.edges[0]),'');
 assert.match(transitionError(m,{...m.edges[0],label:''}),/empty/);
 assert.match(transitionError(m,{...m.edges[0],label:'['}),/Invalid/);
 const [failed]=tokenize(m,'x');assert.equal(failed.failureState,'b');assert.deepEqual(failed.traceStates,['a','b']);assert.deepEqual(failed.traceEdges,[0]);
 m.edges.push({...m.edges[0]});assert.throws(()=>tokenize(m,'x'),error=>error.stateId==='a'&&error.edgeIndices.join(',')==='0,1');
});

test('wheel pans both axes at canvas scale, shift pans horizontally, and pinch zooms',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');const script=app.slice(app.indexOf("$('zoom-in').onclick="),app.indexOf('\n',app.indexOf("$('zoom-in').onclick=")));
 let wheel,next,zoomed;const elements={'zoom-in':{},'zoom-out':{},canvas:{clientWidth:800,clientHeight:400,addEventListener:(name,fn)=>wheel=fn}};
 runInNewContext(script,{$:id=>elements[id],view:()=>({x:10,y:20,width:1600,height:800}),setView:v=>next=v,zoom:(...args)=>zoomed=args,point:()=>({x:0,y:0}),wheelZoomFactor,editorSettings:{pinchSensitivity:1},Math});
 const event={preventDefault(){},deltaX:30,deltaY:10,deltaMode:0};wheel(event);assert.equal(next.x,70);assert.equal(next.y,40);assert.equal(next.width,1600);
 wheel({...event,deltaX:0,deltaY:3,deltaMode:1,shiftKey:true});assert.equal(next.x,106);assert.equal(next.y,20);
 wheel({...event,ctrlKey:true});assert.equal(zoomed[0],wheelZoomFactor(10));
 wheel({...event,deltaY:-120,ctrlKey:true});assert.equal(zoomed[0],wheelZoomFactor(-120));
 elements['zoom-in'].onclick();assert.equal(zoomed[0],.8);elements['zoom-out'].onclick();assert.equal(zoomed[0],1.25);
 wheel({...event,deltaY:1000,ctrlKey:true});assert.equal(zoomed[0],wheelZoomFactor(1000));
});

test('inverted transitions complement one-character matches and survive saves, copies, and TeX',async()=>{
 const {matcher}=await import('./dist/lexer.js');
 const exceptEol=matcher('[\\r\\n\\u2028\\u2029]',true);for(const ch of ['a','😀',' '])assert.equal(exceptEol(ch),true);for(const ch of ['\r','\n','\u2028','\u2029'])assert.equal(exceptEol(ch),false);
 assert.throws(()=>matcher('',true),/empty/);assert.throws(()=>matcher('[',true),/Invalid/);
 const m={start:'a',states:[{id:'a',name:'start',token:'',x:0,y:0},{id:'b',name:'text',token:'TEXT',x:200,y:0}],edges:[{from:'a',to:'b',label:'[\\r\\n]',invert:true}]};
 assert.equal(tokenize(m,'a')[0].token,'TEXT');assert.equal(tokenize(m,'\n')[0].token,'ERROR');
 assert.equal(parseMachine(JSON.stringify(m)).edges[0].invert,true);assert.match(toTikz(m),/not \(/);
 const fragment=copySelection(m,new Set(['a','b']),new Set(),new Set());let n=0;pasteSelection(m,fragment,{x:10,y:10},()=>`inverted${n++}`);assert.equal(m.edges.at(-1).invert,true);
 m.edges[0].invert='yes';assert.throws(()=>validate(m),/Invalid transition/);
});

test('docking chooses the nearest edge and validates saved panel positions',async()=>{
 const {nearestDock,dockSettings}=await import('./dist/docking.js');
 for(const [x,y,side] of [[400,5,'top'],[400,590,'bottom'],[5,300,'left'],[795,300,'right']])assert.equal(nearestDock(x,y,800,600),side);
 assert.deepEqual(dockSettings({toolbar:'right',tester:'left'}),{toolbar:'right',tester:'left'});
 assert.deepEqual(dockSettings({toolbar:'bad',tester:null}),{toolbar:'top',tester:'bottom'});
 assert.deepEqual(dockSettings(null),{toolbar:'top',tester:'bottom'});
});

test('panel grips persist keyboard and drag docking, and cancel without changing layout',()=>{
 const script=readFileSync(new URL('./dist/docking.js',import.meta.url),'utf8').replaceAll('export ','')+'\nsetupDocking();';
 const grip=()=>({setPointerCapture(){},hasPointerCapture:()=>false}),grips={'toolbar-grip':grip(),'tester-grip':grip()},preview={setAttribute(){},dataset:{}},saved={};
 const body={dataset:{},append(){},classList:{add(){},remove(){}}};
 const context={document:{body,createElement:()=>preview,getElementById:id=>grips[id]},window:{innerWidth:800,innerHeight:600,dispatchEvent(){}},Event:class{},localStorage:{getItem:()=>null,setItem:(k,v)=>saved[k]=v}};
 runInNewContext(script,context);assert.equal(body.dataset.testerDock,'bottom');
 const event={button:0,pointerId:1,clientX:400,clientY:580,preventDefault(){},stopPropagation(){}};
 grips['tester-grip'].onpointerdown(event);grips['tester-grip'].onpointermove({...event,clientX:5,clientY:300});assert.equal(preview.dataset.side,'left');assert.equal(preview.hidden,false);
 grips['tester-grip'].onpointerup(event);assert.equal(body.dataset.testerDock,'left');assert.equal(JSON.parse(saved['lexica-docks']).tester,'left');assert.equal(preview.hidden,true);
 grips['toolbar-grip'].onkeydown({...event,key:'ArrowRight'});assert.equal(body.dataset.toolbarDock,'right');
 grips['toolbar-grip'].onpointerdown(event);grips['toolbar-grip'].onpointermove({...event,clientX:400,clientY:0});grips['toolbar-grip'].onpointercancel(event);assert.equal(body.dataset.toolbarDock,'right');
});

test('toolbar popovers open beside vertical docks and stay within the viewport',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function setupPopover('),app.indexOf("setupPopover('layout-toggle'"));
 for(const [dock,left,expected] of [['left',18,'74px'],['right',680,'432px']]){
  const handlers={},menu={style:{},addEventListener:(name,fn)=>handlers[name]=fn},toggle={getBoundingClientRect:()=>({left,top:400,bottom:432})};
  const context={$:id=>id==='menu'?menu:toggle,document:{body:{dataset:{toolbarDock:dock}},querySelector:()=>({getBoundingClientRect:()=>({left,right:left+48,top:76})})},window:{innerWidth:745,innerHeight:919}};
  runInNewContext(script+"setupPopover('toggle','menu');",context);handlers.beforetoggle({newState:'open'});assert.equal(menu.style.left,expected);assert.equal(menu.style.top,'400px');
 }
});

test('properties use the full canvas height with a side-docked tester and stay inside the canvas',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function showProperties('),app.indexOf('\n',app.indexOf('function showProperties(')));
 for(const area of [{left:0,right:425,top:0,bottom:919,width:425},{left:320,right:745,top:0,bottom:919,width:425},{left:0,right:745,top:190,bottom:919,width:745}]){
  const panel={style:{},offsetWidth:240,offsetHeight:500};
  const context={graph:{selectionBox:()=>null},selection:{type:'edge',index:0},document:{body:{classList:{toggle(){}}},querySelector:s=>s==='.inspector'?panel:null},$:id=>id==='canvas'?{getBoundingClientRect:()=>area}:{setAttribute(){}},window:{innerWidth:745}};
  runInNewContext(script+"showProperties(true,{clientX:700,clientY:100});",context);
  assert.equal(panel.style.maxHeight,(area.bottom-area.top-84)+'px');assert.ok(parseFloat(panel.style.left)>=area.left);assert.ok(parseFloat(panel.style.left)+240<=area.right);assert.ok(parseFloat(panel.style.top)>=area.top+72);
 }
});

test('clicking a token selects its exact UTF-16 input range, including errors and skipped gaps',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function focusToken('),app.indexOf('function focusInputToken('));
 let focused=0,selected,synced=0;const input={focus:()=>focused++,setSelectionRange:(...range)=>selected=range,getBoundingClientRect:()=>({})},tokens={};
 const visibleTokens=[{token:'WORD',value:'hello',offset:3},{token:'ERROR',value:'😀',offset:10}];
 runInNewContext(script,{$:id=>id==='input'?input:id==='tokens'?tokens:{querySelector:()=>null},visibleTokens,inputHighlights:{rect:()=>null},stepper:{reset(){}},focusInputToken(){},syncInputLayout:()=>synced++});
 tokens.onclick({target:{closest:()=>({dataset:{tokenIndex:'0'}})}});assert.deepEqual(selected,[3,8]);
 let prevented=false;tokens.onkeydown({key:'Enter',preventDefault:()=>prevented=true,stopPropagation(){},target:{closest:()=>({dataset:{tokenIndex:'1'}})}});assert.deepEqual(selected,[10,12]);assert.equal(prevented,true);assert.equal(focused,2);assert.equal(synced,2);
});

test('tester resize clamps dimensions, supports every dock, persists and cancels drags',async()=>{
 const {testerSize}=await import('./dist/tester-resize.js');
 assert.equal(testerSize(900,'right',800,600),560);assert.equal(testerSize(10,'bottom',800,600),140);
 const script=readFileSync(new URL('./dist/tester-resize.js',import.meta.url),'utf8').replaceAll('export ','')+'\nsetupTesterResize();';
 for(const dock of ['top','bottom','left','right']){
  const css={},attributes={},saved={},handle={setAttribute:(k,v)=>attributes[k]=v,setPointerCapture(){},hasPointerCapture:()=>false},vertical=['left','right'].includes(dock);
  const body={dataset:{testerDock:dock},style:{setProperty:(k,v)=>css[k]=v},classList:{add(){},remove(){}}};
  const panel={getBoundingClientRect:()=>({width:parseFloat(css['--tester-width']),height:parseFloat(css['--tester-height'])})};
  runInNewContext(script,{document:{body,getElementById:()=>handle,querySelector:()=>panel},window:{innerWidth:800,innerHeight:600,addEventListener(){},dispatchEvent(){}},localStorage:{getItem:()=>null,setItem:(k,v)=>saved[k]=v},Event:class{}});
  const event={button:0,pointerId:1,clientX:400,clientY:300,preventDefault(){},stopPropagation(){}};
  handle.onpointerdown(event);handle.onpointermove({...event,clientX:450,clientY:350});handle.onpointerup(event);
  const key=vertical?'width':'height',expected=(vertical?320:190)+(['top','left'].includes(dock)?50:-50);
  assert.equal(JSON.parse(saved['lexica-tester-size'])[key],expected);assert.equal(attributes['aria-orientation'],vertical?'vertical':'horizontal');
  handle.onpointerdown(event);handle.onpointermove({...event,clientX:500,clientY:400});handle.onpointercancel(event);assert.equal(parseFloat(css[vertical?'--tester-width':'--tester-height']),expected);
 }
});

test('input caret and selections highlight matching tokens and traces without moving focus',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function focusInputToken('),app.indexOf("$('input').onclick=focusInputToken"));
 const input={value:'hi 42😀',selectionStart:3,selectionEnd:3},active=new Set();let traced,scrolled;
 const visibleTokens=[{offset:0,value:'hi',traceStates:['start','word'],traceEdges:[0]},{offset:3,value:'42',traceStates:['start','number'],traceEdges:[1]},{offset:5,value:'😀',token:'ERROR',traceStates:['start'],traceEdges:[]}];
 const elements=visibleTokens.map((_,i)=>({dataset:{tokenIndex:String(i)},classList:{toggle:(name,on)=>on?active.add(i):active.delete(i)},setAttribute(){}}));
 const context={stepper:{active:()=>false},visibleTokens,$:id=>id==='input'?input:{querySelector:selector=>({scrollIntoView:()=>scrolled=selector})},document:{querySelectorAll:()=>elements},traceToken:t=>traced=t};
 runInNewContext(script+'focusInputToken();',context);assert.deepEqual([...active],[1]);assert.equal(traced.traceEdges[0],1);assert.match(scrolled,/1/);
 input.selectionStart=2;input.selectionEnd=2;runInNewContext('focusInputToken();',context);assert.equal(active.size,0);assert.equal(traced,null);
 input.selectionStart=0;input.selectionEnd=5;runInNewContext('focusInputToken();',context);assert.deepEqual([...active],[0,1]);assert.equal(traced.traceEdges.length,2);
 input.selectionStart=7;input.selectionEnd=7;runInNewContext('focusInputToken();',context);assert.deepEqual([...active],[2]);assert.equal(traced.token,'ERROR');
});

test('canvas resizing updates the minimap view while preserving zoom and graph center',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('let canvasSize='),app.indexOf('new ResizeObserver(resizeCanvas)'));
 const canvas={clientWidth:800,clientHeight:600};let current={x:100,y:200,width:1600,height:1200},maps=0;
 const context={$:()=>canvas,view:()=>current,setView:v=>{current=v;maps++},syncInputLayout(){},document:{body:{classList:{contains:()=>true}}}};
 runInNewContext(script,context);
 for(const [width,height] of [[500,600],[500,850],[900,850],[900,500],[800,600]]){
  canvas.clientWidth=width;canvas.clientHeight=height;runInNewContext('resizeCanvas();',context);
  assert.equal(current.width/width,2);assert.equal(current.height/height,2);assert.equal(current.x+current.width/2,900);assert.equal(current.y+current.height/2,800);
 }
 assert.equal(maps,5);runInNewContext('resizeCanvas();',context);assert.equal(maps,5);
});

test('show skipped tokens restores skipped cards without changing lexer output or offsets',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function test(){'),app.indexOf("$('input').oninput="));
 const m=example(),all=tokenize(m,'hello 42'),elements={input:{value:'hello 42'},tokens:{},'show-skipped':{checked:false},'input-highlights':{}};
 const context={$:id=>elements[id],machine:m,hideInputTokenHover(){},tokenize,errorNav:{update(){}},traceToken(){},markFailures(){},tokenColorClass:()=>'',esc:s=>s,renderInputHighlights(){},visibleTokens:[]};
 runInNewContext(script+'test();',context);assert.equal(context.visibleTokens.length,2);assert.doesNotMatch(elements.tokens.innerHTML,/· skip/);
 elements['show-skipped'].checked=true;runInNewContext('test();',context);assert.equal(context.visibleTokens.length,3);assert.equal(context.visibleTokens[1].value,' ');assert.equal(context.visibleTokens[1].offset,5);assert.match(elements.tokens.innerHTML,/WS · skip/);assert.deepEqual(tokenize(m,'hello 42'),all);
});

test('grid pans and scales with world coordinates, including centered SVG viewports',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function syncGrid('),app.indexOf('function setView('));
 let v={x:0,y:0,width:800,height:600};const grid={style:{}},canvas={clientWidth:800,clientHeight:600};
 const context={$:()=>canvas,view:()=>v,document:{querySelector:()=>grid}};runInNewContext(script+'syncGrid();',context);
 assert.equal(grid.style.backgroundSize,'100px 100px');assert.equal(grid.style.backgroundPosition,'-50px -50px');
 v={...v,x:30,y:50};runInNewContext('syncGrid();',context);assert.equal(grid.style.backgroundPosition,'-80px -100px');
 v={x:30,y:50,width:640,height:480};runInNewContext('syncGrid();',context);assert.equal(grid.style.backgroundSize,'125px 125px');assert.equal(grid.style.backgroundPosition,'-100px -125px');
 v={x:0,y:0,width:800,height:400};runInNewContext('syncGrid();',context);assert.equal(grid.style.backgroundPosition,'-50px 50px');
 v={x:0,y:0,width:30000,height:22500};runInNewContext('syncGrid();',context);assert.ok(Math.abs(parseFloat(grid.style.backgroundSize)-100*800/30000)<.001);
});

test('self loops evaluate all four orientations and choose the unobstructed side',()=>{
 const directions=[[0,-1],[1,0],[0,1],[-1,0]];
 for(let open=0;open<4;open++){
  const states=[{id:'root',name:'root',token:'',x:0,y:0},...directions.filter((_,i)=>i!==open).map(([x,y],i)=>({id:'block'+i,name:'block',token:'',x:x*105,y:y*105}))];
  const m={start:'root',states,edges:[{from:'root',to:'root',label:'x'}]},r=routeEdges(m)[0],x=(r.c1.x+r.c2.x)/2,y=(r.c1.y+r.c2.y)/2;
  assert.ok(x*directions[open][0]+y*directions[open][1]>0);assert.equal(Math.round(Math.abs(directions[open][0]?y:x)),0);
  assert.deepEqual(routeEdges(m),routeEdges(m));
 }
 const orientations=new Set();for(const id of ['a','b','c','d']){const r=routeEdges({start:id,states:[{id,name:id,token:'',x:0,y:0}],edges:[{from:id,to:id,label:'x'}]})[0];orientations.add(Math.round(Math.atan2(r.c1.y+r.c2.y,r.c1.x+r.c2.x)*180/Math.PI))}assert.equal(orientations.size,4);
});

test('connection preview stays a routed self loop inside its source and becomes an arrow outside',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function connectionPreviewPath('),app.indexOf('function draw(){'));
 const machine=example(),a=machine.states[0],original=JSON.stringify(machine),context={machine,lastTransitionRule:'[0-9]',routeEdges};runInNewContext(script,context);
 const expected=routeEdges({...machine,edges:[...machine.edges,{from:a.id,to:a.id,label:'[0-9]'}]}).at(-1).d;
 context.a=a;context.p={x:a.x,y:a.y};assert.equal(runInNewContext('connectionPreviewPath(a,p)',context),expected);
 context.p={x:a.x+36,y:a.y};assert.equal(runInNewContext('connectionPreviewPath(a,p)',context),expected);
 context.p={x:a.x+37,y:a.y};assert.equal(runInNewContext('connectionPreviewPath(a,p)',context),`M ${a.x} ${a.y} L ${a.x+37} ${a.y}`);
 context.p={x:a.x,y:a.y};assert.equal(runInNewContext('connectionPreviewPath(a,p)',context),expected);assert.equal(JSON.stringify(machine),original);
});

test('routing reuses unchanged graph geometry and invalidates when nodes, rules or comments change',()=>{
 const m=example(),initial=routeEdges(m);assert.equal(routeEdges(m),initial);
 m.states[0].x+=25;const moved=routeEdges(m);assert.notEqual(moved,initial);assert.equal(routeEdges(m),moved);
 m.edges[0].label='[a-zA-Z0-9_]';const edited=routeEdges(m);assert.notEqual(edited,moved);
 m.comments=[{id:'note',text:'Note',x:200,y:100}];const noted=routeEdges(m);assert.notEqual(noted,edited);m.comments[0].x+=30;assert.notEqual(routeEdges(m),noted);
});
test('pointer redraws are coalesced into one animation frame using the latest model',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('let drawFrame='),app.indexOf('function render(){'));
 let frames=[],draws=0,maps=0;const context={requestAnimationFrame:fn=>{frames.push(fn);return frames.length},draw:()=>draws++,drawMap:()=>maps++};runInNewContext(script,context);
 runInNewContext('queueDraw();queueDraw();queueDraw();',context);assert.equal(frames.length,1);assert.equal(draws,0);frames[0]();assert.equal(draws,1);assert.equal(maps,1);
 runInNewContext('queueDraw();',context);assert.equal(frames.length,2);
});

import {crossingPairs} from './dist/layout.js';
import {lexerSteps} from './dist/lexer.js';
test('tree and radial layouts keep stable subtree placement without changing topology',()=>{
 const links=[['s2','s3'],['s5','s7'],['s0','s3'],['s7','s5'],['s0','s6'],['s2','s4'],['s5','s8'],['s2','s9'],['s8','s3'],['s6','s5'],['s2','s1'],['s0','s3']];
 const m={start:'s0',states:Array.from({length:10},(_,i)=>({id:'s'+i,name:'state'+i,token:'',x:0,y:0})),edges:[...Array.from({length:9},(_,i)=>['s0','s'+(i+1)]),...links].map(([from,to])=>({from,to,label:'x'}))};
 for(const mode of ['tree','circle']){
  const next=autoLayout(structuredClone(m),mode);assert.deepEqual(next.edges,m.edges);assert.equal(next.states.length,10);
  const first=JSON.stringify(next);autoLayout(next,mode);assert.equal(JSON.stringify(next),first);
  for(let i=0;i<next.states.length;i++)for(let j=i+1;j<next.states.length;j++)assert.ok(Math.hypot(next.states[i].x-next.states[j].x,next.states[i].y-next.states[j].y)>=72);
 }
});
test('optional layout portals remove remaining routed crossings without adding states or changing tokens',()=>{
 const m={start:'r',states:['r','a','b','c','x','y','z'].map((id,i)=>({id,name:id,token:i>3?'END':'',x:0,y:0})),edges:[['r','a','a'],['r','b','b'],['r','c','c'],...['a','b','c'].flatMap(a=>['x','y','z'].map((b,i)=>[a,b,String(i)]))].map(([from,to,label])=>({from,to,label}))};
 const before=tokenize(m,'a0b1c2'),plain=autoLayout(structuredClone(m));assert.ok(crossingPairs(plain,true).length>0);assert.ok(plain.edges.every(e=>e.portal==null));
 autoLayout(m,'tree',1,true);assert.equal(m.states.length,7);assert.equal(m.edges.length,12);assert.ok(m.edges.some(e=>e.portal));assert.equal(crossingPairs(m,true).length,0);assert.deepEqual(tokenize(m,'a0b1c2'),before);validate(m);assert.doesNotThrow(()=>toTikz(m));
 for(const e of m.edges)assert.equal(destination(m,e).id,e.to);
});
test('character steps use Unicode code points, portal targets, inversion and the same emitted tokens',()=>{
 const m=example();enablePortal(m,m.edges[0]);m.edges[0].label='[\\r\\n0-9 ]';m.edges[0].invert=true;
 const input='😀 42\n',steps=[...lexerSteps(m,input)],reads=steps.filter(s=>s.kind==='character');
 assert.equal(reads[0].character,'😀');assert.equal(reads[0].end,2);assert.equal(reads[0].state,'s1');assert.equal(steps.at(-1).kind,'done');
 assert.deepEqual(steps.filter(s=>s.result).map(s=>s.result),tokenize(m,input));assert.ok(steps.some(s=>s.result?.skip));
});
test('stepping exposes longest-match backtracking, nonaccepting errors and ambiguity',()=>{
 const m={start:'a',states:[['a',''],['b','B'],['c','']].map(([id,token],i)=>({id,name:id,token,x:i*150,y:0})),edges:[{from:'a',to:'b',label:'a'},{from:'b',to:'c',label:'b'}]};
 const steps=[...lexerSteps(m,'ab!')];assert.ok(steps.some(s=>s.message.includes('Backtrack to 1')));assert.ok(steps.some(s=>s.kind==='blocked'));assert.deepEqual(steps.filter(s=>s.result).map(s=>s.result),tokenize(m,'ab!'));
 m.states[1].token='';const errors=[...lexerSteps(m,'a')];assert.equal(errors.find(s=>s.result).result.failureState,'b');
 m.edges.push({...m.edges[0]});assert.throws(()=>[...lexerSteps(m,'a')],/Ambiguous/);assert.equal([...lexerSteps(example(),'')].at(-1).kind,'done');
});

test('portals assign a usable generated name to an unnamed destination',()=>{
 const m=example();m.states[1].name='';enablePortal(m,m.edges[0]);assert.equal(m.edges[0].portal,'STATE');assert.equal(destination(m,m.edges[0]).id,'s1');validate(m);
});

test('debugger buttons share a live session and input clicks retarget without disabling debugging',()=>{
 const source=readFileSync(new URL('./dist/stepping.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'').replace('export function','function');
 const ids=['input','step-controls','step-toggle','step-prev','step-next','step-prev-token','step-next-token','step-stop','step-status','step-memory'],elements=Object.fromEntries(ids.map(id=>[id,{setAttribute(){},replaceChildren(){}}])),events={};
 elements.input.value='hello 42 world';elements.input.selectionStart=7;elements.input.addEventListener=(name,fn)=>events[name]=fn;
 let resets=0,frame;const context={document:{getElementById:id=>elements[id],querySelector:()=>({classList:{add(){},remove(){}}}),createElement:()=>({append(){}})},createDebugSession,getMachine:()=>example(),getTokens:()=>tokenize(example(),elements.input.value),traceToken:value=>frame=value,markFailures(){},highlights:{clearStep(){},step:()=>null},onReset:()=>resets++};
 runInNewContext(source+'\nvar controller=setupStepping({getMachine,getTokens,traceToken,markFailures,highlights,onReset});',context);context.controller.toggle();assert.equal(frame.tokenStart,6);elements['step-next'].onclick();assert.equal(frame.character,'4');elements['step-next-token'].onclick();assert.equal(frame.tokenStart,8);elements['step-prev-token'].onclick();assert.equal(frame.tokenStart,6);elements.input.selectionStart=1;events.click();assert.equal(frame.tokenStart,0);elements.input.selectionStart=7;events.keyup({key:'ArrowRight'});assert.equal(frame.tokenStart,6);assert.equal(context.controller.active(),true);assert.equal(resets,0);events.input();assert.equal(context.controller.active(),false);assert.equal(resets,1);context.controller.toggle();assert.equal(elements['step-toggle'].hidden,true);elements['step-stop'].onclick();assert.equal(context.controller.active(),false);assert.equal(elements['step-toggle'].hidden,false);assert.equal(elements['step-controls'].hidden,true);
});

test('debugger changes repaint the Canvas without changing machine data',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('function traceToken('),app.indexOf("$('tokens').onpointerover="));
 const frames=[],context={graphTrace:null,draw:()=>frames.push(context.graphTrace)};runInNewContext(script,context);const frame={kind:'character',state:'b',traceStates:['a','b'],traceEdges:[0,1]};context.traceToken(frame);assert.equal(frames[0],frame);context.traceToken(null);assert.equal(frames[1],null);
});

test('spring layout separates states, preserves lexer semantics and comment offsets, and is deterministic from the same positions',()=>{
 for(const spacing of [.35,.5,.75,1]){
  const m=example();m.states.push({id:'disconnected',name:'alone',token:'',x:0,y:0});m.comments=[{id:'note',text:'Note',x:m.states[1].x+70,y:m.states[1].y-80,nodeIds:['s1']}];
  const source=structuredClone(m),before=tokenize(m,'hi 42'),edges=structuredClone(m.edges);autoLayout(m,'spring',spacing);validate(m);assert.deepEqual(m.edges,edges);assert.deepEqual(tokenize(m,'hi 42'),before);
  for(let i=0;i<m.states.length;i++)for(let j=i+1;j<m.states.length;j++)assert.ok(Math.hypot(m.states[i].x-m.states[j].x,m.states[i].y-m.states[j].y)>=88);
  assert.ok(Math.abs(m.comments[0].x-m.states[1].x-70)<1e-6);assert.ok(Math.abs(m.comments[0].y-m.states[1].y+80)<1e-6);
  const repeated=autoLayout(source,'spring',spacing);assert.deepEqual(repeated.states.map(s=>[s.x,s.y]),m.states.map(s=>[s.x,s.y]));
 }
});
test('spring density controls spacing and supports cycles, portals, coincident nodes, and a single state',()=>{
 const source=example();enablePortal(source,source.edges[0]);source.edges.push({from:'s1',to:'s0',label:'!'});for(const s of source.states){s.x=0;s.y=0}
 const compact=autoLayout(structuredClone(source),'spring',.35),spacious=autoLayout(structuredClone(source),'spring',1);
 const length=m=>m.edges.filter(e=>e.from!==e.to).reduce((n,e)=>{const a=m.states.find(s=>s.id===e.from),b=destination(m,e);return n+Math.hypot(a.x-b.x,a.y-b.y)},0);
 assert.ok(length(spacious)>length(compact));assert.deepEqual(tokenize(compact,'hello 42'),tokenize(spacious,'hello 42'));
 const one={start:'a',states:[{id:'a',name:'a',token:'A',x:0,y:0}],edges:[{from:'a',to:'a',label:'a'}]};autoLayout(one,'spring');assert.ok(Number.isFinite(one.states[0].x));assert.doesNotThrow(()=>toTikz(one));
});

test('spring layout can automatically portalize crossings without changing state or transition counts',()=>{
 const m={start:'r',states:['r','a','b','c','x','y','z'].map((id,i)=>({id,name:id,token:i>3?'END':'',x:0,y:0})),edges:[['r','a','a'],['r','b','b'],['r','c','c'],...['a','b','c'].flatMap(a=>['x','y','z'].map((b,i)=>[a,b,String(i)]))].map(([from,to,label])=>({from,to,label}))};
 const expected=tokenize(m,'a0b1c2');autoLayout(m,'spring',.75,true);assert.equal(crossingPairs(m,true).length,0);assert.equal(m.states.length,7);assert.equal(m.edges.length,12);assert.deepEqual(tokenize(m,'a0b1c2'),expected);
});


import {springSettings,SPRING_DEFAULTS} from './dist/spring-settings.js';
test('spring settings validate saved values and clamp each independent force control',()=>{
 assert.deepEqual(springSettings(),SPRING_DEFAULTS);assert.deepEqual(springSettings(null),SPRING_DEFAULTS);
 assert.deepEqual(springSettings({center:-1,repel:500,link:NaN,distance:2}),{center:0,repel:20,link:.4,distance:40});
});
test('spring solver lets the initial state move and applies link force and distance independently',()=>{
 const source={start:'a',states:[{id:'a',name:'a',token:'',x:0,y:0},{id:'b',name:'b',token:'',x:600,y:0}],edges:[{from:'a',to:'b',label:'x'}]};
 const run=forces=>autoLayout(structuredClone(source),'spring',1,false,{center:0,repel:0,link:1,distance:300,...forces}),distance=m=>Math.hypot(m.states[0].x-m.states[1].x,m.states[0].y-m.states[1].y);
 const relaxed=run({});assert.ok(Math.abs(distance(relaxed)-300)<2);assert.ok(Math.abs(relaxed.states[0].x-source.states[0].x)>100);
 assert.deepEqual(run({link:0}).states,source.states);assert.ok(distance(run({distance:500}))>distance(run({distance:150}))+250);
 assert.ok(relaxed.states.every(s=>!('vx' in s)&&!('vy' in s)&&!('index' in s)&&!('fx' in s)));
});
test('repulsion spreads nodes and center attraction controls compactness without subtree grouping',()=>{
 const source={start:'a',states:[{id:'a',name:'a',token:'',x:-200,y:0},{id:'b',name:'b',token:'',x:200,y:0}],edges:[]};
 const run=forces=>autoLayout(structuredClone(source),'spring',1,false,{center:.12,repel:5,link:0,distance:320,...forces}),distance=m=>Math.hypot(m.states[0].x-m.states[1].x,m.states[0].y-m.states[1].y);
 assert.ok(distance(run({center:0,repel:10}))>distance(run({center:0,repel:2})));assert.ok(distance(run({center:1}))<distance(run({center:.05})));
});

test('spring force controls persist, reset, and are only shown for Spring layout',()=>{
 const script=readFileSync(new URL('./dist/spring-controls.js',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('export function','function'),elements={},events={},saved={};
 for(const key of Object.keys(SPRING_DEFAULTS)){elements['spring-'+key]={};elements['spring-'+key+'-value']={}}
 elements['spring-reset']={};elements['spring-forces']={};elements['layout-mode']={value:'spring',addEventListener:(name,fn)=>events[name]=fn};elements['layout-menu']={matches:()=>false};
 const context={document:{getElementById:id=>elements[id]},SPRING_DEFAULTS,springSettings,localStorage:{getItem:key=>saved[key],setItem:(key,value)=>saved[key]=value}};
 runInNewContext(script+'\nvar controls=setupSpringControls();',context);assert.equal(elements['spring-forces'].hidden,false);
 elements['spring-repel'].value='12';elements['spring-repel'].oninput();elements['spring-repel'].onchange();assert.equal(elements['spring-repel-value'].textContent,'12');assert.equal(JSON.parse(saved['lexica-spring-forces']).repel,12);
 runInNewContext('controls=setupSpringControls();',context);assert.equal(context.controls.read().repel,12);
 elements['layout-mode'].value='tree';events.change();assert.equal(elements['spring-forces'].hidden,true);elements['spring-reset'].onclick();assert.deepEqual(context.controls.read(),SPRING_DEFAULTS);
 context.localStorage={getItem(){throw Error('unavailable')},setItem(){throw Error('unavailable')}};assert.doesNotThrow(()=>runInNewContext('setupSpringControls();',context));
});

test('lexer stepping starts at the requested cursor with absolute offsets and intact Unicode characters',()=>{
 const m=example(),input='hello 42 world',steps=[...lexerSteps(m,input,true,6)];assert.equal(steps[0].offset,6);assert.equal(steps.find(s=>s.kind==='character').character,'4');
 const tokens=steps.filter(s=>s.result).map(s=>s.result);assert.equal(tokens[0].token,'NUMBER');assert.equal(tokens[0].offset,6);assert.equal(tokens[0].value,'42');assert.equal(tokens.at(-1).offset,9);assert.ok(steps.every(s=>s.offset>=6));
 const inside=[...lexerSteps(m,input,true,2)];assert.equal(inside.find(s=>s.result).result.value,'llo');assert.equal(inside.find(s=>s.result).result.offset,2);
 assert.deepEqual([...lexerSteps(m,input,true,input.length)].map(s=>[s.kind,s.offset]),[['done',input.length]]);
 const unicode=[...lexerSteps(m,'x😀!',true,2)];assert.equal(unicode[0].offset,1);assert.equal(unicode.find(s=>s.result).result.value,'😀');assert.equal(unicode.at(-1).offset,4);
 assert.deepEqual(tokenize(m,input).map(s=>s.value),['hello',' ','42',' ','world']);
});

test('range highlights preserve one text flow for tabs, wide glyphs, combining marks and joined emoji',()=>{
 const script=readFileSync(new URL('./dist/input-highlights.js',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('export function','function'),input={value:'hi\t漢字 👩‍💻 e\u0301\n42'},mirror={};
 Object.defineProperty(mirror,'textContent',{get(){return this.firstChild?.data},set(value){this.firstChild={data:value}}});
 const registry=new Map(),context={errorSpans,underlineSegments,input,mirror,CSS:{highlights:registry},Highlight:class extends Set{constructor(...ranges){super(ranges)}},document:{createRange:()=>({setStart(node,offset){this.node=node;this.start=offset},setEnd(node,offset){this.end=offset},getClientRects(){return [{start:this.start,end:this.end}]}})}};
 runInNewContext(script+"var highlights=setupInputHighlights(input,mirror,()=> 'token-color-1');",context);
 context.tokens=[{token:'IDENT',value:'hi',offset:0},{token:'WS',value:'\t',offset:2,skip:true},{token:'ERROR',value:input.value.slice(3,-2),offset:3},{token:'NUMBER',value:'42',offset:input.value.length-2}];
 runInNewContext('highlights.render(tokens);',context);assert.equal(mirror.firstChild.data,input.value+'\u200b');assert.equal('innerHTML' in mirror,false);
 const numbers=[...registry.get('lexica-token-color-1')];assert.equal(numbers[1].start,input.value.length-2);assert.equal(numbers[1].end,input.value.length);
 context.frame={kind:'character',offset:3,end:4,tokenStart:3,tokenEnd:4};runInNewContext('highlights.step(frame);',context);assert.equal([...registry.get('lexica-step')][0].start,3);assert.equal(registry.get('lexica-step').priority,3);
 runInNewContext('highlights.clearStep();',context);assert.equal(registry.has('lexica-step'),false);assert.equal(mirror.firstChild.data,input.value+'\u200b');
});

import {nextErrorToken,setupErrorNavigation} from './dist/error-navigation.js';
test('next error follows the input cursor, advances past selections and wraps with Unicode offsets',()=>{
 const errors=[{token:'ERROR',value:'😀',offset:2},{token:'ERROR',value:'!',offset:8}];
 assert.equal(nextErrorToken(errors,0),errors[0]);assert.equal(nextErrorToken(errors,2),errors[0]);assert.equal(nextErrorToken(errors,4),errors[1]);assert.equal(nextErrorToken(errors,9),errors[0]);assert.equal(nextErrorToken([],0),null);
});
test('lexer error count updates on edits and disables navigation for clean input or invalid machines',()=>{
 const input={selectionEnd:0},count={textContent:'',classList:{toggle(){}}},button={};let selected;
 const nav=setupErrorNavigation(input,count,button,t=>selected=t);assert.equal(count.textContent,'0 errors');assert.equal(button.disabled,true);
 nav.update([{token:'IDENT',value:'x',offset:0},{token:'ERROR',value:'!',offset:1},{token:'ERROR',value:'😀',offset:3}]);assert.equal(count.textContent,'2 errors');assert.equal(button.disabled,false);button.onclick();assert.equal(selected.offset,1);
 input.selectionEnd=2;button.onclick();assert.equal(selected.offset,3);input.selectionEnd=5;button.onclick();assert.equal(selected.offset,1);
 nav.update([{token:'ERROR',value:'!',offset:1}]);assert.equal(count.textContent,'1 error');nav.update([]);assert.equal(count.textContent,'0 errors');assert.equal(button.disabled,true);
 nav.update([],true);assert.equal(count.textContent,'1 error');assert.equal(button.disabled,true);
});

import {machineWithTester,restoreTester} from './dist/tester-state.js';
test('saved machines restore tester text and skipped-token preference, including blank input',()=>{
 const m=example(),input={value:'hi\t42\n😀'},skip={checked:true},saved=machineWithTester(m,input,skip),parsed=parseMachine(JSON.stringify(saved));
 assert.deepEqual(parsed.tester,{input:input.value,showSkipped:true});assert.equal(m.tester,undefined);assert.deepEqual(tokenize(parsed,input.value),tokenize(m,input.value));
 const restored={value:'default'},restoredSkip={checked:false};restoreTester(parsed,restored,restoredSkip);assert.equal(restored.value,input.value);assert.equal(restoredSkip.checked,true);
 restoreTester({...m,tester:{input:''}},restored,restoredSkip);assert.equal(restored.value,'');assert.equal(restoredSkip.checked,false);
 restored.value='keep current text';restoreTester(m,restored,restoredSkip);assert.equal(restored.value,'keep current text');
 for(const tester of [null,[],{input:42},{input:'x',showSkipped:'yes'}])assert.throws(()=>validate({...m,tester}),/tester/);
});

import {createDebugSession} from './dist/debug-session.js';
import {simpleCharacterClass,readEditorSettings} from './dist/editor-settings.js';
import {singleCharacterError,characterBounds} from './dist/regex-analysis.js';
import {errorSpans,underlineSegments} from './dist/error-underlines.js';

test('debugger seeks the token under the cursor and jumps by token or character',()=>{
 const session=createDebugSession(example(),'hello 42 world');assert.equal(session.seek(3).offset,0);assert.equal(session.next().character,'h');assert.equal(session.previous().kind,'start');assert.equal(session.nextToken().tokenStart,5);assert.equal(session.nextToken().tokenStart,6);assert.equal(session.next().character,'4');assert.equal(session.previousToken().tokenStart,5);assert.equal(session.seek(7).tokenStart,6);assert.equal(session.seek(14).tokenStart,9);assert.equal(session.nextToken().kind,'done');assert.equal(session.canNext(),false);assert.equal(session.previousToken().tokenStart,9);
});

test('debugger token seeking replays committed memory effects and includes skipped tokens',()=>{
 const m={start:'a',machineType:'extended',cells:[{name:'n',initial:0}],states:[{id:'a',name:'start',token:'',x:0,y:0},{id:'b',name:'letter',token:'LETTER',x:100,y:0},{id:'w',name:'space',token:'WS',skip:true,x:200,y:0}],edges:[{from:'a',to:'b',label:'[a-z]',effect:{cell:'n',op:'add',value:1}},{from:'a',to:'w',label:' '}]};
 const session=createDebugSession(m,'a b');assert.equal(session.seek(2).memory.n,1);assert.equal(session.current().tokenStart,2);assert.equal(session.next().memory.n,2);assert.equal(session.previousToken().tokenStart,1);assert.equal(session.current().memory.n,1);assert.equal(session.seek(0).memory.n,0);session.nextToken();session.nextToken();assert.equal(session.nextToken().memory.n,2);
});

test('simplified editing preserves regex meaning and refuses concatenations',()=>{
 assert.equal(simpleCharacterClass('abc'),null);assert.equal(simpleCharacterClass('a|bc'),null);assert.equal(simpleCharacterClass('[a][b]'),null);assert.equal(simpleCharacterClass('.'),null);
 for(const source of ['[abc]','[^a-z]','a','\\n','\\d','\\+','😀']){const simple=simpleCharacterClass(source);assert.ok(simple,source);const original=new RegExp('^(?:'+source+')$','u'),converted=new RegExp('^['+simple.characters+']$','u');for(const char of ['a','b','c','z','0','\n','+','😀'])assert.equal(original.test(char),simple.inverted?!converted.test(char):converted.test(char),source+' on '+JSON.stringify(char))}
});

test('Unicode regex escape pairs are one character for static transition diagnostics',()=>{
 assert.equal(singleCharacterError('\\uD83D\\uDE00'),'');assert.equal(characterBounds('😀').min,1);assert.equal(characterBounds('\\u{1F600}').min,1);assert.equal(singleCharacterError('\\uD83D\\uDE00a').length>0,true);
});

test('emitted debugger frames keep the token being emitted as their full-token highlight',()=>{
 const session=createDebugSession(example(),'hello 42');session.seek(0);while(session.current().kind!=='emit')session.next();assert.equal(session.current().tokenStart,0);assert.equal(session.current().tokenEnd,5);assert.equal(session.current().state,'s1');
});

test('hover survives movement within a token, follows the pointer, and resets only when leaving it',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf('let activeInputHover='),app.indexOf('function focusToken(')),handlers={},timers=new Map(),highlights=[];let sequence=0;
 const tokens=[{token:'IDENT',offset:0,value:'hi'},{token:'NUMBER',offset:3,value:'42'}],badge={style:{},hidden:true,getBoundingClientRect:()=>({width:80,height:24})};
 const context={inputAnalysisPending:false,$:id=>id==='input'?{addEventListener:(name,fn)=>handlers[name]=fn}:badge,allInputTokens:tokens,inputHighlights:{hover:token=>highlights.push(token),tokenAtPoint(x,y){return tokens.find(token=>!token.skip&&this.rects(token.offset).some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom))},rects:start=>start===0?[{left:100,right:300,top:100,bottom:140},{left:100,right:250,top:150,bottom:190}]:[{left:400,right:500,top:100,bottom:140}]},tokenColorClass:()=> 'token-color-1',window:{innerWidth:1000,innerHeight:800},clearTimeout:id=>timers.delete(id),setTimeout:(fn,delay)=>{assert.equal(delay,50);timers.set(++sequence,fn);return sequence}};
 const settle=()=>{const [id,fn]=[...timers.entries()][0];timers.delete(id);fn()};
 runInNewContext(script,context);handlers.pointermove({clientX:180,clientY:120});assert.equal(badge.hidden,true);handlers.pointermove({clientX:200,clientY:120});assert.equal(timers.size,1);settle();assert.equal(badge.hidden,false);assert.equal(badge.textContent,'IDENT');assert.equal(badge.style.left,'160px');assert.equal(badge.style.top,'84px');const count=highlights.length;
 handlers.pointermove({clientX:210,clientY:120});assert.equal(badge.hidden,false);assert.equal(badge.style.left,'170px');assert.equal(timers.size,0);assert.equal(highlights.length,count);handlers.pointermove({clientX:180,clientY:170});assert.equal(badge.hidden,false);assert.equal(highlights.length,count);
 handlers.pointermove({clientX:420,clientY:120});assert.equal(badge.hidden,true);assert.equal(highlights.at(-1),null);settle();assert.equal(badge.textContent,'NUMBER');assert.equal(highlights.at(-1),tokens[1]);handlers.pointermove({clientX:600,clientY:120});assert.equal(badge.hidden,true);handlers.pointerleave();assert.equal(timers.size,0);
});

test('hover highlights the full token without replacing the current debugger character',()=>{
 const script=readFileSync(new URL('./dist/input-highlights.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'').replace('export function','function'),input={value:'hello 42'},mirror={};Object.defineProperty(mirror,'textContent',{get(){return this.firstChild?.data},set(value){this.firstChild={data:value}}});
 const registry=new Map(),context={errorSpans,underlineSegments,input,mirror,CSS:{highlights:registry},Highlight:class extends Set{constructor(...ranges){super(ranges)}},document:{createRange:()=>({setStart(node,offset){this.start=offset},setEnd(node,offset){this.end=offset},getClientRects(){return []}})}};
 runInNewContext(script+"var highlights=setupInputHighlights(input,mirror,()=> 'token-color-1');",context);context.token={token:'IDENT',offset:0,value:'hello'};runInNewContext('highlights.render([token]);highlights.hover(token);highlights.step({kind:"character",offset:1,end:2,tokenStart:0,tokenEnd:5});',context);const hover=registry.get('lexica-hover-token-color-1');assert.equal([...hover][0].start,0);assert.equal([...hover][0].end,5);assert.ok(registry.get('lexica-step').priority>hover.priority);runInNewContext('highlights.hover(null);',context);assert.equal(registry.has('lexica-hover-token-color-1'),false);assert.equal(registry.has('lexica-step'),true);
});

test('adjacent error characters form continuous underlines without joining skipped whitespace',()=>{
 const tokens=[{token:'ERROR',offset:0,value:'"'},{token:'WS',offset:1,value:' ',skip:true},{token:'ERROR',offset:2,value:'$'},{token:'ERROR',offset:3,value:'{'},{token:'ERROR',offset:4,value:'😀'}];assert.deepEqual(errorSpans(tokens),[{start:0,end:1},{start:2,end:6}]);const segments=underlineSegments([{left:12,right:28,top:10,bottom:24},{left:12,right:12,top:24,bottom:38},{left:0,right:6,top:-30,bottom:-15}],{left:1,top:1,bottom:100});assert.deepEqual(segments,[{left:11,top:22,width:16,phase:-5}]);
});

test('error underline overlay uses merged spans and clears when errors are removed',()=>{
 const source=readFileSync(new URL('./dist/input-highlights.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'').replace('export function','function'),input={value:'" ${'},mirror={},layer={getBoundingClientRect:()=>({left:0,top:0,bottom:100})};Object.defineProperty(mirror,'textContent',{set(value){this.firstChild={data:value}}});const context={errorSpans,underlineSegments,input,mirror,layer,CSS:{highlights:new Map()},Highlight:class extends Set{constructor(...values){super(values)}},document:{createRange:()=>({setStart(node,offset){this.start=offset},setEnd(node,offset){this.end=offset},getClientRects(){return [{left:this.start*8,right:this.end*8,top:10,bottom:24}]}})}};context.tokens=[{token:'ERROR',offset:0,value:'"'},{token:'WS',offset:1,value:' ',skip:true},{token:'ERROR',offset:2,value:'$'},{token:'ERROR',offset:3,value:'{'}];runInNewContext(source+"var highlights=setupInputHighlights(input,mirror,()=> 'token-color-1',layer);highlights.render(tokens);",context);assert.equal((layer.innerHTML.match(/input-error-squiggle/g)??[]).length,2);assert.match(layer.innerHTML,/width:16px/);context.highlights.render([]);assert.equal(layer.innerHTML,'');
});

test('guarded memory transitions validate, report ambiguity, and roll back speculative effects',()=>{
 const m={machineType:'extended',cells:[{name:'n',initial:0}],start:'a',states:[{id:'a',name:'a',token:'',x:0,y:0},{id:'b',name:'b',token:'B',x:100,y:0},{id:'c',name:'c',token:'',x:200,y:0}],edges:[{from:'a',to:'b',label:'a',effect:{cell:'n',op:'add',value:1}},{from:'b',to:'c',label:'b',effect:{cell:'n',op:'add',value:10}},{from:'a',to:'b',label:'a',guard:{cell:'n',op:'>',value:10}}]};
 const frames=[...lexerSteps(m,'aba')],emits=frames.filter(f=>f.kind==='emit');assert.deepEqual(emits.map(f=>f.memory.n),[1,1,2]);assert.equal(frames[0].memory.n,0);assert.deepEqual(tokenize(validate(JSON.parse(JSON.stringify(m))),'aba').map(t=>t.token),['B','ERROR','B']);
 m.edges[2].guard.value=-1;assert.throws(()=>tokenize(m,'a'),/Ambiguous/);m.edges[2].guard.cell='missing';assert.throws(()=>validate(m),/guard/);
});

test('debugger surfaces invalid configurations instead of throwing before the session starts',()=>{
 const m=example();m.edges[0].label='';const session=createDebugSession(m,'hello');session.seek(0);assert.equal(session.current().kind,'error');assert.match(session.current().message,/empty/);assert.equal(session.canNext(),false);
});

test('simplified settings restore safely without changing graph preferences',()=>{
 assert.deepEqual(readEditorSettings({getItem:()=>'{"simplified":true,"pinchSensitivity":2}'}),{simplified:true,pinchSensitivity:2});
 assert.deepEqual(readEditorSettings({getItem:()=>'{broken'}),{simplified:false,pinchSensitivity:1});
 assert.deepEqual(readEditorSettings({getItem(){throw Error('Storage unavailable')}}),{simplified:false,pinchSensitivity:1});
});



import {canvasTransform,clientToWorld,graphBounds,createGraphCanvas,graphPalette} from './dist/canvas-graph.js';
import {createHash} from 'node:crypto';

test('Canvas coordinate conversion preserves pointer anchors at every zoom and aspect ratio',()=>{
 for(const [width,height] of [[800,600],[400,900],[1600,500]])for(const zoom of [.1,1,8]){
  const view={x:-200,y:350,width:1200*zoom,height:700*zoom},t=canvasTransform(view,width,height),rect={left:320,top:60},world={x:141,y:287};
  const result=clientToWorld({x:rect.left+t.x+world.x*t.scale,y:rect.top+t.y+world.y*t.scale},rect,t);assert.ok(Math.abs(result.x-world.x)<1e-8);assert.ok(Math.abs(result.y-world.y)<1e-8);
 }
});

function routingFixture(){
 const m=example();for(let i=0;i<72;i++)m.states.push({id:'q'+i,name:'State '+i,token:i%4?'':'TOKEN',x:Math.cos(i*.7)*(300+i*8),y:Math.sin(i*.7)*(300+i*8)});
 for(let i=0;i<72;i++){m.edges.push({from:i?'q'+(i-1):'s0',to:'q'+i,label:i%3?'[a-z]':'[0-9]'});if(i%5===0)m.edges.push({from:'q'+i,to:'q'+i,label:'x'})}
 m.states[10].portal='Target';m.edges.push({from:'q3',to:'q6',label:'p',portal:'Target'});m.comments=[{id:'note',text:'Routing obstacle',x:240,y:-140}];return m;
}
test('routing broad phase retains the exact original curves and label collision decisions',()=>{
 const m=routingFixture(),routes=[];for(let i=0;i<8;i++){m.states[i].x+=25;m.states[i].y-=17;routes.push(routeEdges(m))}
 assert.equal(createHash('sha256').update(JSON.stringify(routes)).digest('hex'),'bbf89f564c84bb9f0f63ccae2098418f71aaca68c51604734f73c9ecba190b7f');
});

test('Canvas paints current routes and hit-tests states, labels, portals and comments without SVG nodes',()=>{
 const previousDocument=globalThis.document,previousPath=globalThis.Path2D;globalThis.document={documentElement:{dataset:{theme:'light'}}};globalThis.Path2D=class{constructor(d){this.d=d}};
 try{
  const calls=[],context=()=>new Proxy({isPointInStroke:()=>false},{get(target,key){return key in target?target[key]:(...args)=>calls.push({method:key,args,stroke:target.strokeStyle,width:target.lineWidth})},set(target,key,value){target[key]=value;return true}});
  const canvas={clientWidth:800,clientHeight:600,getContext:()=>main,getBoundingClientRect:()=>({left:0,top:0})},map={clientWidth:170,clientHeight:106,getContext:()=>mini},main=context(),mini=context(),renderer=createGraphCanvas(canvas,map),m=example();
  m.states[1].portal='IDENT';m.comments=[{id:'note',text:'Canvas note',x:1000,y:1000}];m.edges.push({from:'s0',to:'s1',label:'p',portal:'IDENT'});
  const scene={machine:m,routes:routeEdges(m),selectedStates:new Set(),selectedComments:new Set(),selectedCommentLinks:new Set(),edgeSelected:()=>false,failures:{states:[],edges:[]},trace:{kind:'character',state:'s1',traceStates:['s0','s1'],traceEdges:[0]}};
  renderer.draw(scene);renderer.drawMap();assert.equal(canvas.width,800);assert.equal(map.width,170);assert.ok(calls.some(c=>c.method==='stroke'&&c.stroke==='#a71abb'&&c.width===4));
  assert.deepEqual(renderer.hit(m.states[1]),{type:'state',id:'s1'});assert.deepEqual(renderer.hit({x:1005,y:1005}),{type:'comment',id:'note'});
  const r=scene.routes.at(-1);assert.deepEqual(renderer.hit(r.portalBox),{type:'edge',index:m.edges.length-1});assert.deepEqual(renderer.hit({x:scene.routes[0].label.x,y:scene.routes[0].label.y-5}),{type:'edge',index:0});
  scene.label=simpleTransitionLabel;const captionStart=calls.length;renderer.draw(scene);assert.ok(calls.slice(captionStart).some(c=>c.method==='fillText'&&c.args[0]===simpleTransitionLabel(m.edges[0])));
  const before=scene.routes[0].d;m.states[1].x+=200;scene.routes=routeEdges(m);renderer.draw(scene);assert.notEqual(scene.routes[0].d,before);assert.ok(calls.some(c=>c.method==='stroke'&&c.args[0]?.d===scene.routes[0].d));const bounds=graphBounds(m,scene.routes);assert.ok(bounds.x+bounds.width>=1000);assert.ok(bounds.y+bounds.height>=1000);
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousPath===undefined)delete globalThis.Path2D;else globalThis.Path2D=previousPath}
});


test('Canvas editor undo and redo preserve positions and connections',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),script=app.slice(app.indexOf("$('undo').onclick="),app.indexOf('function fit(')),buttons={undo:{},redo:{}},before=example(),after=structuredClone(before);after.states[0].x+=150;
 let renders=0;const context={$:id=>buttons[id],history:[JSON.stringify(before)],future:[],machine:after,source:'s0',commentSource:'note',clearSelection(){},changed:()=>renders++};runInNewContext(script,context);buttons.undo.onclick();assert.deepEqual(JSON.parse(JSON.stringify(context.machine)),before);assert.equal(context.source,null);assert.equal(context.commentSource,null);buttons.redo.onclick();assert.deepEqual(JSON.parse(JSON.stringify(context.machine)),after);assert.equal(renders,2);
});


test('Canvas retains the light-blue dark theme highlights and reads shared theme variables',()=>{
 const dark=graphPalette(true),light=graphPalette(false);assert.equal(dark.green,'#a9d5ff');assert.equal(dark.selected,'#c7e5ff');assert.equal(dark.selectedFill,'#3d566b');assert.equal(dark.trace,'#c5e4ff');assert.equal(dark.step,'#efb0ff');assert.equal(dark.mapFill,'#a3c9e025');assert.equal(light.green,'#386b4e');assert.equal(light.trace,'#14864d');
 const custom=graphPalette(true,{getPropertyValue:name=>name==='--green'?' #123456 ':name==='--step-color'?' #abcdef ':''});assert.equal(custom.green,'#123456');assert.equal(custom.step,'#abcdef');
});


import {wheelZoomFactor,pinchView,setupCanvasGestures} from './dist/canvas-gestures.js';
import {placementPreview} from './dist/placement.js';
import {simpleTransitionLabel} from './dist/editor-settings.js';

test('simplified captions remove regex brackets without changing stored rules or advanced expressions',()=>{
 const edge={label:'[^a-z]',invert:true},before=JSON.stringify(edge);assert.equal(simpleTransitionLabel(edge),'a-z');assert.equal(simpleTransitionLabel({label:'[a-z]',invert:true}),'not a-z');assert.equal(simpleTransitionLabel({label:'abc'}),'abc');assert.equal(simpleTransitionLabel({label:''}),'…');assert.equal(JSON.stringify(edge),before);
 assert.equal(simpleTransitionLabel({label:'[0-9]',guard:{cell:'n',op:'odd',value:0},effect:{cell:'n',op:'add',value:1}}),'0-9 · n odd 0 · n += 1');
});

test('pinch zoom preserves its world anchor while scaling and moving across letterboxed views',()=>{
 for(const size of [{width:800,height:600},{width:500,height:900}])for(const factor of [.05,.8,2,100]){
  const initial={x:-300,y:200,width:1600,height:800},anchor={x:400,y:350},center={x:170,y:220},next=pinchView(initial,anchor,center,size,factor),t=canvasTransform(next,size.width,size.height),point=clientToWorld(center,{left:0,top:0},t);
  assert.ok(Math.abs(point.x-anchor.x)<1e-8);assert.ok(Math.abs(point.y-anchor.y)<1e-8);assert.ok(next.width>=160&&next.width<=30000);assert.equal(next.width/next.height,2);
 }
 assert.equal(wheelZoomFactor(0),1);assert.ok(wheelZoomFactor(-5)<1);assert.ok(wheelZoomFactor(5)>1);assert.ok(wheelZoomFactor(5,2)>wheelZoomFactor(5,1));
});

test('two-finger gestures interrupt dragging, zoom around the midpoint, and consume remaining touches',()=>{
 const handlers={},canvas={clientWidth:800,clientHeight:600,addEventListener:(name,fn)=>handlers[name]=fn,setPointerCapture(){},getBoundingClientRect:()=>({left:20,top:40})};let v={x:0,y:0,width:800,height:600},interrupts=0,stops=0;
 setupCanvasGestures(canvas,{getView:()=>v,setView:next=>v=next,toWorld:event=>clientToWorld({x:event.clientX,y:event.clientY},canvas.getBoundingClientRect(),canvasTransform(v,800,600)),onInterrupt:()=>interrupts++});
 const event=(id,x,y)=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation:()=>stops++});
 handlers.pointerdown(event(1,120,140));assert.equal(interrupts,0);handlers.pointerdown(event(2,220,140));assert.equal(interrupts,1);handlers.pointermove(event(2,320,140));assert.equal(v.width,400);const point=clientToWorld({x:220,y:140},canvas.getBoundingClientRect(),canvasTransform(v,800,600));assert.equal(point.x,150);assert.equal(point.y,100);
 handlers.pointerup(event(2,320,140));const before=stops;handlers.pointermove(event(1,100,140));assert.equal(stops,before+1);handlers.pointercancel(event(1,100,140));handlers.pointerdown(event(3,100,100));assert.equal(interrupts,1);
});

test('placement ghosts follow the cursor without changing the machine and predict comment attachment',()=>{
 const m=example(),before=JSON.stringify(m),state=placementPreview(m,'state',{x:50,y:90}),note=placementPreview(m,'comment',{x:410,y:150});assert.equal(state.item.name,'q4');assert.equal(state.item.x,50);assert.equal(note.item.x,410);assert.deepEqual(note.item.nodeIds,['s1']);assert.equal(JSON.stringify(m),before);assert.equal(placementPreview(m,'state',null),null);
});

test('add buttons arm a placement and the canvas click commits the exact cursor position once',()=>{
 const app=readFileSync(new URL('./dist/app.js',import.meta.url),'utf8'),begin=app.slice(app.indexOf('function beginPlacement('),app.indexOf('function addComment(')),click=app.slice(app.indexOf("$('canvas').addEventListener('pointerdown',e=>{const hit="),app.indexOf('async function copyItems'));
 for(const type of ['state','comment']){let handler,commits=[];const elements={canvas:{focus(){},addEventListener:(_,fn)=>handler=fn},modehint:{}},context={placingState:false,placingComment:false,placementPoint:null,source:null,commentSource:null,graph:{hitClient:()=>null},point:e=>({x:e.clientX,y:e.clientY}),$:id=>elements[id],cancelConnect(){context.placingState=false;context.placingComment=false},showProperties(){},document:{body:{classList:{add(){}}}},add:(x,y)=>commits.push({type:'state',x,y}),addComment:p=>commits.push({type:'comment',...p})};
  runInNewContext(begin+click,context);context.beginPlacement(type);assert.equal(commits.length,0);assert.equal(context.placingState,type==='state');assert.equal(context.placingComment,type==='comment');handler({button:0,clientX:180,clientY:230,preventDefault(){},stopImmediatePropagation(){}});assert.deepEqual(commits,[{type,x:180,y:230}]);
 }
});
