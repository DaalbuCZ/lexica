import {lexerSteps,tokenize} from './lexer.js';

// Replay from the beginning so jumping to a token preserves prior memory effects.
export function createDebugSession(machine,input,tokens){
 if(!tokens){try{tokens=tokenize(machine,input)}catch{tokens=[]}}
 const iterator=lexerSteps(machine,input,true),frames=[],tokensByStart=new Map(tokens.map(token=>[token.offset,token])),starts=new Map();let index=-1,ended=false;
 function read(){if(ended)return false;try{const result=iterator.next();if(result.done){ended=true;return false}frames.push(result.value);if(result.value.kind==='start')starts.set(result.value.tokenStart,frames.length-1);if(['done','error'].includes(result.value.kind))ended=true}catch(error){frames.push({kind:'error',offset:frames.at(-1)?.offset??0,end:frames.at(-1)?.offset??0,message:error.message,traceStates:error.stateId?[error.stateId]:[],traceEdges:error.edgeIndices??[],token:'ERROR',failureState:error.stateId,edgeIndices:error.edgeIndices,memory:frames.at(-1)?.memory??{}});ended=true}return true}
 function current(){const frame=frames[index];if(!frame)return null;const token=tokensByStart.get(frame.tokenStart);return {...frame,tokenEnd:token?token.offset+token.value.length:frame.end}}
 function seek(offset){const token=tokens.find(t=>offset>=t.offset&&offset<t.offset+t.value.length)??(offset===input.length?tokens.at(-1):null),target=token?.offset??0;let found=starts.get(target)??-1;while(found<0&&read()){if(frames.at(-1).kind==='start'&&frames.at(-1).tokenStart===target)found=frames.length-1}index=found>=0?found:frames.length-1;return current()}
 function next(){if(index+1<frames.length)index++;else if(read())index=frames.length-1;return current()}
 function previous(){index=Math.max(0,index-1);return current()}
 function nextToken(){const start=frames[index]?.tokenStart??-1;while(canNext()){if(index+1<frames.length)index++;else if(read())index=frames.length-1;else break;const frame=frames[index];if(frame.kind==='start'&&frame.tokenStart>start)break}return current()}
 function previousToken(){const start=current()?.tokenStart??Infinity;for(let n=index-1;n>=0;n--)if(frames[n].kind==='start'&&frames[n].tokenStart<start){index=n;return current()}index=Math.max(0,frames.findIndex(f=>f.kind==='start'));return current()}
 function canNext(){return !!frames[index]&&!['done','error'].includes(frames[index].kind)}
 return {seek,next,previous,nextToken,previousToken,current,canNext,canPrevious:()=>index>0,position:()=>index+1};
}
