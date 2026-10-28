import {createTokenizationCache,lexerConfigurationKey} from './lexer-cache.js';

export function createLexerAnalyzer(tokenizer,{workerFactory=null,threshold=4096}={}){
 const synchronous=createTokenizationCache(tokenizer);let worker=null,workerKey=null,pending=null,sequence=0,cached=null;
 function cancel(){
  if(!pending)return;const request=pending;pending=null;
  worker?.terminate();worker=null;workerKey=null;
  request.reject(Object.assign(new Error('Analysis cancelled'),{name:'AbortError'}));
 }
 function ensureWorker(){
  if(worker)return worker;
  const instance=workerFactory();worker=instance;
  instance.onmessage=event=>{
   if(worker!==instance||!pending||event.data.id!==pending.id)return;
   const request=pending;pending=null;
   if(event.data.error){const error=Object.assign(new Error(event.data.error.message),event.data.error);cached={key:request.key,input:request.input,error};request.reject(error)}
   else{cached={key:request.key,input:request.input,tokens:event.data.tokens};request.resolve(event.data.tokens)}
  };
  instance.onerror=event=>{if(worker!==instance)return;const request=pending;pending=null;instance.terminate();worker=null;workerKey=null;request?.reject(new Error(event.message||'Background lexer analysis failed.'))};
  return instance;
 }
 function get(machine,input){
  const key=lexerConfigurationKey(machine);
  if(cached?.key===key&&cached.input===input){cancel();if(cached.error)throw cached.error;return cached.tokens}
  if(pending?.key===key&&pending.input===input)return pending.promise;
  cancel();
  if(!workerFactory||input.length<threshold)return synchronous.get(machine,input);
  const instance=ensureWorker(),id=++sequence;
  const promise=new Promise((resolve,reject)=>{pending={id,key,input,resolve,reject}});pending.promise=promise;
  // Tester text and geometry-only annotations do not need to be copied.
  const data={id,input};if(workerKey!==key)data.machine={start:machine.start,machineType:machine.machineType,cells:machine.cells,states:machine.states,edges:machine.edges};
  try{instance.postMessage(data);workerKey=key}catch(error){const request=pending;pending=null;instance.terminate();worker=null;workerKey=null;request.reject(error)}
  return promise;
 }
 return {get,cancel};
}
