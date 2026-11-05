import { create } from 'zustand';
import { toast } from 'sonner';
import { example, parseMachine } from '../core/lexer.js';
import { readEditorSettings } from '../core/editor-settings.js';
export function readStorage(key, fallback, json = true) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : json ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}
export function writeStorage(key, value, json = true) {
  try {
    localStorage.setItem(key, json ? JSON.stringify(value) : String(value));
    return true;
  } catch {
    return false;
  }
}
let initialMachine;
let restoreError = false;
try {
  const saved = localStorage.getItem('lexica-machine');
  initialMachine = saved ? parseMachine(saved) : example();
} catch {
  initialMachine = example();
  restoreError = true;
}
export const useStudio = create((set) => ({
  scene: {
    machine: initialMachine,
    selection: {
      type: 'none',
    },
    selectedStates: new Set(),
    selectedEdges: new Set(),
    selectedComments: new Set(),
    selectedCommentLinks: new Set(),
    tool: 'pan',
    openGroup: null,
    canUndo: false,
    canRedo: false,
    version: 0,
  },
  controller: null,
  settings: readEditorSettings(),
  input: initialMachine.tester?.input ?? 'hello 42 world',
  showSkipped: initialMachine.tester?.showSkipped ?? false,
  propertiesOpen: false,
  dialog: null,
  contextMenu: null,
  notice: restoreError ? 'Could not restore saved machine. Example loaded.' : '',
  set: (changes) => set(changes),
  notify: (notice) => toast(notice),
}));
export function persistedMachine() {
  const { scene, input, showSkipped } = useStudio.getState();
  return {
    ...scene.machine,
    tester: {
      input,
      showSkipped,
    },
  };
}
export function machineType(machine) {
  return machine.machineType ?? (machine.stack ? 'extended' : 'fsm');
}
