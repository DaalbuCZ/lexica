export function readEditorSettings(storage) {
 try { return {simplified: JSON.parse((storage ?? globalThis.localStorage).getItem('lexica-editor-settings') || '{}').simplified === true}; }
 catch { return {simplified: false}; }
}
export const editorSettings = readEditorSettings();
export function updateEditorSettings(changes) {
 Object.assign(editorSettings, changes);
 try { localStorage.setItem('lexica-editor-settings', JSON.stringify({...JSON.parse(localStorage.getItem('lexica-editor-settings') || '{}'), ...changes})); } catch {}
 document.body.classList.toggle('simplified-view', editorSettings.simplified);
}
export function setupEditorSettings(onChange) {
 const menu=document.getElementById('app-menu'),button=document.createElement('button'),dialog=document.createElement('dialog');
 button.id='settings-open';button.type='button';button.innerHTML='<span aria-hidden="true">⚙</span><span>Settings</span>';menu.append(button);
 dialog.id='settings-dialog';dialog.setAttribute('aria-labelledby','settings-heading');
 dialog.innerHTML=`<div class="dialog-heading"><h2 id="settings-heading">Settings</h2><button type="button" id="settings-close" aria-label="Close settings">✕</button></div>
 <section class="setting-section"><h3>Editing</h3><label class="setting-choice"><input type="checkbox" id="simplified-setting"><span><strong>Simplified view</strong><small>Compact state and transition properties.</small></span></label></section>
 <section class="setting-section"><h3>Appearance</h3><div id="theme-control" class="setting-row"><span><strong>Theme</strong><small>Switch between light and dark.</small></span></div><div id="label-control" class="setting-row"><span><strong>Label backgrounds</strong><small>Boxes behind transition labels.</small></span></div></section>
 <section class="setting-section"><h3>Loading screen</h3><button type="button" id="preview-loading">Preview animation</button></section>`;
 document.body.append(dialog);
 for(const [control,target] of [['theme-toggle','theme-control'],['label-boxes','label-control']])dialog.querySelector('#'+target).append(document.getElementById(control));
 button.onclick=()=>{menu.hidePopover();dialog.querySelector('#simplified-setting').checked=editorSettings.simplified;dialog.showModal()};
 dialog.querySelector('#settings-close').onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close()});
 dialog.querySelector('#simplified-setting').onchange=event=>{updateEditorSettings({simplified:event.target.checked});onChange()};
 document.body.classList.toggle('simplified-view',editorSettings.simplified);
}
export function simpleCharacterClass(label, inverted = false) {
  if (!label) return {characters: '', inverted};
  if (label === '.') return null;
  const match = label.match(/^\[((?:\\[\s\S]|[^\]\\])*)\]$/u);
  if (match) {
    const negated = match[1].startsWith('^');
    return {characters: negated ? match[1].slice(1) : match[1], inverted: inverted !== negated};
  }
  // Only one regex atom can be represented by a character set. Concatenation
  // such as abc must never silently become [abc] when switching views.
  if (/^\\(?:[dDsSwWnrtfv]|[\\.^$|?*+()[\]{}\/\-]|x[\da-fA-F]{2}|u[\da-fA-F]{4}|u\{[\da-fA-F]+\})$/u.test(label)) return {characters: label, inverted};
  if ([...label].length === 1 && !/[.^$|?*+()[\]{}\\]/u.test(label)) return {characters: label, inverted};
  return null;
}

export function characterClassExpression(characters) {
  return `[${characters}]`;
}
