import { useLayoutEffect } from 'react';

/** Position a tool window by its toolbar button, including when the toolbar is docked. */
export function useAnchoredPanel(panel, anchorId) {
  useLayoutEffect(() => {
    if (!anchorId) return;
    const anchor = document.getElementById(anchorId);
    if (!panel || !anchor) return;
    const place = () => {
      const box = anchor.getBoundingClientRect(),
        toolbar = anchor.closest('.toolbar')?.getBoundingClientRect() ?? box,
        dock = document.body.dataset.toolbarDock;
      panel.style.maxHeight = Math.max(160, innerHeight - 24) + 'px';
      const { width, height } = panel.getBoundingClientRect();
      let left = box.left,
        top = toolbar.bottom + 14;
      if (dock === 'left') {
        left = toolbar.right + 14;
        top = box.top;
      }
      if (dock === 'right') {
        left = toolbar.left - width - 14;
        top = box.top;
      }
      if (dock === 'bottom') top = toolbar.top - height - 14;
      panel.style.left = Math.max(12, Math.min(left, innerWidth - width - 12)) + 'px';
      panel.style.top = Math.max(12, Math.min(top, innerHeight - height - 12)) + 'px';
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    observer.observe(anchor);
    const dockObserver = new MutationObserver(place);
    dockObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-toolbar-dock', 'data-debugging'],
    });
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      dockObserver.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [panel, anchorId]);
}
