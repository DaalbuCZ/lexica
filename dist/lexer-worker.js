import {tokenize} from './lexer.js';

export function createWorkerHandler(tokenizer=tokenize){
 let machine=null;
 return request=>{
  if(request.machine)machine=request.machine;
  try{
   const tokens=tokenizer(machine,request.input).map(token=>({...token,traceStates:[...new Set(token.traceStates)],traceEdges:[...new Set(token.traceEdges)]}));
   return {id:request.id,tokens};
  }catch(error){return {id:request.id,error:{message:error.message,stateId:error.stateId,edgeIndices:error.edgeIndices}}}
 };
}

if(typeof self!=='undefined'){
 const handle=createWorkerHandler();
 self.onmessage=event=>self.postMessage(handle(event.data));
}
