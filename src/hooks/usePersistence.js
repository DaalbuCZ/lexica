import { machineDocument } from '../core/machine-file.js';
import { useEffect } from 'react';
import { useStudio, persistedMachine, writeStorage } from '../state/studio.js';
export function usePersistence() {
  useEffect(() => {
    let timer,
      dirty = false;
    const save = () => {
      clearTimeout(timer);
      if (!dirty) return;
      if (!writeStorage('lexica-machine', machineDocument(persistedMachine())))
        useStudio.getState().notify('Storage unavailable — export to save.');
      else dirty = false;
    };
    const unsubscribe = useStudio.subscribe((state, previous) => {
      if (
        state.scene.version !== previous.scene.version ||
        state.input !== previous.input ||
        state.showSkipped !== previous.showSkipped
      ) {
        clearTimeout(timer);
        dirty = true;
        timer = setTimeout(save, 120);
      }
    });
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(timer);
      save();
      unsubscribe();
      window.removeEventListener('pagehide', save);
    };
  }, []);
}
