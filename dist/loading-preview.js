export function setupLoadingPreview(source,button){
 const template=source.cloneNode(true);
 template.removeAttribute('id');
 const dialog=document.createElement('dialog');
 dialog.id='loading-preview';
 dialog.setAttribute('aria-label','Loading animation preview');
 document.body.append(dialog);
 function open(){
  if(dialog.open)return;
  const scene=template.cloneNode(true),close=document.createElement('button');
  close.className='loading-preview-close';close.type='button';
  close.textContent='Close preview';close.title='Close preview (Esc)';
  close.onclick=()=>dialog.close();
  dialog.replaceChildren(scene,close);
  dialog.showModal();close.focus();
 }
 button.onclick=open;
 dialog.addEventListener('close',()=>dialog.replaceChildren());
 return {open,close:()=>dialog.close()};
}
