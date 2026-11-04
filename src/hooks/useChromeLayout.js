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
      };
      positionToolbar(toolbar, dock);
      const toolbarBox = toolbar.getBoundingClientRect();
      const crumbDock = document.body.dataset.breadcrumbsDock || 'top';
      const positionCrumbs = (element, edge) => {
        const shared = edge === dock;
        let x = left;
        let y = top;
        let end = right;
        if (edge === 'top') {
          x = shared ? left : logo.right + gap;
          if (shared) y = Math.max(logo.bottom, toolbarBox.bottom) + gap;
          if (dock === 'right') end = toolbarBox.left - gap;
        } else if (edge === 'bottom') {
          x = map.getBoundingClientRect().right + gap;
          y = (shared ? toolbarBox.top - gap : mapBottom) - row;
        } else if (edge === 'left') {
          x = shared ? toolbarBox.right + gap : left;
          y = logo.bottom + gap;
          end = Math.min(right, x + 160);
        } else {
          end = shared ? toolbarBox.left - gap : right;
          x = Math.max(left, end - 160);
          if (dock === 'top' && toolbarBox.right > x) y = toolbarBox.bottom + gap;
        }
        x = Math.max(left, Math.min(x, end - row));
        y = Math.max(top, Math.min(y, bottom - row));
        set(element, {
          position: 'fixed',
          inset: y + 'px auto auto ' + x + 'px',
          width: 'max-content',
          height: row + 'px',
          maxWidth: Math.max(row, end - x) + 'px',
          padding: '7px',
        });
        if (edge === 'right') set(element, { left: 'auto', right: innerWidth - end + 'px' });
      };
      positionCrumbs(crumbs, crumbDock);
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
        const crumbBox = crumbs.getBoundingClientRect();
        debuggerBounds = (zone) => {
          const bounds = { ...area };
          if (
            crumbBox.width &&
            crumbBox.height &&
            dock === crumbDock &&
            zone.split('-')[0] === dock
          ) {
            if (crumbDock === 'top') bounds.top = crumbBox.bottom;
            if (crumbDock === 'bottom') bounds.bottom = crumbBox.top;
            if (crumbDock === 'left') bounds.left = crumbBox.right;
            if (crumbDock === 'right') bounds.right = crumbBox.left;
          }
          const fits =
            bounds.right - bounds.left >= size.width + 2 * gap &&
            bounds.bottom - bounds.top >= size.height + 2 * gap;
          return { ...placeDockedPanel(zone, size, fits ? bounds : area, obstacles, gap), ...size };
        };
        const { x, y } = debuggerBounds(document.body.dataset.debuggerDock || 'top');
        set(panel, { left: x + 'px', top: y + 'px', translate: 'none' });
      }
      measureTargets = (name) => {
        if (name === 'debugger')
          return debuggerBounds
            ? debuggerZones.map((zone) => ({ zone, ...debuggerBounds(zone) }))
            : [];

        // Measure the target orientation without moving the live controls.
        const source = name === 'toolbar' ? toolbar : name === 'breadcrumbs' ? crumbs : preview;
        const sample = source.cloneNode(source !== preview);
        sample.removeAttribute('id');
        sample.removeAttribute('style');
        sample.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        sample.inert = true;
        sample.hidden = false;
        sample.style.visibility = 'hidden';
        sample.dataset.panel = name;
        source.after(sample);
        const targets = dockSides.map((zone) => {
          if (name === 'toolbar') positionToolbar(sample, zone);
          else if (name === 'breadcrumbs') positionCrumbs(sample, zone);
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
        'data-breadcrumbs-dock',
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
