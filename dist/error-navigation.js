export function nextErrorToken(errors,offset){return errors.find(t=>t.offset>=offset)??errors[0]??null}
export function setupErrorNavigation(input,count,button,select){
 let errors=[];
 button.onclick=()=>{const token=nextErrorToken(errors,input.selectionEnd??0);if(token)select(token)};
 function update(tokens,issue=false){
  errors=tokens.filter(t=>t.token==='ERROR');const total=issue?1:errors.length,text=total+' '+(total===1?'error':'errors');
  if(count.textContent!==text)count.textContent=text;count.classList.toggle('has-errors',total>0);button.disabled=!errors.length;
 }
 update([]);return {update};
}
