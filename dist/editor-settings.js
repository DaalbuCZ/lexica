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

export function setupEditorSettings(getMachineType, onChange, onMachineTypeChange, onOpenMemory) {
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
      <button type="button" id="manage-memory-cells" hidden>Manage memory cells</button>
    </fieldset>
    <fieldset class="settings-group"><legend>Editing style</legend>
      <label><input type="checkbox" id="simplified-setting"> Simplified view</label>
      <p>Use character sets and graphical connections instead of regex and endpoint selectors.</p>
    </fieldset>`;
  document.body.append(dialog);

  const sync = () => {
    dialog.querySelector(`[name="machine-type"][value="${getMachineType()}"]`).checked = true;
    dialog.querySelector('#simplified-setting').checked = editorSettings.simplified;
    dialog.querySelector('#manage-memory-cells').hidden = getMachineType() !== 'extended';
  };
  const changed = changes => { updateEditorSettings(changes); sync(); onChange(); };
  button.onclick = () => { menu.hidePopover(); sync(); dialog.showModal(); };
  dialog.querySelector('#settings-close').onclick = () => dialog.close();
  dialog.querySelector('#manage-memory-cells').onclick = () => { dialog.close(); onOpenMemory(); };
  dialog.querySelectorAll('[name="machine-type"]').forEach(input => input.onchange = () => { onMachineTypeChange(input.value); sync(); onChange(); });
  dialog.querySelector('#simplified-setting').onchange = e => changed({simplified: e.target.checked});
  document.body.classList.toggle('simplified-view', editorSettings.simplified);
  const hint = document.getElementById('modehint');
  if (hint && editorSettings.simplified) hint.textContent = 'Drag the + handle on a state to create a transition';
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
