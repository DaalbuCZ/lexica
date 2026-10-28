// Geometry and editor preferences do not change tokenization.
export function lexerConfigurationKey(machine){
 return JSON.stringify([
  machine.machineType??null,machine.start,machine.cells??[],
  machine.states.map(state=>[state.id,state.token,state.accepting??null,!!state.skip,state.portal??null]),
  machine.edges.map(edge=>[edge.from,edge.to??null,edge.portal??null,edge.label,!!edge.invert,edge.guard??null,edge.effect??null])
 ]);
}

export function createTokenizationCache(tokenizer){
 let lastKey,lastInput,lastTokens,lastError;
 return {get(machine,input){
  const key=lexerConfigurationKey(machine);
  if(key===lastKey&&input===lastInput){if(lastError)throw lastError;return lastTokens}
  lastKey=key;lastInput=input;lastError=null;
  try{lastTokens=tokenizer(machine,input);return lastTokens}
  catch(error){lastError=error;throw error}
 }};
}
