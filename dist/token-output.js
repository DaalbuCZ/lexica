export function createTokenOutput(element,markup,{schedule=requestAnimationFrame,cancelFrame=cancelAnimationFrame,onComplete=()=>{}}={}){
 let frame=null,version=0,rendered=[],nodes=[],virtualTokens=null,virtualSurface=null,virtualFirst=-1,virtualColumns=0;
 function cancel(){version++;if(frame!==null)cancelFrame(frame);frame=null;element.setAttribute('aria-busy','false')}
 function viewport(force=false){
  if(!virtualTokens)return;
  const columns=Math.max(1,Math.floor((element.clientWidth-20)/180)),first=Math.max(0,Math.min(Math.floor(element.scrollTop/54)-2,Math.ceil(virtualTokens.length/columns)-Math.ceil(element.clientHeight/54)))*columns;
  const last=Math.min(virtualTokens.length,first+(Math.ceil(element.clientHeight/54)+5)*columns);
  if(!force&&first===virtualFirst&&columns===virtualColumns)return;
  virtualFirst=first;virtualColumns=columns;virtualSurface.style.height=Math.ceil(virtualTokens.length/columns)*54+'px';
  const width=(element.clientWidth-20)/columns;
  virtualSurface.innerHTML=virtualTokens.slice(first,last).map((token,i)=>markup(token,first+i)).join('');
  for(let i=first;i<last;i++){const node=virtualSurface.children[i-first];node.title=(node.title??'')+'\n'+virtualTokens[i].value;node.style.position='absolute';node.style.left=(i%columns)*width+'px';node.style.top=Math.floor(i/columns)*54+'px';node.style.width=Math.max(0,width-6)+'px';}
 }
 function reveal(index){if(!virtualTokens)return;const columns=Math.max(1,Math.floor((element.clientWidth-20)/180)),top=Math.floor(index/columns)*54;if(top<element.scrollTop||top+48>element.scrollTop+element.clientHeight)element.scrollTop=top;viewport()}
 if(element.addEventListener){element.addEventListener('scroll',()=>viewport());element.addEventListener('keydown',event=>{if(!virtualTokens)return;const card=event.target.closest('[data-token-index]');if(!card)return;const delta=event.key==='Tab'?(event.shiftKey?-1:1):{ArrowRight:1,ArrowLeft:-1,ArrowDown:virtualColumns,ArrowUp:-virtualColumns}[event.key];if(delta===undefined)return;const index=Number(card.dataset.tokenIndex)+delta;if(index<0||index>=virtualTokens.length)return;event.preventDefault();reveal(index);element.querySelector(`[data-token-index="${index}"]`)?.focus({preventScroll:true})});new ResizeObserver(()=>viewport(true)).observe(element)}
 function render(tokens){
  cancel();const id=version;let index=0;element.setAttribute('aria-busy','true');
  if(tokens.length>500&&element.addEventListener){
   virtualTokens=tokens;virtualFirst=-1;element.classList.add('virtual-tokens');
   if(!virtualSurface){virtualSurface=element.ownerDocument.createElement('div');virtualSurface.style.position='relative';element.replaceChildren(virtualSurface)}
   viewport(true);element.setAttribute('aria-busy','false');onComplete();return;
  }
  if(virtualTokens){virtualTokens=null;virtualSurface=null;rendered=[];nodes=[];element.classList.remove('virtual-tokens');element.replaceChildren()}

  function append(){
   if(id!==version)return;frame=null;const end=Math.min(tokens.length,index+250);
   for(;index<end;index++){
    const html=markup(tokens[index],index);if(id!==version)return;
    if(rendered[index]===html&&nodes[index]===element.children[index])continue;
    const template=element.ownerDocument.createElement('template');template.innerHTML=html;
    const node=template.content.firstElementChild,old=element.children[index];
    if(old)old.replaceWith(node);else element.append(node);
    if(id!==version)return;rendered[index]=html;nodes[index]=node;
   }
   if(index<tokens.length)frame=schedule(append);
   else{while(element.children.length>tokens.length)element.lastElementChild.remove();rendered.length=tokens.length;nodes.length=tokens.length;element.setAttribute('aria-busy','false');onComplete()}
  }
  if(!tokens.length){element.innerHTML='<span class="empty">Type some input to see tokens.</span>';rendered=[];nodes=[];element.setAttribute('aria-busy','false');onComplete()}
  else{if(!rendered.length)element.replaceChildren();append()}
 }

 return {render,cancel,reveal};
}

export function tokensAtSelection(tokens,start,end,inputLength){
 let low=0,high=tokens.length;while(low<high){const middle=(low+high)>>>1,token=tokens[middle];if(token.offset+token.value.length<=start)low=middle+1;else high=middle}
 if(start===end&&start===inputLength&&low===tokens.length&&low>0&&tokens[low-1].offset+tokens[low-1].value.length===start)low--;
 const matches=[];for(let i=low;i<tokens.length;i++){const t=tokens[i];if(start===end){if(start>=t.offset&&start<t.offset+t.value.length||start===inputLength&&start===t.offset+t.value.length)matches.push({t,i});break}if(t.offset>=end)break;if(t.offset+t.value.length>start)matches.push({t,i})}return matches;
}
