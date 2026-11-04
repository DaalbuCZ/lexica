import { useEffect, useRef } from 'react';
import { dockSettings, nearestDock } from '../core/docking.js';
import { readStorage, writeStorage } from '../state/studio.js';
function applyDock(name, side) {
  const settings = dockSettings(readStorage('lexica-docks', {}));
  settings[name] = side;
  writeStorage('lexica-docks', settings);
  document.body.dataset[name + 'Dock'] = side;
  window.dispatchEvent(new Event('resize'));
}
export function useDockGrip(name) {
  const drag = useRef(null);
  useEffect(() => {
    const settings = dockSettings(readStorage('lexica-docks', {}));
    document.body.dataset[name + 'Dock'] = settings[name];
    return () => document.body.classList.remove('docking');
  }, [name]);
  const finish = (event, cancel = false) => {
    const target = drag.current;
    if (!target) return;
    drag.current = null;
    document.body.classList.remove('docking');
    const preview = document.getElementById('dock-preview');
    if (preview) preview.hidden = true;
    if (target.moved && !cancel) applyDock(name, target.side);
    if (event.currentTarget.hasPointerCapture(target.id))
      event.currentTarget.releasePointerCapture(target.id);
  };
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    },
    onPointerMove: (event) => {
      const target = drag.current;
      if (!target) return;
      event.stopPropagation();
      if (Math.hypot(event.clientX - target.x, event.clientY - target.y) > 5) target.moved = true;
      if (!target.moved) return;
      target.side = nearestDock(event.clientX, event.clientY, innerWidth, innerHeight);
      const preview = document.getElementById('dock-preview');
      preview.dataset.side = target.side;
      preview.dataset.panel = name;
      preview.hidden = false;
      document.body.classList.add('docking');
    },
    onPointerUp: (event) => finish(event),
    onPointerCancel: (event) => finish(event, true),
    onLostPointerCapture: (event) => finish(event, true),
    onKeyDown: (event) => {
      const side = {
        ArrowUp: 'top',
        ArrowDown: 'bottom',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }[event.key];
      if (side) {
        event.preventDefault();
        event.stopPropagation();
        applyDock(name, side);
      } else if (event.key === 'Escape') finish(event, true);
    },
  };
}
