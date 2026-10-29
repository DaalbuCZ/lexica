import {createVirtualTokenOutput} from './virtual-token-output.js';
export function createTokenOutput(element,markup,{schedule=requestAnimationFrame,cancelFrame=cancelAnimationFrame,onComplete=()=>{}}={}){
 const virtual=element.addEventListener?createVirtualTokenOutput(element,markup,{schedule,cancelFrame,onComplete}):null;
 let frame=null,version=0,rendered=[],nodes=[];
 function cancel(){virtual?.cancel();version++;if(frame!==null)cancelFrame(frame);frame=null;element.setAttribute('aria-busy','false')}
 function render(tokens){
  cancel();if(tokens.length>500&&virtual){rendered=[];nodes=[];virtual.render(tokens);return}virtual?.reset();const id=version;let index=0;element.setAttribute('aria-busy','true');
  const template=element.ownerDocument.createElement('template');
  function append(){
   if(id!==version)return;frame=null;let changes=0;
   for(;index<tokens.length&&changes<250;index++){
    const html=markup(tokens[index],index);if(id!==version)return;
    if(rendered[index]===html&&nodes[index]?.parentNode===element)continue;
    template.innerHTML=html;changes++;
    const node=template.content.firstElementChild,old=nodes[index];
    if(old?.parentNode===element)old.replaceWith(node);else element.append(node);
    if(id!==version)return;rendered[index]=html;nodes[index]=node;
   }
   if(index<tokens.length)frame=schedule(append);
   else{while(element.children.length>tokens.length)element.lastElementChild.remove();rendered.length=tokens.length;nodes.length=tokens.length;element.setAttribute('aria-busy','false');onComplete()}
  }
  if(!tokens.length){element.innerHTML='<span class="empty">Type some input to see tokens.</span>';rendered=[];nodes=[];element.setAttribute('aria-busy','false');onComplete()}
  else{if(!rendered.length||element.firstElementChild!==nodes[0]){element.replaceChildren();rendered=[];nodes=[]}append()}
 }

 return {render,cancel,reveal:index=>virtual?.reveal(index)};
}

export function tokensAtSelection(tokens,start,end,inputLength){
 let low=0,high=tokens.length;while(low<high){const middle=(low+high)>>>1,token=tokens[middle];if(token.offset+token.value.length<=start)low=middle+1;else high=middle}
 if(start===end&&start===inputLength&&low===tokens.length&&low>0&&tokens[low-1].offset+tokens[low-1].value.length===start)low--;
 const matches=[];for(let i=low;i<tokens.length;i++){const t=tokens[i];if(start===end){if(start>=t.offset&&start<t.offset+t.value.length||start===inputLength&&start===t.offset+t.value.length)matches.push({t,i});break}if(t.offset>=end)break;if(t.offset+t.value.length>start)matches.push({t,i})}return matches;
}
