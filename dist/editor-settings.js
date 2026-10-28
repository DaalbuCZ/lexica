const STORAGE_KEY = 'lexica-editor-settings';

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const sensitivity = Number(saved.pinchSensitivity);
    return {simplified: saved.simplified === true, pinchSensitivity: Number.isFinite(sensitivity) ? Math.max(0.2, Math.min(2, sensitivity)) : 1};
  } catch {
    return {simplified: false, pinchSensitivity: 1};
  }
}

export const editorSettings = readSettings();

export function updateEditorSettings(changes) {
  Object.assign(editorSettings, changes);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(editorSettings)); } catch {}
  document.body.classList.toggle('simplified-view', editorSettings.simplified);
}

export function setupEditorSettings(getMachineType, getLabelBoxes, onChange, onMachineTypeChange) {
  const menu = document.getElementById('app-menu');
  const button = document.createElement('button');
  button.id = 'settings-open';
  button.type = 'button';
  button.innerHTML = '<span class="settings-icon" aria-hidden="true">⚙</span><span>Settings</span>';
  menu.append(button);

  const dialog = document.createElement('dialog');
  dialog.id = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-heading');
  dialog.innerHTML = `
    <div class="dialog-heading"><h2 id="settings-heading">Settings</h2><button type="button" id="settings-close" aria-label="Close settings">✕</button></div>
    <section class="setting-section"><h3>Machine</h3>
      <label class="setting-choice"><input type="radio" name="machine-type" value="fsm"><span><strong>Standard FSM</strong><small>Character transitions.</small></span></label>
      <label class="setting-choice"><input type="radio" name="machine-type" value="extended"><span><strong>Extended FSM</strong><small>Memory counters, guards, and side effects.</small></span></label>
    </section>
    <section class="setting-section"><h3>Editing</h3>
      <label class="setting-choice"><input type="checkbox" id="simplified-setting"><span><strong>Simplified view</strong><small>Use character sets and compact properties.</small></span></label>
      <label class="setting-choice"><input type="checkbox" id="label-boxes"><span><strong>Label backgrounds</strong><small>Draw a box behind transition labels.</small></span></label>
    </section>
<section class="setting-section"><h3>Lexer tester</h3><label class="setting-choice"><input type="checkbox" id="show-skipped"><span><strong>Show skipped tokens</strong><small>Include whitespace and other skipped tokens in the output.</small></span></label></section>
    <section class="setting-section"><h3>Appearance</h3>
      <div class="setting-row"><span><strong>Theme</strong><small>Switch between light and dark.</small></span><button id="theme-toggle" type="button" aria-pressed="false" title="Switch theme"><svg class="tool-icon theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg><svg class="tool-icon theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span>Switch theme</span></button></div>
    </section>
    <section class="setting-section zoom-settings"><h3>Pinch zoom</h3>
      <label class="setting-row" for="pinch-sensitivity"><span><strong>Sensitivity</strong><output id="pinch-sensitivity-value"></output></span><input id="pinch-sensitivity" type="range" min="0.2" max="2" step="0.1"></label>
      <p>Controls trackpad and touchscreen pinching.</p>
    </section>`;
  document.body.append(dialog);

  const sync = () => {
    dialog.querySelector(`[name="machine-type"][value="${getMachineType()}"]`).checked = true;
    dialog.querySelector('#simplified-setting').checked = editorSettings.simplified;
    dialog.querySelector('#label-boxes').checked = getLabelBoxes();
    dialog.querySelector('#pinch-sensitivity').value = editorSettings.pinchSensitivity;
    dialog.querySelector('#pinch-sensitivity-value').value = `${editorSettings.pinchSensitivity.toFixed(1)}×`;
  };
  const changed = changes => { updateEditorSettings(changes); sync(); onChange(); };
  button.onclick = () => { menu.hidePopover(); sync(); dialog.showModal(); };
  dialog.querySelector('#settings-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.querySelectorAll('[name="machine-type"]').forEach(input => input.onchange = () => { onMachineTypeChange(input.value); sync(); onChange(); });
  dialog.querySelector('#simplified-setting').onchange = e => changed({simplified: e.target.checked});
  dialog.querySelector('#pinch-sensitivity').oninput = e => {
    editorSettings.pinchSensitivity = Number(e.target.value);
    dialog.querySelector('#pinch-sensitivity-value').value = `${editorSettings.pinchSensitivity.toFixed(1)}×`;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(editorSettings)); } catch {}
  };
  document.body.classList.toggle('simplified-view', editorSettings.simplified);
  const hint = document.getElementById('modehint');
  if (hint && editorSettings.simplified) hint.textContent = 'Click a state or transition to edit · Drag + to connect';
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
