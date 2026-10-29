export function tokenRows(sizes,width,gap=6){
 const rows=[];let row=null,x=0,y=0;
 for(let i=0;i<sizes.length;i++){const size=sizes[i],w=Math.min(width,size.width);if(!row||x+w>width+.5){if(row)y+=row.height+gap;row={start:i,end:i,y,height:size.height};rows.push(row);x=0}row.end=i+1;row.height=Math.max(row.height,size.height);x+=w+gap}
 return rows;
}
export function visibleTokenRows(rows,top,height){
 let low=0,high=rows.length;while(low<high){const middle=(low+high)>>>1;if(rows[middle].y+rows[middle].height<top)low=middle+1;else high=middle}
 const first=Math.max(0,low-2);let last=low;while(last<rows.length&&rows[last].y<top+height)last++;return {first,last:Math.min(rows.length,last+2)};
}
export function createVirtualTokenOutput(element,markup,{schedule,cancelFrame,onComplete}){
 const doc=element.ownerDocument;let tokens=[],rows=[],sizes=[],surface=null,measure=null,frame=null,revision=0,enabled=false,painted='',width=0;
 const cache=new Map(),natural=new Map();
 function cancel(){revision++;enabled=false;if(frame!==null)cancelFrame(frame);frame=null;measure?.remove();measure=null}
 function reset(){cancel();surface=null;tokens=[];element.classList.remove('virtual-token-flow')}
 function paint(force=false){
  if(!enabled||!surface||surface.parentNode!==element||!rows.length)return;
  const window=visibleTokenRows(rows,element.scrollTop,element.clientHeight),key=window.first+':'+window.last;
  if(!force&&key===painted)return;painted=key;
  const first=rows[window.first]?.start??0,last=rows[window.last-1]?.end??first;
  surface.innerHTML=tokens.slice(first,last).map((token,i)=>markup(token,first+i)).join('');
  let index=first;for(let r=window.first;r<window.last;r++){let x=0;for(;index<rows[r].end;index++){const node=surface.children[index-first];Object.assign(node.style,{position:'absolute',left:x+'px',top:rows[r].y+'px',width:Math.min(width,sizes[index].width)+'px',height:sizes[index].height+'px'});x+=Math.min(width,sizes[index].width)+6}}
 }
 function render(next){
  cancel();enabled=true;tokens=next;rows=[];painted='';const id=revision;element.classList.add('virtual-token-flow');width=Math.max(1,element.clientWidth-18);
  if(!surface||surface.parentNode!==element){surface=doc.createElement('div');surface.className='virtual-token-surface';element.replaceChildren(surface)}
  measure=doc.createElement('div');measure.className='token-measure';measure.style.width=width+'px';element.append(measure);
  const identities=tokens.map(t=>JSON.stringify([t.token,!!t.skip,t.value])),keys=identities.map(key=>width+':'+key),missing=new Map();keys.forEach((key,i)=>{const size=natural.get(identities[i]);if(size&&size.width<=width)cache.set(key,size);if(!cache.has(key)&&!missing.has(key))missing.set(key,i)});const entries=[...missing];let index=0;
  element.setAttribute('aria-busy','true');
  function batch(){
   if(id!==revision)return;frame=null;const end=Math.min(entries.length,index+200);
   measure.innerHTML=entries.slice(index,end).map(([,i])=>markup(tokens[i],i)).join('');
   for(let i=index;i<end;i++)if(!natural.has(identities[entries[i][1]]))measure.children[i-index].style.maxWidth='none';
   for(let i=index;i<end;i++){const identity=identities[entries[i][1]];if(!natural.has(identity)){const rect=measure.children[i-index].getBoundingClientRect();natural.set(identity,{width:rect.width,height:rect.height})}}
   for(let i=index;i<end;i++)measure.children[i-index].style.maxWidth=width+'px';
   for(let i=index;i<end;i++){const size=natural.get(identities[entries[i][1]]);if(size.width<=width)cache.set(entries[i][0],size);else{const rect=measure.children[i-index].getBoundingClientRect();cache.set(entries[i][0],{width:rect.width,height:rect.height})}}index=end;
   if(index<entries.length){frame=schedule(batch);return}
   sizes=keys.map(key=>cache.get(key));rows=tokenRows(sizes,width);const last=rows.at(-1);surface.style.height=(last?last.y+last.height:0)+'px';measure.remove();measure=null;paint(true);element.setAttribute('aria-busy','false');onComplete();
   if(cache.size>20000)cache.clear();if(natural.size>20000)natural.clear();
  }
  batch();
 }
 function reveal(index){if(!enabled)return;const row=rows.find(row=>index>=row.start&&index<row.end);if(!row)return;if(row.y<element.scrollTop||row.y+row.height>element.scrollTop+element.clientHeight)element.scrollTop=row.y;paint()}
 element.addEventListener('scroll',()=>paint());
 element.addEventListener('keydown',event=>{if(!enabled)return;const card=event.target.closest('[data-token-index]');if(!card)return;const delta=event.key==='Tab'?(event.shiftKey?-1:1):{ArrowLeft:-1,ArrowRight:1}[event.key];if(delta===undefined)return;const index=Number(card.dataset.tokenIndex)+delta;if(index<0||index>=tokens.length)return;event.preventDefault();reveal(index);element.querySelector(`[data-token-index="${index}"]`)?.focus({preventScroll:true})});
 new ResizeObserver(()=>{if(enabled&&Math.abs(element.clientWidth-18-width)>.5)render(tokens);else paint(true)}).observe(element);
 doc.fonts?.ready.then(()=>{cache.clear();natural.clear();if(enabled)render(tokens)});
 return {render,cancel,reset,reveal};
}
