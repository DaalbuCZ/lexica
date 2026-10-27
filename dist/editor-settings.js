const STORAGE_KEY = 'lexica-editor-settings';

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {simplified: saved.simplified === true};
  } catch {
    return {simplified: false};
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
    <div class="dialog-heading"><div><h2 id="settings-heading">Editor settings</h2></div><button type="button" id="settings-close" aria-label="Close settings">✕</button></div>
    <fieldset class="settings-group"><legend>Machine type</legend>
      <label><input type="radio" name="machine-type" value="fsm"> Standard FSM</label>
      <p>Finite-state machine with character transitions.</p>
      <label><input type="radio" name="machine-type" value="extended"> Extended FSM</label>
      <p>Enables memory cells, transition guards, and side effects.</p>
    </fieldset>
    <fieldset class="settings-group"><legend>Appearance</legend>
      <div id="theme-control"><button id="theme-toggle" type="button" aria-pressed="false" title="Switch theme"><svg class="tool-icon theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg><svg class="tool-icon theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span>Theme</span></button></div>
      <label><input type="checkbox" id="label-boxes"> Boxes around transition labels</label>
    </fieldset>
    <fieldset class="settings-group"><legend>Editing style</legend>
      <label><input type="checkbox" id="simplified-setting"> Simplified view</label>
      <p>Click a state or transition to edit it. Drag a + handle to connect states. Character sets replace regex.</p>
    </fieldset>`;
  document.body.append(dialog);

  const sync = () => {
    dialog.querySelector(`[name="machine-type"][value="${getMachineType()}"]`).checked = true;
    dialog.querySelector('#simplified-setting').checked = editorSettings.simplified;
    dialog.querySelector('#label-boxes').checked = getLabelBoxes();
  };
  const changed = changes => { updateEditorSettings(changes); sync(); onChange(); };
  button.onclick = () => { menu.hidePopover(); sync(); dialog.showModal(); };
  dialog.querySelector('#settings-close').onclick = () => dialog.close();
  dialog.querySelectorAll('[name="machine-type"]').forEach(input => input.onchange = () => { onMachineTypeChange(input.value); sync(); onChange(); });
  dialog.querySelector('#simplified-setting').onchange = e => changed({simplified: e.target.checked});
  document.body.classList.toggle('simplified-view', editorSettings.simplified);
  const hint = document.getElementById('modehint');
  if (hint && editorSettings.simplified) hint.textContent = 'Click a state or transition to edit · Drag + to connect';
}

export function simpleCharacterClass(label, inverted = false) {
  if (!label) return {characters: '', inverted};
  if (label === '.') return {characters: '\\s\\S', inverted};
  const match = label.match(/^\[([\s\S]*)\]$/u);
  if (match) {
    const negated = match[1].startsWith('^');
    return {characters: negated ? match[1].slice(1) : match[1], inverted: inverted !== negated};
  }
  try {
    const expression = new RegExp(`^(?:[${label}])$`, 'u');
    if (!expression.test('')) return {characters: label, inverted};
  } catch {}
  return null;
}

export function characterClassExpression(characters) {
  return `[${characters}]`;
}
