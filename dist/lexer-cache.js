import {tokenize,lexerSteps} from './lexer.js';
// Geometry and editor preferences do not change tokenization.
export function lexerConfigurationKey(machine){
 return JSON.stringify([
  machine.machineType??null,machine.start,machine.cells??[],
  machine.states.map(state=>[state.id,state.name,state.token,state.accepting??null,!!state.skip,state.portal??null]),
  machine.edges.map(edge=>[edge.from,edge.to??null,edge.portal??null,edge.label,!!edge.invert,edge.guard??null,edge.effect??null])
 ]);
}

export function createTokenizationCache(tokenizer){
 let lastKey,lastInput,lastTokens,lastError;
 return {get(machine,input){
  const key=lexerConfigurationKey(machine);
  if(key===lastKey&&input===lastInput){if(lastError)throw lastError;return lastTokens}
  const previous=key===lastKey&&!lastError?{input:lastInput,tokens:lastTokens}:null;
  lastKey=key;lastInput=input;lastError=null;
  try{
   if(previous&&tokenizer===tokenize){
    let edit=0;while(edit<previous.input.length&&edit<input.length&&previous.input[edit]===input[edit])edit++;
    let count=0;while(count<previous.tokens.length&&previous.tokens[count].inspectedEnd<edit)count++;
    const prefix=previous.tokens.slice(0,count),last=prefix.at(-1),offset=last?last.offset+last.value.length:0;
    lastTokens=prefix;
    for(const step of lexerSteps(machine,input,false,offset,last?.memoryAfter))if(step.result)lastTokens.push(step.result);
   }else lastTokens=tokenizer(machine,input);
   return lastTokens;
  }
  catch(error){lastError=error;throw error}
 }};
}
