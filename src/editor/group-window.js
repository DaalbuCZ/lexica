/** A screen-space window with its own graph camera. Overview motion never changes it. */
export function createGroupWindow(context) {
  const panel = context.groupPanel,
    wrap = context.canvasWrap;
  let drag = null;
  function layout() {
    const area = wrap.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const maxWidth = Math.max(120, area.width - 24),
      maxHeight = Math.max(140, area.height - 24);
    const previous = context.groupWindowRect;
    const width = Math.min(
      maxWidth,
      Math.max(260, previous?.width ?? Math.min(900, area.width * 0.8)),
    );
    const height = Math.min(
      maxHeight,
      Math.max(180, previous?.height ?? Math.min(560, area.height * 0.8)),
    );
    const rect = {
      width,
      height,
      x: Math.max(12, Math.min(previous?.x ?? (area.width - width) / 2, area.width - width - 12)),
      y: Math.max(
        12,
        Math.min(previous?.y ?? (area.height - height) / 2, area.height - height - 12),
      ),
    };
    context.groupWindowRect = rect;
    Object.assign(panel.style, {
      left: rect.x + 'px',
      top: rect.y + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }
  function positionGroupPanel(group, bounds) {
    if (!group || !bounds) return;
    layout();
    if (context.groupPanelBoundsId !== group.id) {
      context.groupPanelBoundsId = group.id;
      context.groupPanelViewInitialized = false;
    }
    if (context.groupPanelViewInitialized) return;
    const canvas = context.elements.canvas,
      width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.max((bounds.width + 80) / width, (bounds.height + 80) / height);
    context.graph.setView({
      x: bounds.x + bounds.width / 2 - (width * ratio) / 2,
      y: bounds.y + bounds.height / 2 - (height * ratio) / 2,
      width: width * ratio,
      height: height * ratio,
    });
    context.canvasSize = { width, height };
    context.groupPanelViewInitialized = true;
  }
  function installWindow() {
    const grip = panel.querySelector('[data-group-grip]');
    context.listen(grip, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      grip.setPointerCapture(event.pointerId);
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        rect: { ...context.groupWindowRect },
      };
    });
    context.listen(grip, 'pointermove', (event) => {
      if (drag?.id !== event.pointerId) return;
      context.groupWindowRect = {
        ...drag.rect,
        x: drag.rect.x + event.clientX - drag.x,
        y: drag.rect.y + event.clientY - drag.y,
      };
      layout();
      if (!document.body.classList.contains('properties-hidden')) context.showProperties(true);
    });
    const stop = () => {
      drag = null;
    };
    context.listen(grip, 'pointerup', stop);
    context.listen(grip, 'pointercancel', stop);
    context.listen(grip, 'lostpointercapture', stop);
    context.listen(grip, 'keydown', (event) => {
      const delta = {
        ArrowLeft: [-20, 0],
        ArrowRight: [20, 0],
        ArrowUp: [0, -20],
        ArrowDown: [0, 20],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      context.groupWindowRect = {
        ...context.groupWindowRect,
        x: context.groupWindowRect.x + delta[0],
        y: context.groupWindowRect.y + delta[1],
      };
      layout();
    });
    const resize = panel.querySelector('[data-group-resize]');
    let resizing = null;
    context.listen(resize, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      resize.setPointerCapture(event.pointerId);
      resizing = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        rect: { ...context.groupWindowRect },
      };
    });
    context.listen(resize, 'pointermove', (event) => {
      if (resizing?.id !== event.pointerId) return;
      context.groupWindowRect = {
        ...resizing.rect,
        width: resizing.rect.width + event.clientX - resizing.x,
        height: resizing.rect.height + event.clientY - resizing.y,
      };
      layout();
      context.resizeCanvas();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      context.listen(resize, type, () => {
        resizing = null;
      });
    context.listen(resize, 'keydown', (event) => {
      const delta = {
        ArrowLeft: [-20, 0],
        ArrowRight: [20, 0],
        ArrowUp: [0, -20],
        ArrowDown: [0, 20],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      context.groupWindowRect = {
        ...context.groupWindowRect,
        width: context.groupWindowRect.width + delta[0],
        height: context.groupWindowRect.height + delta[1],
      };
      layout();
      context.resizeCanvas();
    });
  }
  return { positionGroupPanel, installWindow };
}
