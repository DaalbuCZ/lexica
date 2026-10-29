import {tokenize} from './lexer.js';
import {createTokenizationCache} from './lexer-cache.js';

export function createWorkerHandler(tokenizer=tokenize){
 let machine=null;const cache=createTokenizationCache(tokenizer);
 return request=>{
  if(request.machine)machine=request.machine;
  try{
   const tokens=cache.get(machine,request.input);
   return {id:request.id,tokens};
  }catch(error){return {id:request.id,error:{message:error.message,stateId:error.stateId,edgeIndices:error.edgeIndices}}}
 };
}

if(typeof self!=='undefined'){
 const handle=createWorkerHandler();
 self.onmessage=event=>self.postMessage(handle(event.data));
}
