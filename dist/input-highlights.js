export function setupInputHighlights(input,mirror,colorClass){
 const native=typeof CSS!=='undefined'&&CSS.highlights&&typeof Highlight!=='undefined',names=Array.from({length:10},(_,i)=>'lexica-token-color-'+i).concat('lexica-error');
 const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function range(start,end){const r=document.createRange(),length=input.value.length;r.setStart(mirror.firstChild,Math.max(0,Math.min(length,start)));r.setEnd(mirror.firstChild,Math.max(0,Math.min(length,end)));return r}
 const firstRect=r=>r.getClientRects()[0]??null;
 function clearStep(){if(native)CSS.highlights.delete('lexica-step');else for(const mark of mirror.querySelectorAll('.step-character'))mark.replaceWith(document.createTextNode(mark.textContent))}
 function render(tokens){
  clearStep();
  if(native){
   // One text node preserves tabs, ligatures, combining marks and joined emoji exactly as typed.
   mirror.textContent=input.value+'\u200b';const groups=new Map(names.map(name=>[name,[]]));
   for(const t of tokens)if(!t.skip)groups.get(t.token==='ERROR'?'lexica-error':'lexica-'+colorClass(t.token)).push(range(t.offset,t.offset+t.value.length));
   for(const [name,ranges] of groups)CSS.highlights.set(name,new Highlight(...ranges));
  }else mirror.innerHTML=tokens.map(t=>`<span class="${t.skip?'token-gap':'token-mark '+(t.token==='ERROR'?'error':colorClass(t.token))}" data-input-offset="${t.offset}">${escape(t.value)}</span>`).join('')+'&#8203;';
 }
 function rect(start,end){
  if(native)return mirror.firstChild?firstRect(range(start,end)):null;
  return mirror.querySelector(`[data-input-offset="${start}"]`)?.getClientRects()[0]??null;
 }
 function step(frame){
  clearStep();if(!(frame.end>frame.offset))return null;
  if(native){if(!mirror.firstChild)return null;const r=range(frame.offset,frame.end),highlight=new Highlight(r);highlight.priority=1;CSS.highlights.set('lexica-step',highlight);return firstRect(r)}
  for(const span of mirror.querySelectorAll('[data-input-offset]')){
   const text=span.textContent,offset=+span.dataset.inputOffset,start=Math.max(0,frame.offset-offset),end=Math.min(text.length,frame.end-offset);if(start>=end)continue;
   const mark=document.createElement('mark');mark.className='step-character';mark.textContent=text.slice(start,end);span.replaceChildren(document.createTextNode(text.slice(0,start)),mark,document.createTextNode(text.slice(end)));
  }
  return mirror.querySelector('.step-character')?.getBoundingClientRect()??null;
 }
 return {render,rect,step,clearStep};
}
