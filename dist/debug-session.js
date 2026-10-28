import {lexerSteps,tokenize} from './lexer.js?v=55';

// Replay from the beginning so jumping to a token preserves prior memory effects.
export function createDebugSession(machine,input,tokens=tokenize(machine,input)){
 const iterator=lexerSteps(machine,input,true),frames=[],tokensByStart=new Map(tokens.map(token=>[token.offset,token]));let index=-1,ended=false;
 function read(){if(ended)return false;try{const result=iterator.next();if(result.done){ended=true;return false}frames.push(result.value);if(['done','error'].includes(result.value.kind))ended=true}catch(error){frames.push({kind:'error',offset:frames.at(-1)?.offset??0,end:frames.at(-1)?.offset??0,message:error.message,traceStates:error.stateId?[error.stateId]:[],traceEdges:error.edgeIndices??[],token:'ERROR',memory:frames.at(-1)?.memory??{}});ended=true}return true}
 function current(){const frame=frames[index];if(!frame)return null;const token=tokensByStart.get(frame.tokenStart);return {...frame,tokenEnd:token?token.offset+token.value.length:frame.end}}
 function seek(offset){const token=tokens.find(t=>offset>=t.offset&&offset<t.offset+t.value.length)??(offset===input.length?tokens.at(-1):null),target=token?.offset??0;let found=frames.findIndex(f=>f.kind==='start'&&f.tokenStart===target);while(found<0&&read()){if(frames.at(-1).kind==='start'&&frames.at(-1).tokenStart===target)found=frames.length-1}index=found>=0?found:frames.length-1;return current()}
 function next(){if(index+1<frames.length)index++;else if(read())index=frames.length-1;return current()}
 function previous(){index=Math.max(0,index-1);return current()}
 function nextToken(){const start=current()?.tokenStart??-1;while(canNext()){next();const frame=current();if(frame.kind==='start'&&frame.tokenStart>start)break}return current()}
 function previousToken(){const start=current()?.tokenStart??Infinity;for(let n=index-1;n>=0;n--)if(frames[n].kind==='start'&&frames[n].tokenStart<start){index=n;return current()}index=Math.max(0,frames.findIndex(f=>f.kind==='start'));return current()}
 function canNext(){return !!current()&&!['done','error'].includes(current().kind)}
 return {seek,next,previous,nextToken,previousToken,current,canNext,canPrevious:()=>index>0,position:()=>index+1};
}
