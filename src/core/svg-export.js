import { graphBounds } from './canvas-graph.js';
import { editorSettings, simpleTransitionLabel } from './editor-settings.js';
import { stateLabel, transitionLabel } from './labels.js';
import { commentLayout, commentLinks, commentLinkKey } from './comments.js';
import { transitionError, isAccepting, statePortalBox } from './lexer.js';
import { routeEdges } from './layout.js';
import { visualMachine } from './start-views.js';
import { portalTip } from './portals.js';
import { graphView } from './groups.js';
export function machineSvg(machine, { simplified = editorSettings.simplified } = {}) {
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
  const labelFor = (edge) =>
    edge.originalIndices?.length > 1
      ? `${edge.originalIndices.length} transitions`
      : simplified
        ? simpleTransitionLabel(edge)
        : transitionLabel(edge);
  const routes = routeEdges(machine, labelFor);
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
      html += `<g data-edge="${i}" class="${invalid ? 'transition-error' : ''}"><title>${esc(issue)}</title><path class="edge ${edgeSelected(e, i) ? 'selected-edge' : ''}" d="${r.d}"/><path class="edge-hit" d="${r.d}"/></g>`;
      edgeLabels += `<g data-edge="${i}" class="${invalid ? 'transition-error' : ''}"><title>${esc(issue)}</title>${machine.labelBoxes && e.label ? `<rect class="edge-label-box" x="${r.label.x - r.label.w / 2}" y="${r.label.y - 15}" width="${r.label.w}" height="22" rx="3"/>` : ''}<text class="edge-text ${machine.labelBoxes ? 'boxed' : ''}" x="${r.label.x}" y="${r.label.y}" text-anchor="middle">${esc(labelFor(e) || '⚠ empty')}</text>${r.portalBox ? portalTag(e.portal, r.portalBox, invalid) : ''}</g>`;
    }
    for (const s of visualMachine(machine).states) {
      const label = stateLabel(s.name);
      if (s.id === machine.start || s.startView !== undefined)
        html += `<path class="edge" d="M ${s.x - 85} ${s.y} L ${s.x - 40} ${s.y}"/>`;
      html += `<g class="node ${s.outside ? 'outside' : ''} ${selectedStates.has(s.id) ? 'selected' : ''} ${source === s.id ? 'connecting' : ''}" data-node="${esc(s.id)}" transform="translate(${s.x} ${s.y})">${s.group ? '<rect x="-48" y="-36" width="96" height="72" rx="12"/>' : '<circle r="36"/>'}${
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
      }${isAccepting(s) ? '<circle class="inner" r="31"/>' : ''}<text class="state-name" style="font-size:${label.fontSize}px">${label.lines.map((line, i) => `<tspan x="0" y="${label.y + i * label.lineHeight}" ${line.length > (label.lines.length > 1 ? 8 : 10) ? `textLength="${label.width}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(line)}</tspan>`).join('')}</text>${isAccepting(s) ? `<text class="token-label" y="57">${esc(s.token)}${s.skip ? ' · skip' : ''}</text>` : ''}</g>`;
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
    const content =
      '<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64756c"/></marker></defs><g>' +
      svgMarkup() +
      '</g>';
    const box = graphBounds(machine, routes);
    const style =
      '.edge{fill:none;stroke:#65755d;stroke-width:1.6;marker-end:url(#arrow)}.edge-hit,.comment-link-hit{display:none}.edge-label-box{fill:white;stroke:#798b79;stroke-width:1}.edge-text.boxed{stroke:none}.edge-text{font:11px monospace;fill:#53634b;paint-order:stroke;stroke:white;stroke-width:6px}.node circle{fill:#f9fbf5;stroke:#718664;stroke-width:1.7}.node .inner{fill:none}.node text{text-anchor:middle;font:12px sans-serif;fill:#425838}.node .token-label{font:9px monospace}.portal path{fill:#edf5e9;stroke:#386b4e;stroke-width:1.2}.portal text{font:10px monospace;fill:#386b4e}.portal-wire{stroke:#386b4e;fill:none}.invalid path{stroke:#b54f3c}.invalid text{fill:#b54f3c}.comment-label rect{fill:#fff9da;stroke:#cbb879;stroke-width:1}.comment-label text{font:11px sans-serif;fill:#756536}.selection-box,.comment-preview{display:none}.comment-link{fill:none;stroke:#8b907e;stroke-width:1.4;stroke-dasharray:6 5}';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(box.width + 60)}" height="${Math.ceil(box.height + 60)}" viewBox="${box.x - 30} ${box.y - 30} ${box.width + 60} ${box.height + 60}"><style>${style}.node rect{fill:#f9fbf5;stroke:#718664;stroke-width:1.7}.outside circle{stroke-dasharray:6 4}</style>${content}</svg>`;
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
    text: machineSvg({ ...machine, ...view, startViews: view.startViews }, options),
  }));
}
