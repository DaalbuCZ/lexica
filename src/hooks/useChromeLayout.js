import { useLayoutEffect } from 'react';
import { debuggerZones, dockSides, placeDockedPanel } from '../core/docking.js';

/** Keep the fixed editor controls in the space left by the docked tester. */
export function useChromeLayout() {
  useLayoutEffect(() => {
    const brand = document.querySelector('.brand'),
      toolbar = document.querySelector('.toolbar'),
      tester = document.querySelector('.tester'),
      crumbs = document.querySelector('.group-navigation'),
      map = document.querySelector('.minimap'),
      mapCanvas = document.querySelector('#minimap'),
      preview = document.querySelector('#dock-preview');
    let debuggerPanel;
    let frame,
      collapsed = document.body.classList.contains('tester-collapsed');
    const set = (element, values) => {
      for (const [key, value] of Object.entries(values))
        if (element.style[key] !== value) element.style[key] = value;
    };
    let measureTargets;
    const place = () => {
      frame = null;
      const gap = 16,
        row = 48,
        mapWidth = innerWidth <= 650 ? 112 : 170,
        mapHeight = innerWidth <= 650 ? 70 : 106,
        side = document.body.dataset.testerDock || 'bottom',
        dock = document.body.dataset.toolbarDock || 'top',
        box = tester.getBoundingClientRect(),
        isCollapsed = document.body.classList.contains('tester-collapsed'),
        left = gap + (side === 'left' && !isCollapsed ? box.width : 0),
        right = innerWidth - gap - (side === 'right' && !isCollapsed ? box.width : 0),
        top = gap + (side === 'top' ? box.height : 0),
        bottom = innerHeight - gap - (side === 'bottom' ? box.height : 0);
      set(brand, { position: 'fixed', left: left + 'px', top: top + 'px', height: row + 'px' });
      set(mapCanvas, { width: mapWidth + 'px', height: mapHeight + 'px' });
      let mapBottom = bottom;
      if (side === 'left' && isCollapsed) mapBottom = Math.min(mapBottom, box.top - gap);
      set(map, {
        position: 'fixed',
        width: mapWidth + 2 + 'px',
        left: left + 'px',
        top: 'auto',
        bottom: innerHeight - mapBottom + 'px',
      });
      const logo = brand.getBoundingClientRect();
      const mapTop = mapBottom - map.offsetHeight;
      const positionToolbar = (element, dock) => {
        const vertical = dock === 'left' || dock === 'right';
        let toolbarLeft = dock === 'right' ? right - row : vertical ? left : logo.right + gap,
          toolbarTop = dock === 'left' ? logo.bottom + gap : top;
        const stackedTop = dock === 'top' && right - toolbarLeft < row * 2;
        if (stackedTop) {
          toolbarLeft = left;
          toolbarTop = logo.bottom + gap;
        }
        const cornerBottom =
          isCollapsed && (side === 'left' || side === 'right')
            ? Math.min(bottom, box.top - gap)
            : bottom;
        set(element, {
          position: 'fixed',
          left: toolbarLeft + 'px',
          right: 'auto',
          top: toolbarTop + 'px',
          bottom: 'auto',
          width: vertical ? row + 'px' : 'max-content',
          height: vertical ? 'auto' : row + 'px',
          maxWidth: Math.max(row, right - toolbarLeft) + 'px',
          maxHeight: Math.max(row, cornerBottom - toolbarTop) + 'px',
          flexDirection: vertical ? 'column' : 'row',
          flexWrap: 'nowrap',
          padding: '7px',
          overflowX: 'auto',
          overflowY: vertical ? 'auto' : 'hidden',
        });
        if (dock === 'bottom') {
          const baseline =
              side === 'left' && isCollapsed ? Math.min(bottom, box.top - gap) : bottom,
            toolbarRight = side === 'right' ? Math.min(right, box.left - gap) : right;
          toolbarLeft = left + mapWidth + 2 + gap;
          toolbarTop = baseline - row;
          set(element, {
            left: toolbarLeft + 'px',
            top: toolbarTop + 'px',
            maxWidth: Math.max(row, toolbarRight - toolbarLeft) + 'px',
          });
        }
        element.dataset.orientation = vertical ? 'vertical' : 'horizontal';
        if (dock === 'left')
          set(element, { maxHeight: Math.max(row, mapTop - gap - toolbarTop) + 'px' });
        return { toolbarLeft, toolbarTop, stackedTop, vertical };
      };
      const { toolbarLeft, toolbarTop, stackedTop, vertical } = positionToolbar(toolbar, dock);
      let crumbLeft = vertical ? logo.right + gap : left,
        crumbTop = vertical ? top : stackedTop ? toolbarTop + row + gap : logo.bottom + gap;
      const crumbRight = dock === 'right' ? toolbarLeft - gap : right;
      if (vertical && crumbRight - crumbLeft < 96) {
        crumbLeft = left + (dock === 'left' ? row + gap : 0);
        crumbTop = logo.bottom + gap;
      }
      set(crumbs, {
        position: 'fixed',
        height: row + 'px',
        padding: '7px',
        left: crumbLeft + 'px',
        top: crumbTop + 'px',
        maxWidth: Math.max(48, crumbRight - crumbLeft) + 'px',
      });
      const panel = document.querySelector('.debugger-window');
      if (panel !== debuggerPanel) {
        if (debuggerPanel) resize.unobserve(debuggerPanel);
        if (panel) resize.observe(panel);
        debuggerPanel = panel;
      }
      let debuggerBounds;
      if (panel) {
        const area = { left: left - gap, right: right + gap, top: top - gap, bottom: bottom + gap };
        set(panel, {
          maxWidth: Math.max(1, right - left) + 'px',
          maxHeight: Math.max(1, bottom - top) + 'px',
        });
        const obstacles = [brand, toolbar, crumbs, map, tester]
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        const size = { width: panel.offsetWidth, height: panel.offsetHeight };
        debuggerBounds = (zone) => ({
          ...placeDockedPanel(zone, size, area, obstacles, gap),
          ...size,
        });
        const { x, y } = debuggerBounds(document.body.dataset.debuggerDock || 'top');
        set(panel, { left: x + 'px', top: y + 'px', translate: 'none' });
      }
      measureTargets = (name) => {
        if (name === 'debugger')
          return debuggerBounds
            ? debuggerZones.map((zone) => ({ zone, ...debuggerBounds(zone) }))
            : [];

        // Measure the target orientation without moving the live controls.
        const sample = (name === 'toolbar' ? toolbar : preview).cloneNode(name === 'toolbar');
        sample.removeAttribute('id');
        sample.removeAttribute('style');
        sample.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        sample.inert = true;
        sample.hidden = false;
        sample.style.visibility = 'hidden';
        sample.dataset.panel = name;
        (name === 'toolbar' ? toolbar : preview).after(sample);
        const targets = dockSides.map((zone) => {
          if (name === 'toolbar') positionToolbar(sample, zone);
          else sample.dataset.side = zone;
          const { x, y, width, height } = sample.getBoundingClientRect();
          return { zone, x, y, width, height };
        });
        sample.remove();
        return targets;
      };
    };
    const provideTargets = ({ detail }) => {
      detail.targets = measureTargets(detail.name);
    };
    const schedule = () => {
      if (frame == null) frame = requestAnimationFrame(place);
    };
    const resize = new ResizeObserver(schedule);
    for (const el of [brand, toolbar, tester, crumbs, map]) resize.observe(el);
    const mutation = new MutationObserver((records) => {
      const next = document.body.classList.contains('tester-collapsed');
      if (next !== collapsed || records.some((r) => r.attributeName !== 'class')) {
        collapsed = next;
        schedule();
      }
    });
    mutation.observe(document.body, {
      attributes: true,
      attributeFilter: [
        'class',
        'data-toolbar-dock',
        'data-tester-dock',
        'data-debugger-dock',
        'data-debugging',
      ],
    });
    preview.addEventListener('measure-dock-targets', provideTargets);
    window.addEventListener('resize', schedule);
    place();
    return () => {
      preview.removeEventListener('measure-dock-targets', provideTargets);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
}
