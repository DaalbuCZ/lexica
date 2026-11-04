import { useEffect, useRef, useState } from 'react';
import { testerSize } from '../core/tester-resize.js';
import { readStorage, writeStorage } from '../state/studio.js';
const storageKey = 'lexica-tester-size';
const vertical = (side) => side === 'left' || side === 'right';
function apply(sizes) {
  document.body.style.setProperty(
    '--tester-width',
    testerSize(sizes.width, 'left', innerWidth, innerHeight) + 'px',
  );
  document.body.style.setProperty(
    '--tester-height',
    testerSize(sizes.height, 'bottom', innerWidth, innerHeight) + 'px',
  );
}
export function useTesterResize() {
  const [sizes, setSizes] = useState(() => ({
    ...{
      height: 190,
      width: 320,
    },
    ...readStorage(storageKey, {}),
  }));
  const [side, setSide] = useState(() => document.body.dataset.testerDock || 'bottom');
  const current = useRef(sizes),
    drag = useRef(null),
    pending = useRef(null),
    frame = useRef(null);
  useEffect(() => {
    const resize = () => {
      apply(current.current);
      setSide(document.body.dataset.testerDock || 'bottom');
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      drag.current?.handle.style.removeProperty('--tester-resize-preview');
      document.body.classList.remove('previewing-tester-resize');
    };
  }, []);
  const update = (value) => {
    const next = {
      ...current.current,
      [vertical(side) ? 'width' : 'height']: testerSize(value, side, innerWidth, innerHeight),
    };
    current.current = next;
    setSizes(next);
    apply(next);
  };
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const preview = drag.current;
    if (!preview || pending.current === null) return;
    const next = testerSize(pending.current, side, innerWidth, innerHeight);
    const delta = (next - preview.size) * (['left', 'top'].includes(side) ? 1 : -1);
    preview.handle.style.setProperty('--tester-resize-preview', delta + 'px');
  };
  const finish = (event, cancel = false) => {
    const previous = drag.current;
    if (!previous) return;
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!cancel && pending.current !== null) {
      update(pending.current);
      writeStorage(storageKey, current.current);
    }
    pending.current = null;
    previous.handle.style.removeProperty('--tester-resize-preview');
    document.body.classList.remove('previewing-tester-resize');
    if (!cancel) window.dispatchEvent(new Event('resize'));
    if (event.currentTarget.hasPointerCapture(previous.id))
      event.currentTarget.releasePointerCapture(previous.id);
  };
  return {
    'aria-orientation': vertical(side) ? 'vertical' : 'horizontal',
    'aria-valuenow': testerSize(
      vertical(side) ? sizes.width : sizes.height,
      side,
      innerWidth,
      innerHeight,
    ),
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const box = event.currentTarget.closest('.tester').getBoundingClientRect();
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        size: vertical(side) ? box.width : box.height,
        handle: event.currentTarget,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add('previewing-tester-resize');
    },
    onPointerMove: (event) => {
      const previous = drag.current;
      if (!previous) return;
      event.stopPropagation();
      pending.current =
        previous.size +
        (vertical(side) ? event.clientX - previous.x : event.clientY - previous.y) *
          (['left', 'top'].includes(side) ? 1 : -1);
      if (frame.current === null)
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          flush();
        });
    },
    onPointerUp: (event) => finish(event),
    onPointerCancel: (event) => finish(event, true),
    onLostPointerCapture: (event) => finish(event, true),
    onKeyDown: (event) => {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        finish(event, true);
        return;
      }
      const delta = vertical(side)
        ? {
            ArrowLeft: -20,
            ArrowRight: 20,
          }[event.key]
        : {
            ArrowUp: -20,
            ArrowDown: 20,
          }[event.key];
      if (delta !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        const box = event.currentTarget.closest('.tester').getBoundingClientRect();
        update(
          (vertical(side) ? box.width : box.height) +
            delta * (['left', 'top'].includes(side) ? 1 : -1),
        );
        writeStorage(storageKey, current.current);
        window.dispatchEvent(new Event('resize'));
      }
    },
  };
}
