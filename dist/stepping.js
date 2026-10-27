import {lexerSteps} from './lexer.js?v=53';

export function setupStepping({getMachine,traceToken,markFailures,highlights,onReset}){
 const $=id=>document.getElementById(id),input=$('input'),panel=document.querySelector('.tester');
 let iterator=null,frames=[],index=-1,ended=false,startOffset=0;
 function syncToggle(active){const button=$('step-toggle');button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'Stop debugging':'Start debugging');button.title=active?'Stop debugging':'Start debugging';button.innerHTML=active?'<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>':'<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8-13-8z"/></svg>'}
 function reset(){if(!iterator)return;iterator=null;frames=[];index=-1;ended=false;panel.classList.remove('stepping');$('step-controls').hidden=true;$('step-memory').hidden=true;syncToggle(false);highlights.clearStep();traceToken(null);onReset?.()}
 function show(){
  const frame=frames[index];if(!frame)return;
  panel.classList.add('stepping');$('step-controls').hidden=false;syncToggle(true);
  $('step-prev').disabled=index<=0;$('step-next').disabled=frame.kind==='done'||frame.kind==='error';
  $('step-status').textContent=`Step ${index+1} · ${frame.message} · offset ${frame.offset}`;$('step-status').title=$('step-status').textContent;
  const values=Object.entries(frame.memory??{});$('step-memory').hidden=!values.length;$('step-memory').innerHTML=values.map(([name,value])=>`<span class="step-memory-cell"><b>${name}</b><output>${value}</output></span>`).join('');
  traceToken(frame);markFailures((frame.failureState??frame.result?.failureState)?[frame.failureState??frame.result.failureState]:[],frame.edgeIndices??[]);highlights.clearStep();
  const box=highlights.step(frame);if(box){const area=input.getBoundingClientRect();if(box.top<area.top+12||box.bottom>area.bottom-12)input.scrollTop+=box.top-area.top-12;if(box.left<area.left+12||box.right>area.right-12)input.scrollLeft+=box.left-area.left-12;input.dispatchEvent(new Event('scroll'))}
 }
 function next(){
  if(index+1<frames.length){index++;show();return}if(ended)return;
  try{const result=iterator.next();if(result.done){ended=true;return}frames.push(result.value)}
  catch(error){frames.push({kind:'error',offset:frames.at(-1)?.offset??startOffset,end:frames.at(-1)?.offset??startOffset,message:error.message,traceStates:error.stateId?[error.stateId]:[],traceEdges:error.edgeIndices??[],failureState:error.stateId,edgeIndices:error.edgeIndices,token:'ERROR'});ended=true}
  index=frames.length-1;show();
 }
 function toggle(){if(iterator){reset();return}startOffset=0;iterator=lexerSteps(getMachine(),input.value,true,startOffset);next()}
 function previous(){if(index>0){index--;show()}}
 $('step-toggle').onclick=toggle;$('step-next').onclick=next;$('step-prev').onclick=previous;
 input.addEventListener('input',reset);input.addEventListener('pointerdown',reset);
 return {reset,toggle,next,previous,active:()=>iterator!==null};
}
