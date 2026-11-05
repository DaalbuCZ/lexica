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
      const width = panel.offsetWidth,
        height = panel.offsetHeight;
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
      const x = Math.max(
        0,
        Math.min(width, box.left + box.width / 2 - parseFloat(panel.style.left)),
      );
      const y = Math.max(
        0,
        Math.min(height, box.top + box.height / 2 - parseFloat(panel.style.top)),
      );
      panel.style.transformOrigin = `${dock === 'left' ? 0 : dock === 'right' ? width : x}px ${dock === 'top' ? 0 : dock === 'bottom' ? height : y}px`;
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
