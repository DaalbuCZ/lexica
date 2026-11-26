import { graphBounds } from './canvas-graph.js';
import { editorSettings, graphTransitionLabel } from './editor-settings.js';
import { stateLabel, groupCardHeight, groupLabel, groupWidth } from './labels.js';
import { sizedTransitionRoutes } from './label-clearance.js';
import { labelGuidesFor } from './label-guides.js';
import { commentLayout, commentLinks, commentLinkKey } from './comments.js';
import { transitionError, isAccepting, statePortalBox } from './lexer.js';
import { routeEdges } from './layout.js';
import { visualMachine } from './start-views.js';
import { destination, portalTip } from './portals.js';
import { graphView } from './groups.js';
import { tokenColorClass } from './token-colors.js';
export function machineSvg(
  machine,
  {
    simplified = editorSettings.simplified,
    colorEdges = false,
    tokenPalette = [],
    transitionLabelScale = 1,
  } = {},
  sourceMachine = machine,
) {
  const palette = tokenPalette.map((color) => (/^#[0-9a-f]{6}$/i.test(color) ? color : null));
  const tokenIndex = (state) =>
    isAccepting(state) && !state.skip ? Number(tokenColorClass(state.token).slice(-1)) : null;
  function edgeTokenIndex(edge, index) {
    const indices = edge.originalIndices ?? [edge.originalIndex ?? index];
    const colors = indices.map((i) => {
      try {
        return tokenIndex(destination(sourceMachine, sourceMachine.edges[i]));
      } catch {
        return null;
      }
    });
    return colors.every((color) => color === colors[0]) ? colors[0] : null;
  }
  const selectedStates = new Set(),
    selectedComments = new Set(),
    selectedCommentLinks = new Set(),
    source = null,
    commentSource = null,
    connectPoint = null,
    marquee = null;
  const edgeSelected = () => false;
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const scale = transitionLabelScale,
    labelFor = (edge) => graphTransitionLabel(edge, simplified),
    visual = visualMachine(machine),
    routes = sizedTransitionRoutes(visual, routeEdges(visual, labelFor), scale),
    guides = labelGuidesFor(visual, routes, scale);
  function portalTag(name, box, invalid = false) {
    const l = box.x - box.w / 2,
      r = box.x + box.w / 2,
      t = box.y - box.h / 2,
      b = box.y + box.h / 2;
    const right = box.side === 'right',
      tip = right ? r : l,
      shoulder = right ? r - 7 : l + 7,
      back = right ? l : r;
    return `<g class="portal ${invalid ? 'invalid' : ''}"><path d="M ${tip} ${box.y} L ${shoulder} ${t} H ${back} V ${b} H ${shoulder} Z"/><text x="${box.x}" y="${box.y + 3}" text-anchor="middle">${esc(name || '?')}</text></g>`;
  }
  function commentLabel(c) {
    const { w, h, lines } = commentLayout(c);
    return `<g class="comment-label ${selectedComments.has(c.id) ? 'selected' : commentSource === c.id ? 'connecting' : ''}" data-comment="${esc(c.id)}" transform="translate(${c.x} ${c.y})"><rect width="${w}" height="${h}" rx="5"/><text x="12" y="22">${lines.map((line, i) => `<tspan x="12" dy="${i ? 17 : 0}">${esc(line) || ' '}</tspan>`).join('')}</text></g>`;
  }
  function svgMarkup() {
    let html = commentLinks(machine)
        .map((link) => {
          const key = commentLinkKey(link.commentId, link.nodeId),
            d = `M ${link.from.x} ${link.from.y} L ${link.to.x} ${link.to.y}`;
          return `<g data-comment-link="${esc(key)}" class="${selectedCommentLinks.has(key) ? 'selected' : ''}"><path class="comment-link" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" d="${d}"/><path class="comment-link-hit" fill="none" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" d="${d}"/></g>`;
        })
        .join(''),
      edgeLabels = '';
    for (let i = 0; i < machine.edges.length; i++) {
      const e = machine.edges[i],
        r = routes[i];
      const issue = e.groupEdge ? '' : transitionError(machine, e),
        invalid = !!issue;
      const token = colorEdges && !invalid ? edgeTokenIndex(e, i) : null;
      const color = palette[token];
      const borderStyle = color ? ` style="stroke:${color}"` : '';
      const labelStyle = color ? ` style="fill:${color}"` : '';
      const edgeStyle = color ? ` style="stroke:${color};marker-end:url(#arrow-${token})"` : '';
      const guide = guides[i];
      if (guide) {
        const points = guide.points.map(({ x, y }) => `${x},${y}`).join(' ');
        html += `<polyline class="edge-label-guide"${borderStyle} points="${points}"/>`;
      }
      html += `<g data-edge="${i}" class="${invalid ? 'transition-error' : ''}"><title>${esc(issue)}</title><path class="edge ${edgeSelected(e, i) ? 'selected-edge' : ''}"${edgeStyle} d="${r.d}"/><path class="edge-hit" d="${r.d}"/></g>`;
      edgeLabels += `<g data-edge="${i}" class="${invalid ? 'transition-error' : ''}"><title>${esc(issue)}</title>${machine.labelBoxes && e.label ? `<rect class="edge-label-box"${borderStyle} x="${r.label.x - r.label.w / 2}" y="${r.label.y - 4 - 11 * scale}" width="${r.label.w}" height="${22 * scale}" rx="${3 * scale}"/>` : ''}<text class="edge-text ${machine.labelBoxes ? 'boxed' : ''}"${labelStyle} x="${r.label.x}" y="${r.label.y - 4 + 4 * scale}" text-anchor="middle">${esc(labelFor(e) || '⚠ empty')}</text>${r.portalBox ? portalTag(e.portal, r.portalBox, invalid) : ''}</g>`;
    }
    for (const s of visual.states) {
      const color = palette[tokenIndex(s)];
      const label = s.group ? groupLabel(s) : stateLabel(s.name);
      if (s.id === machine.start || s.startView !== undefined) {
        const tipX = s.x - (s.group ? groupWidth(s) / 2 + 4 : 40);
        html += `<path class="edge" d="M ${tipX - 45} ${s.y} L ${tipX} ${s.y}"/>`;
      }
      html += `<g class="node ${s.outside ? 'outside' : ''} ${selectedStates.has(s.id) ? 'selected' : ''} ${source === s.id ? 'connecting' : ''}" ${color ? `style="--token-accent:${color};--token-fill:${color}33"` : ''} data-node="${esc(s.id)}" transform="translate(${s.x} ${s.y})">${s.group ? `<rect x="${-groupWidth(s) / 2}" y="${-groupCardHeight / 2}" width="${groupWidth(s)}" height="${groupCardHeight}" rx="12"/>` : '<circle r="36"/>'}${
        s.portal
          ? (() => {
              const box = statePortalBox(s),
                tip = portalTip(box),
                dx = tip.x - s.x,
                dy = tip.y - s.y,
                len = Math.hypot(dx, dy) || 1;
              return `<path class="portal-wire" d="M ${dx} ${dy} L ${(dx / len) * 36} ${(dy / len) * 36}"/>${portalTag(
                s.portal,
                {
                  ...box,
                  x: box.x - s.x,
                  y: box.y - s.y,
                },
                machine.states.filter((x) => x.portal === s.portal).length > 1,
              )}`;
            })()
          : ''
      }${isAccepting(s) ? '<circle class="inner" r="31"/>' : ''}<text class="state-name" style="font-size:${label.fontSize}px">${label.lines.map((line, i) => `<tspan x="0" y="${label.y + i * label.lineHeight}" ${!s.group && line.length > (label.lines.length > 1 ? 8 : 10) ? `textLength="${label.width}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(line)}</tspan>`).join('')}</text>${isAccepting(s) ? `<text class="token-label" style="font-size:${9 * scale}px" y="${46 + 11 * scale}">${esc(s.token)}${s.skip ? ' · skip' : ''}</text>` : ''}</g>`;
    }
    if (commentSource && connectPoint) {
      const c = machine.comments?.find((c) => c.id === commentSource);
      if (c) {
        const size = commentLayout(c);
        html += `<path class="comment-link comment-preview" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" d="M ${c.x + size.w / 2} ${c.y + size.h / 2} L ${connectPoint.x} ${connectPoint.y}"/>`;
      }
    }
    html += edgeLabels;
    html += (machine.comments ?? []).map(commentLabel).join('');
    if (marquee) {
      const x = Math.min(marquee.start.x, marquee.end.x),
        y = Math.min(marquee.start.y, marquee.end.y);
      html += `<rect class="selection-box" x="${x}" y="${y}" width="${Math.abs(marquee.end.x - marquee.start.x)}" height="${Math.abs(marquee.end.y - marquee.start.y)}"/>`;
    }
    return html;
  }
  function exportSvg() {
    const marker = (id, color) =>
      `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
    const tokenMarkers = colorEdges
      ? palette.map((color, index) => (color ? marker(`arrow-${index}`, color) : '')).join('')
      : '';
    const content = `<defs>${marker('arrow', '#000')}${tokenMarkers}</defs><g>${svgMarkup()}</g>`;
    const box = graphBounds(machine, routes, scale);
    const style =
      '.edge{fill:none;stroke:#000;stroke-width:1.6;marker-end:url(#arrow)}.edge-label-guide{fill:none;stroke:#000;stroke-width:1}.edge-hit,.comment-link-hit{display:none}.edge-label-box{fill:white;stroke:#000;stroke-width:1}.edge-text.boxed{stroke:none}.edge-text{font:11px monospace;fill:#000;paint-order:stroke;stroke:white;stroke-width:6px}.node circle{fill:var(--token-fill,#fff);stroke:var(--token-accent,#000);stroke-width:1.7}.node .inner{fill:none}.node text{text-anchor:middle;font:12px sans-serif;fill:var(--token-accent,#000)}.node .token-label{font:9px monospace}.portal path{fill:#fff;stroke:#000;stroke-width:1.2}.portal text{font:10px monospace;fill:#000}.portal-wire{stroke:#000;fill:none}.invalid path{stroke:#b54f3c}.invalid text{fill:#b54f3c}.comment-label rect{fill:#fff9da;stroke:#cbb879;stroke-width:1}.comment-label text{font:11px sans-serif;fill:#756536}.selection-box,.comment-preview{display:none}.comment-link{fill:none;stroke:#8b907e;stroke-width:1.4;stroke-dasharray:6 5}';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(box.width + 60)}" height="${Math.ceil(box.height + 60)}" viewBox="${box.x - 30} ${box.y - 30} ${box.width + 60} ${box.height + 60}"><style>${style}.edge-text{font-size:${11 * scale}px;stroke-width:${6 * scale}px}.node rect{fill:var(--token-fill,#fff);stroke:var(--token-accent,#000);stroke-width:1.7}.outside circle{stroke-dasharray:6 4}</style>${content}</svg>`;
  }
  return exportSvg();
}
export function svgDocuments(machine, options) {
  const views = [
    { id: 'main', name: 'Main graph', filename: 'main.svg', view: graphView(machine) },
    ...(machine.groups ?? []).map((group, index) => ({
      id: group.id,
      name: group.name,
      filename: `${index + 1}-${
        group.name
          .replace(/[^\p{L}\p{N}_-]+/gu, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || 'group'
      }.svg`,
      view: graphView(machine, group.id),
    })),
  ];
  return views.map(({ view, ...file }) => ({
    ...file,
    text: machineSvg({ ...machine, ...view, startViews: view.startViews }, options, machine),
  }));
}
