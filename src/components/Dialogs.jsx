import { useLayoutEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import {
  useStudio,
  persistedMachine,
  readStorage,
  writeStorage,
  machineType,
} from '../state/studio.js';
import { parseMachine, toTikz } from '../core/lexer.js';
import { machineSvg } from '../core/svg-export.js';
import { SPRING_DEFAULTS, SPRING_LIMITS, springSettings } from '../core/spring-settings.js';
import { graphView } from '../core/groups.js';
import { routeEdges } from '../core/layout.js';
import { createGraphCanvas, graphBounds } from '../core/canvas-graph.js';
import { transitionLabel } from '../core/labels.js';
import { simpleTransitionLabel } from '../core/editor-settings.js';
import { tokenColorClass } from '../core/token-colors.js';
import { toggleTheme } from '../hooks/useTheme.js';
import { Check, Select, Modal } from './ui.jsx';
import { MemoryCells } from './MemoryEditor.jsx';
import { destinationName } from './Inspector.jsx';
export function Dialogs() {
  const dialog = useStudio((s) => s.dialog);
  const close = () =>
    useStudio.setState({
      dialog: null,
    });
  if (!dialog) return null;
  const props = {
    dialog,
    onClose: close,
  };
  switch (dialog.type) {
    case 'settings':
      return <SettingsDialog {...props} />;
    case 'import':
      return <ImportDialog {...props} />;
    case 'export':
      return <ExportDialog {...props} />;
    case 'layout':
      return <LayoutDialog {...props} />;
    case 'memory':
      return (
        <Modal title="Memory cells" onClose={close}>
          <MemoryCells />
        </Modal>
      );
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />;
    case 'group':
      return <GroupDialog {...props} />;
    case 'move-group':
      return <MoveGroupDialog {...props} />;
    case 'group-target':
      return <GroupTargetDialog {...props} />;
    case 'combined-transition':
      return <CombinedTransitionDialog {...props} />;
    default:
      return null;
  }
}
function SettingsDialog({ onClose }) {
  const settings = useStudio((s) => s.settings),
    showSkipped = useStudio((s) => s.showSkipped),
    machine = useStudio((s) => s.scene.machine),
    controller = useStudio((s) => s.controller);
  const change = (changes) =>
    useStudio.setState({
      settings: {
        ...settings,
        ...changes,
      },
    });
  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="setting-section">
        <h3>Machine</h3>
        {[
          ['fsm', 'Standard FSM', 'Character transitions.'],
          ['extended', 'Extended FSM', 'Numeric stacks, guards, and side effects.'],
        ].map(([type, title, description]) => (
          <label className="setting-choice" key={type}>
            <input
              type="radio"
              name="machine-type"
              value={type}
              checked={machineType(machine) === type}
              onChange={() =>
                controller.update((next) => {
                  next.machineType = type;
                })
              }
            />
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </section>
      <section className="setting-section">
        <h3>Editing</h3>
        <Check
          id="label-boxes"
          label="Label backgrounds"
          checked={machine.labelBoxes}
          onChange={(value) =>
            controller.update((next) => {
              next.labelBoxes = value;
            })
          }
        />
        <Check
          id="simplified-setting"
          label="Simplified view"
          checked={settings.simplified}
          onChange={(simplified) =>
            change({
              simplified,
            })
          }
        />
      </section>
      <section className="setting-section">
        <h3>Lexer tester</h3>
        <Check
          id="show-skipped"
          label="Show skipped tokens"
          checked={showSkipped}
          onChange={(showSkipped) =>
            useStudio.setState({
              showSkipped,
            })
          }
        />
      </section>
      <section className="setting-section">
        <h3>Groups</h3>
        <Select
          id="group-presentation"
          label="Open groups in"
          value={settings.groupPresentation}
          onChange={(groupPresentation) =>
            change({
              groupPresentation,
            })
          }
        >
          <option value="canvas">Full canvas with breadcrumbs</option>
          <option value="overlay">Canvas overlay</option>
        </Select>
      </section>
      <section className="setting-section">
        <h3>Pinch zoom</h3>
        <label className="setting-row" htmlFor="pinch-sensitivity">
          <span>
            <strong>Sensitivity</strong>
            <output>{settings.pinchSensitivity.toFixed(1)}×</output>
          </span>
          <input
            id="pinch-sensitivity"
            type="range"
            min="0.2"
            max="2"
            step="0.1"
            value={settings.pinchSensitivity}
            onChange={(e) =>
              change({
                pinchSensitivity: Number(e.target.value),
              })
            }
          />
        </label>
      </section>
      <section className="setting-section">
        <h3>Appearance</h3>
        <button id="theme-toggle" onClick={toggleTheme}>
          <Moon className="tool-icon theme-moon" />
          <Sun className="tool-icon theme-sun" /> Switch theme
        </button>
      </section>
    </Modal>
  );
}
function ImportDialog({ onClose }) {
  const [text, setText] = useState(''),
    [error, setError] = useState(''),
    file = useRef(null);
  const importText = (value) => {
    try {
      if (value.length > 1_000_000) throw Error('Machine is too large (maximum 1 MB).');
      const machine = parseMachine(value);
      useStudio.getState().controller.replace(machine);
      onClose();
      useStudio.getState().notify('Machine imported. Undo to restore the previous machine.');
    } catch (error) {
      setError(error.message);
    }
  };
  return (
    <Modal title="Import machine" onClose={onClose}>
      <label className="field-label" htmlFor="import-json">
        PASTE MACHINE JSON
      </label>
      <textarea
        id="import-json"
        rows={10}
        spellCheck={false}
        placeholder="Paste exported machine JSON here"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p id="import-error" role="alert">
        {error}
      </p>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const selected = e.target.files[0];
          e.target.value = '';
          if (!selected) return;
          try {
            if (selected.size > 1_000_000) throw Error('Machine is too large (maximum 1 MB).');
            importText(await selected.text());
          } catch (error) {
            setError(error.message);
          }
        }}
      />
      <div className="dialog-actions">
        <button id="import-file" onClick={() => file.current.click()}>
          Choose .json file
        </button>
        <button id="import-paste" className="primary" onClick={() => importText(text)}>
          Import JSON
        </button>
      </div>
    </Modal>
  );
}
function ExportDialog({ onClose }) {
  const [format, setFormat] = useState('json'),
    [standalone, setStandalone] = useState(true);
  const machine = persistedMachine();
  let text = '',
    error = '';
  try {
    text =
      format === 'json'
        ? JSON.stringify(machine, null, 2)
        : format === 'tex'
          ? toTikz(machine, standalone)
          : machineSvg(machine);
  } catch (issue) {
    error = issue.message;
  }
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([text], {
        type:
          format === 'json'
            ? 'application/json'
            : format === 'svg'
              ? 'image/svg+xml'
              : 'application/x-tex',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lexer.' + format;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal title="Export your machine" onClose={onClose}>
      <div className="export-options">
        <Select id="format" label="Format" value={format} onChange={setFormat}>
          <option value="json">Editable machine (.json)</option>
          <option value="tex">LaTeX / TikZ (.tex)</option>
          <option value="svg">Vector diagram (.svg)</option>
        </Select>
        {format === 'tex' && (
          <Check
            id="standalone"
            label="Complete compilable document"
            checked={standalone}
            onChange={setStandalone}
          />
        )}
      </div>
      <textarea id="export-preview" spellCheck={false} readOnly value={text} />
      {error && <p role="alert">{error}</p>}
      {format === 'tex' && (
        <p className="export-help">
          Uses TikZ's automata library. Compile with pdfLaTeX or LuaLaTeX.
        </p>
      )}
      <div className="dialog-actions">
        <button
          id="copy"
          disabled={!!error}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              useStudio.getState().notify('Copied to clipboard.');
            } catch {
              useStudio.getState().notify('Select and copy the export preview.');
            }
          }}
        >
          Copy to clipboard
        </button>
        <button id="download" className="primary" disabled={!!error} onClick={download}>
          ↓ Download .{format}
        </button>
      </div>
    </Modal>
  );
}
function LayoutDialog({ onClose }) {
  const [mode, setMode] = useState(() => {
    const value = readStorage('lexica-layout-mode', 'circle', false);
    return ['tree', 'circle', 'spring'].includes(value) ? value : 'circle';
  });
  const [spacing, setSpacing] = useState(() => {
    const value = readStorage('lexica-layout-density', '0.75', false);
    return ['0.35', '0.5', '0.75', '1'].includes(value) ? value : '0.75';
  });
  const [forces, setForces] = useState(() =>
      springSettings(readStorage('lexica-spring-forces', {})),
    ),
    [smartGroups, setSmartGroups] = useState(() => readStorage('lexica-layout-smart-groups', true)),
    [disregardGroups, setDisregardGroups] = useState(() =>
      readStorage('lexica-layout-disregard-groups', false),
    ),
    [busy, setBusy] = useState(false);
  const apply = () => {
    if (busy) return;
    setBusy(true);
    writeStorage('lexica-layout-mode', mode, false);
    writeStorage('lexica-layout-density', spacing, false);
    writeStorage('lexica-spring-forces', forces);
    writeStorage('lexica-layout-smart-groups', smartGroups);
    writeStorage('lexica-layout-disregard-groups', disregardGroups);
    requestAnimationFrame(() =>
      setTimeout(async () => {
        await useStudio.getState().controller.arrange({
          mode,
          spacing: Number(spacing),
          forces,
          smartGroups,
          disregardGroups,
        });
        setBusy(false);
        onClose();
      }, 30),
    );
  };
  return (
    <Modal title="Arrange graph" onClose={onClose} className="layout-dialog">
      <Select id="layout-mode" label="Layout" value={mode} onChange={setMode}>
        <option value="tree">Tree</option>
        <option value="circle">Radial</option>
        <option value="spring">Spring</option>
      </Select>
      <Select id="layout-density" label="Density" value={spacing} onChange={setSpacing}>
        <option value="0.35">Extra compact</option>
        <option value="0.5">Compact</option>
        <option value="0.75">Normal</option>
        <option value="1">Spacious</option>
      </Select>
      {mode === 'spring' && (
        <div id="spring-forces" className="spring-forces" role="group" aria-label="Spring forces">
          {Object.keys(SPRING_DEFAULTS).map((key) => (
            <label className="force-field" key={key} htmlFor={'spring-' + key}>
              {key === 'distance'
                ? 'Link distance'
                : key[0].toUpperCase() + key.slice(1) + ' force'}
              <output>{forces[key]}</output>
              <input
                id={'spring-' + key}
                type="range"
                min={SPRING_LIMITS[key][0]}
                max={SPRING_LIMITS[key][1]}
                step={key === 'distance' ? 10 : key === 'repel' ? 0.5 : 0.01}
                value={forces[key]}
                onChange={(e) =>
                  setForces({
                    ...forces,
                    [key]: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
          <button
            onClick={() =>
              setForces({
                ...SPRING_DEFAULTS,
              })
            }
          >
            Reset forces
          </button>
        </div>
      )}
      <Check
        id="layout-portals"
        label="Smart groups for crowded graphs"
        checked={smartGroups}
        onChange={setSmartGroups}
      />
      <Check
        id="layout-disregard-groups"
        label="Disregard current groups"
        checked={disregardGroups}
        onChange={setDisregardGroups}
      />
      <div className="dialog-actions">
        <button id="arrange" className="primary" disabled={busy} aria-busy={busy} onClick={apply}>
          {busy ? 'Arranging…' : 'Apply layout'}
        </button>
      </div>
    </Modal>
  );
}
function GroupDialog({ dialog, onClose }) {
  const [name, setName] = useState(dialog.name ?? '');
  return (
    <Modal
      title={dialog.groupId ? 'Rename group' : 'Group states'}
      onClose={onClose}
      className="group-dialog"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (useStudio.getState().controller.group(name, dialog.groupId)) onClose();
        }}
      >
        <label className="prop-field">
          Name
          <input
            id="group-name"
            value={name}
            maxLength={60}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            {dialog.groupId ? 'Save name' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function MoveGroupDialog({ dialog, onClose }) {
  const groups = useStudio((s) => s.scene.machine.groups ?? []),
    [target, setTarget] = useState('');
  return (
    <Modal title="Move states to group" onClose={onClose} className="group-dialog">
      <Select label="Group" value={target} onChange={setTarget}>
        <option value="">Overview</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <div className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            if (useStudio.getState().controller.moveToGroup(dialog.stateIds, target)) onClose();
          }}
        >
          Move states
        </button>
      </div>
    </Modal>
  );
}
function CombinedTransitionDialog({ dialog, onClose }) {
  const { machine } = useStudio((s) => s.scene),
    controller = useStudio((s) => s.controller);
  return (
    <Modal title="Choose a transition to edit" onClose={onClose} className="group-dialog">
      <div className="group-target-list">
        {dialog.indices.map((index) => {
          const edge = machine.edges[index];
          return (
            edge && (
              <button
                key={index}
                onClick={() => {
                  controller.select('edge', index);
                  onClose();
                }}
              >
                {machine.states.find((s) => s.id === edge.from)?.name} →{' '}
                {destinationName(machine, edge)} · {transitionLabel(edge) || 'empty'}
              </button>
            )
          );
        })}
      </div>
    </Modal>
  );
}
function GroupTargetDialog({ dialog, onClose }) {
  const ref = useRef(null),
    previewRef = useRef(null),
    { machine } = useStudio((s) => s.scene),
    settings = useStudio((s) => s.settings),
    controller = useStudio((s) => s.controller);
  const group = machine.groups?.find((g) => g.id === dialog.groupId);
  useLayoutEffect(() => {
    const canvas = ref.current,
      preview = createGraphCanvas(canvas, document.createElement('canvas')),
      shown = graphView(machine, dialog.groupId, false),
      label = settings.simplified ? simpleTransitionLabel : transitionLabel,
      routes = routeEdges(shown, label),
      bounds = graphBounds(shown, routes);
    previewRef.current = preview;
    const scale = Math.max(
      (bounds.width + 100) / Math.max(220, canvas.clientWidth - 70),
      (bounds.height + 70) / Math.max(180, canvas.clientHeight - 100),
    );
    preview.setView({
      x: bounds.x + bounds.width / 2 - (canvas.clientWidth / 2) * scale,
      y: bounds.y + bounds.height / 2 - (canvas.clientHeight / 2) * scale,
      width: canvas.clientWidth * scale,
      height: canvas.clientHeight * scale,
    });
    preview.draw({
      machine: shown,
      routes,
      label,
      tokenColor: (name) =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--token-accent-' + tokenColorClass(name).slice(-1))
          .trim(),
      selectedStates: new Set(),
      selectedComments: new Set(),
      selectedCommentLinks: new Set(),
      edgeSelected: () => false,
      failures: {
        states: [],
        edges: [],
      },
    });
  }, [machine, dialog.groupId, settings.simplified]);
  return (
    <Modal
      title={`Choose a state in ${group?.name ?? 'group'}`}
      onClose={onClose}
      className="group-dialog group-target-dialog"
    >
      <canvas
        ref={ref}
        className="group-target-graph"
        aria-label="Choose a state from the group graph"
        onClick={(event) => {
          const hit = previewRef.current.hitClient(event);
          if (hit?.type === 'state') {
            controller.connect(dialog.from, hit.id);
            onClose();
          }
        }}
      />
      <div className="group-target-list" aria-label="Group states">
        {group?.stateIds.map((id) => (
          <button
            key={id}
            onClick={() => {
              controller.connect(dialog.from, id);
              onClose();
            }}
          >
            {machine.states.find((s) => s.id === id)?.name ?? id}
          </button>
        ))}
      </div>
    </Modal>
  );
}
const shortcuts = {
  Canvas: [
    ['Select tool', 'V'],
    ['Pan tool', 'H'],
    ['Temporary pan', 'Space'],
    ['Add comment', 'C'],
    ['Toggle accepting state', 'A'],
    ['Delete selection', 'Delete'],
    ['Cancel action', 'Esc'],
    ['Show shortcuts', '?'],
  ],
  Edit: [
    ['Undo', 'Ctrl / ⌘ Z'],
    ['Redo', 'Ctrl / ⌘ Shift Z'],
    ['Copy / cut / paste', 'Ctrl / ⌘ C / X / V'],
    ['Select all', 'Ctrl / ⌘ A'],
    ['Add state', 'Double-click canvas'],
    ['Reset connection bend', 'Double right-click connection'],
  ],
  Debugger: [
    ['Start or stop', 'Alt S'],
    ['Step forward', 'Alt →'],
    ['Step back', 'Alt ←'],
    ['Next / previous token', 'Alt Shift → / ←'],
  ],
};
function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <p className="shortcuts-intro">
        Shortcuts work when the canvas is active. Text fields keep their normal keys.
      </p>
      <div className="shortcut-groups">
        {Object.entries(shortcuts).map(([name, items]) => (
          <section key={name}>
            <h3>{name}</h3>
            {items.map(([label, key]) => (
              <div className="shortcut-row" key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
