import {createDebugSession} from './debug-session.js';

export function setupStepping({getMachine,getTokens,canStart,traceToken,markFailures,highlights,onReset}){
 const $=id=>document.getElementById(id),input=$('input'),panel=document.querySelector('.tester');let session=null;
 function syncToggle(active){const button=$('step-toggle');button.hidden=active;button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label','Start debugging');button.title='Start debugging · Alt+S'}
 function reset({notify=true}={}){if(!session)return;session=null;panel.classList.remove('stepping');$('step-controls').hidden=true;$('step-memory').hidden=true;syncToggle(false);highlights.clearStep();traceToken(null);if(notify)onReset?.()}
 function show(){const frame=session?.current();if(!frame)return;panel.classList.add('stepping');$('step-controls').hidden=false;syncToggle(true);for(const id of ['step-prev','step-prev-token'])$(id).disabled=!session.canPrevious();for(const id of ['step-next','step-next-token'])$(id).disabled=!session.canNext();$('step-status').textContent=`${frame.message} · ${frame.offset}`;$('step-status').title=`Step ${session.position()} · ${frame.message} · offset ${frame.offset}`;const values=Object.entries(frame.memory??{});$('step-memory').hidden=!values.length;$('step-memory').replaceChildren(...values.map(([name,value])=>{const chip=document.createElement('span');chip.className='step-memory-cell';const label=document.createElement('b'),output=document.createElement('output');label.textContent=name;output.textContent=Array.isArray(value)?'['+value.join(', ')+'] ← top':value;chip.append(label,output);return chip}));traceToken(frame);markFailures((frame.failureState??frame.result?.failureState)?[frame.failureState??frame.result.failureState]:[],frame.edgeIndices??[]);const box=highlights.step(frame);if(box){const area=input.getBoundingClientRect();if(box.top<area.top+12||box.bottom>area.bottom-12)input.scrollTop+=box.top-area.top-12;if(box.left<area.left+12||box.right>area.right-12)input.scrollLeft+=box.left-area.left-12;input.dispatchEvent(new Event('scroll'))}}
 function start(){if(canStart&&!canStart())return;session=createDebugSession(getMachine(),input.value,getTokens?.());session.seek(input.selectionStart??0);show()}
 function toggle(){if(session)reset();else start()}
 function move(method){if(!session){start();return}session[method]();show()}
 const next=()=>move('next'),previous=()=>move('previous'),nextToken=()=>move('nextToken'),previousToken=()=>move('previousToken');
 $('step-toggle').onclick=toggle;$('step-stop').onclick=()=>reset();$('step-next').onclick=next;$('step-prev').onclick=previous;$('step-next-token').onclick=nextToken;$('step-prev-token').onclick=previousToken;
 input.addEventListener('keyup',event=>{if(session&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)&&!event.altKey){session.seek(input.selectionStart??0);show()}});
 input.addEventListener('input',()=>reset());input.addEventListener('click',()=>{if(session){session.seek(input.selectionStart??0);show()}});
 return {reset,toggle,next,previous,nextToken,previousToken,active:()=>session!==null};
}
