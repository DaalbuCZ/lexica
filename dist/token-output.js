export function createTokenOutput(element,markup,{schedule=requestAnimationFrame,cancelFrame=cancelAnimationFrame,onComplete=()=>{}}={}){
 let frame=null,version=0;
 function cancel(){version++;if(frame!==null)cancelFrame(frame);frame=null;element.setAttribute('aria-busy','false')}
 function render(tokens){
  cancel();const id=version;let index=0;element.innerHTML='';element.setAttribute('aria-busy','true');
  function append(){if(id!==version)return;frame=null;const end=Math.min(tokens.length,index+250),html=tokens.slice(index,end).map((token,i)=>markup(token,index+i)).join('');if(index===0)element.innerHTML=html;else element.insertAdjacentHTML('beforeend',html);index=end;if(index<tokens.length)frame=schedule(append);else{element.setAttribute('aria-busy','false');onComplete()}}
  if(!tokens.length){element.innerHTML='<span class="empty">Type some input to see tokens.</span>';element.setAttribute('aria-busy','false');onComplete()}else append();
 }
 return {render,cancel};
}

export function tokensAtSelection(tokens,start,end,inputLength){
 let low=0,high=tokens.length;while(low<high){const middle=(low+high)>>>1,token=tokens[middle];if(token.offset+token.value.length<=start)low=middle+1;else high=middle}
 if(start===end&&start===inputLength&&low===tokens.length&&low>0&&tokens[low-1].offset+tokens[low-1].value.length===start)low--;
 const matches=[];for(let i=low;i<tokens.length;i++){const t=tokens[i];if(start===end){if(start>=t.offset&&start<t.offset+t.value.length||start===inputLength&&start===t.offset+t.value.length)matches.push({t,i});break}if(t.offset>=end)break;if(t.offset+t.value.length>start)matches.push({t,i})}return matches;
}
