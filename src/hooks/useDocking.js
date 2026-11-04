import { useEffect, useRef } from 'react';
import { dockSettings, nearestDock, nearestDockZone } from '../core/docking.js';
import { readStorage, writeStorage } from '../state/studio.js';
function applyDock(name, side) {
  const settings = dockSettings(readStorage('lexica-docks', {}));
  settings[name] = side;
  writeStorage('lexica-docks', settings);
  document.body.dataset[name + 'Dock'] = side;
  if (name !== 'debugger') window.dispatchEvent(new Event('resize'));
}
function findTarget(targets, x, y, preferred) {
  let best;
  for (const box of targets) {
    const dx = Math.max(box.x - x, x - box.x - box.width, 0);
    const dy = Math.max(box.y - y, y - box.y - box.height, 0);
    const distance = Math.hypot(dx, dy);
    const centerDistance = Math.hypot(x - box.x - box.width / 2, y - box.y - box.height / 2);
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance &&
        (centerDistance < best.centerDistance ||
          (centerDistance === best.centerDistance && box.zone === preferred)))
    ) {
      best = { box, distance, centerDistance };
    }
  }
  return best;
}

export function useDockGrip(name) {
  const drag = useRef(null);
  useEffect(() => {
    const settings = dockSettings(readStorage('lexica-docks', {}));
    document.body.dataset[name + 'Dock'] = settings[name];
    return () => {
      if (drag.current?.moved) {
        document.body.classList.remove('docking');
        document.getElementById('dock-preview').hidden = true;
      }
    };
  }, [name]);
  const pickTarget = (target, { clientX, clientY }) => {
    const preferred = name === 'debugger' ? nearestDockZone : nearestDock;
    return findTarget(
      target.targets,
      clientX,
      clientY,
      preferred(clientX, clientY, innerWidth, innerHeight),
    );
  };
  const finish = (event, cancel = false) => {
    const target = drag.current;
    if (!target) return;
    drag.current = null;
    document.body.classList.remove('docking');
    const preview = document.getElementById('dock-preview');
    if (preview) preview.hidden = true;
    if (target.moved && !cancel) {
      const hit = pickTarget(target, event);
      if (hit?.distance === 0) applyDock(name, hit.box.zone);
    }
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
      const preview = document.getElementById('dock-preview');
      if (!target.targets) {
        const detail = { name, targets: [] };
        preview.dispatchEvent(new CustomEvent('measure-dock-targets', { detail }));
        target.targets = detail.targets;
      }
      const hit = pickTarget(target, event);
      if (!hit) return;
      const { box, distance } = hit;
      preview.dataset.panel = name;
      preview.dataset.zone = box.zone;
      preview.toggleAttribute('data-outside', distance > 0);
      Object.assign(preview.style, {
        inset: box.y + 'px auto auto ' + box.x + 'px',
        width: box.width + 'px',
        height: box.height + 'px',
      });
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
      } else if (name === 'debugger' && (event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        event.stopPropagation();
        const [edge] = (document.body.dataset.debuggerDock || 'top').split('-');
        applyDock(name, edge + (event.key === 'Home' ? '-start' : '-end'));
      } else if (event.key === 'Escape') finish(event, true);
    },
  };
}
