import { canvasTransform } from './canvas-graph.js';
export function wheelZoomFactor(delta, sensitivity = 1) {
  return Math.exp(Math.max(-0.35, Math.min(0.35, delta * 0.006 * sensitivity)));
}
export function pinchView(view, anchor, center, size, factor) {
  const width = Math.max(160, Math.min(30000, view.width * factor)),
    height = (view.height * width) / view.width,
    t = canvasTransform(
      {
        x: 0,
        y: 0,
        width,
        height,
      },
      size.width,
      size.height,
    );
  return {
    x: anchor.x - (center.x - t.x) / t.scale,
    y: anchor.y - (center.y - t.y) / t.scale,
    width,
    height,
  };
}
export function setupCanvasGestures(
  canvas,
  { getView, setView, toWorld, onInterrupt, sensitivity = () => 1, viewport = canvas, signal },
) {
  const pointers = new Map();
  let gesture = null,
    pinching = false,
    frame = null;
  const request =
    globalThis.requestAnimationFrame?.bind(globalThis) ??
    ((fn) => {
      fn();
      return null;
    });
  const cancel = globalThis.cancelAnimationFrame?.bind(globalThis) ?? (() => {});
  const sample = (ids) => {
    const points = ids.map((id) => pointers.get(id));
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      distance:
        points.length === 2
          ? Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y))
          : 1,
    };
  };
  const flush = () => {
    frame = null;
    if (!gesture) return;
    const point = sample(gesture.ids);
    setView(
      pinchView(
        gesture.view,
        gesture.anchor,
        { x: point.x - gesture.rect.left, y: point.y - gesture.rect.top },
        gesture.size,
        (gesture.distance / point.distance) ** sensitivity(),
      ),
    );
  };
  const finishFrame = () => {
    if (frame !== null) {
      cancel(frame);
      flush();
    }
  };
  const rebase = () => {
    const ids = [...pointers.keys()].slice(0, 2);
    if (!ids.length) {
      gesture = null;
      return;
    }
    const point = sample(ids),
      surface = typeof viewport === 'function' ? viewport() : viewport;
    gesture = {
      ids,
      view: getView(),
      anchor: toWorld({ clientX: point.x, clientY: point.y }),
      rect: surface.getBoundingClientRect(),
      size: { width: surface.clientWidth, height: surface.clientHeight },
      distance: point.distance,
    };
  };
  const consume = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') return;
      finishFrame();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size < 2 && !pinching) return;
      consume(event);
      if (!pinching) {
        onInterrupt();
        pinching = true;
      }
      if (!gesture || gesture.ids.length < 2) rebase();
      for (const id of pointers.keys())
        try {
          canvas.setPointerCapture(id);
        } catch {
          /* A cancelled touch may already be gone. */
        }
    },
    { capture: true, signal },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinching) return;
      consume(event);
      if (gesture?.ids.includes(event.pointerId) && frame === null) frame = request(flush);
    },
    { capture: true, signal },
  );
  const end = (event) => {
    if (!pointers.has(event.pointerId)) return;
    if (!pinching) {
      pointers.delete(event.pointerId);
      return;
    }
    consume(event);
    finishFrame();
    const changedPair = gesture?.ids.includes(event.pointerId);
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      pinching = false;
      gesture = null;
    } else if (changedPair) rebase();
  };
  canvas.addEventListener('pointerup', end, { capture: true, signal });
  canvas.addEventListener('pointercancel', end, { capture: true, signal });
  canvas.addEventListener('lostpointercapture', end, { capture: true, signal });
  // A canvas can be reparented into a subgroup between touch down and up.
  // Observe termination at the window too, rather than retaining a phantom finger.
  const host = canvas.ownerDocument?.defaultView ?? globalThis.window;
  host?.addEventListener('pointerup', end, { capture: true, signal });
  host?.addEventListener('pointercancel', end, { capture: true, signal });
  const cleanup = () => {
    cancel(frame);
    frame = null;
    const captured = [...pointers.keys()];
    pointers.clear();
    gesture = null;
    pinching = false;
    for (const id of captured) if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  host?.addEventListener('blur', cleanup, { signal });
  signal?.addEventListener('abort', cleanup, { once: true });
  return cleanup;
}
