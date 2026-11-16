import { useEffect, useId, useRef, useState } from 'react';

const phases = [
  [
    'input',
    'The whole machine',
    'Three cyclic branches meet at S. There is a dangling state L, a repeated A0 → A1 transition, a return arrow, a loop at B1, and a disconnected X–Y–Z cycle.',
  ],
  [
    'partition',
    'Split independent problems',
    'The start component and X–Y–Z island become separate inputs. Their positions have not changed. The two lanes below follow independent subproblems; the implementation solves them sequentially.',
  ],
  [
    'placement',
    'Place each component',
    'Each lane now shows the solver’s actual placement result. Candidate selection and any accepted grouping happen within each component.',
  ],
  [
    'refinement',
    'Refine the placement',
    'Refinement checks branch lengths, angles, and available gaps where applicable. A lane stays unchanged when no eligible improvement is accepted.',
  ],
  [
    'routing',
    'Check the transitions',
    'The actual routed transitions are visible. Radial verifies corridors and applies its route-checked aesthetic passes here. Tree defers its final alignment to the next stage.',
  ],
  [
    'alignment',
    'Finish local geometry',
    'Tree and subgroup views receive their final polish and horizontal alignment where applicable. All positions and routes come from the selected solver path.',
  ],
  [
    'packing',
    'Join the results',
    'The independently solved components are packed together using routed bounds. The island changes position by translation, preserving its own layout.',
  ],
];

function tweenPath(from, to, t) {
  const number = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  const a = from.match(number)?.map(Number);
  const b = to.match(number)?.map(Number);
  if (!a || !b || a.length !== b.length) return to;
  let i = 0;
  return to.replace(number, () => {
    const value = a[i] + (b[i] - a[i]) * t;
    i++;
    return value;
  });
}

function useAnimatedGraph(graph) {
  const [drawing, setDrawing] = useState(graph);
  const current = useRef(graph);
  useEffect(() => {
    const before = current.current;
    const nodes = new Map(before.states.map((s) => [s.id, s]));
    const start = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame;
    const tick = (now) => {
      const progress = reduced ? 1 : Math.min(1, (now - start) / 1000);
      const t = progress * progress * (3 - 2 * progress);
      const next = {
        ...graph,
        states: graph.states.map((s) => {
          const old = nodes.get(s.id) ?? s;
          return {
            ...s,
            x: old.x + (s.x - old.x) * t,
            y: old.y + (s.y - old.y) * t,
            radius: old.radius + (s.radius - old.radius) * t,
          };
        }),
        routes: graph.routes.map((d, i) => tweenPath(before.routes[i] ?? d, d, t)),
      };
      current.current = next;
      setDrawing(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [graph]);
  return drawing;
}

function Graph({ graph: target, bounds, name }) {
  const graph = useAnimatedGraph(target);
  const id = useId();
  const [zoom, setZoom] = useState(1);
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
  }, [zoom]);
  const nodes = new Map(graph.states.map((s) => [s.id, s]));
  return (
    <div className="finale-graph" aria-label={name}>
      <div className="finale-graph-tools">
        <span>{name}</span>
        <div>
          <button
            type="button"
            aria-label={`Zoom out ${name}`}
            disabled={zoom === 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
          >
            −
          </button>
          <button
            type="button"
            aria-label={`Zoom in ${name}`}
            disabled={zoom === 3}
            onClick={() => setZoom(Math.min(3, zoom + 0.5))}
          >
            +
          </button>
        </div>
      </div>
      <div className="finale-canvas" ref={canvas}>
        <svg
          viewBox={bounds}
          role="img"
          aria-label={name}
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          <defs>
            <marker
              id={id}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 8 4 0 8Z" fill="currentColor" />
            </marker>
          </defs>
          {graph.split && (
            <g className="finale-lanes" aria-hidden="true">
              <rect x="10" y="10" width="790" height="580" rx="16" />
              <rect x="845" y="10" width="245" height="580" rx="16" />
            </g>
          )}
          {graph.edges.map((e, i) => {
            const a = nodes.get(e.from),
              b = nodes.get(e.to);
            if (!a || !b) return null;
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const d =
              graph.routes?.[i] ??
              `M ${a.x + 37 * Math.cos(angle)} ${a.y + 37 * Math.sin(angle)} L ${b.x - 37 * Math.cos(angle)} ${b.y - 37 * Math.sin(angle)}`;
            return <path key={i} className="wire" d={d} markerEnd={`url(#${id})`} />;
          })}
          {graph.states.map((s) => (
            <g
              key={s.id}
              transform={`translate(${s.x} ${s.y})`}
              className={['X', 'Y', 'Z'].includes(s.id) ? 'green' : 'amber'}
            >
              <circle className="node" r={s.radius} />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: Math.max(12, s.radius * 0.9) }}
              >
                {s.id}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function present(frames, phase) {
  const selected = frames.filter((f) => f.phase === phase);
  const split = selected.length > 1;
  const states = [],
    transitions = [];
  for (const frame of selected) {
    const [left, top, width, height] = boundsFor(frames, frame.key, frame.graph)
      .split(' ')
      .map(Number);
    const lane =
      frame.key === 'island' ? { x: 835, width: 265 } : { x: 0, width: split ? 810 : 1100 };
    const scale = Math.min((lane.width - 30) / width, 540 / height);
    const ox = lane.x + lane.width / 2 - (left + width / 2) * scale;
    const oy = 300 - (top + height / 2) * scale;
    const nodes = new Map(frame.graph.states.map((s) => [s.id, s]));
    states.push(
      ...frame.graph.states.map((s) => ({
        ...s,
        x: s.x * scale + ox,
        y: s.y * scale + oy,
        radius: 37 * scale,
      })),
    );
    const occurrences = new Map();
    frame.graph.edges.forEach((e, i) => {
      const key = JSON.stringify([e.from, e.to]);
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      const a = nodes.get(e.from),
        b = nodes.get(e.to);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const p = { x: a.x + 37 * Math.cos(angle), y: a.y + 37 * Math.sin(angle) };
      const q = { x: b.x - 37 * Math.cos(angle), y: b.y - 37 * Math.sin(angle) };
      const raw =
        frame.graph.routes?.[i] ??
        `M ${p.x} ${p.y} C ${(2 * p.x + q.x) / 3} ${(2 * p.y + q.y) / 3} ${(p.x + 2 * q.x) / 3} ${(p.y + 2 * q.y) / 3} ${q.x} ${q.y}`;
      let coordinate = 0;
      const d = raw.replace(
        /-?\d*\.?\d+(?:e[-+]?\d+)?/gi,
        (value) => Number(value) * scale + (coordinate++ % 2 ? oy : ox),
      );
      transitions.push({ ...e, key: key + ':' + occurrence, d });
    });
  }
  transitions.sort((a, b) => a.key.localeCompare(b.key));
  return { states, edges: transitions, routes: transitions.map((e) => e.d), split };
}

function boundsFor(frames, key, graph) {
  const extent = (states) => {
    const left = Math.min(...states.map((s) => s.x));
    const right = Math.max(...states.map((s) => s.x));
    const top = Math.min(...states.map((s) => s.y));
    const bottom = Math.max(...states.map((s) => s.y));
    return {
      width: right - left,
      height: bottom - top,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    };
  };
  const sizes = frames.filter((f) => f.key === key).map((f) => extent(f.graph.states));
  const width = Math.max(...sizes.map((s) => s.width)) + 250;
  const height = Math.max(...sizes.map((s) => s.height)) + 250;
  const center = extent(graph.states);
  return `${center.x - width / 2} ${center.y - height / 2} ${width} ${height}`;
}

export function Finale({ shape, grouped }) {
  const [result, setResult] = useState(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const worker = new Worker(new URL('./finale-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) =>
      setResult(
        data.error
          ? data
          : {
              ...data,
              presentations: phases.map(([phase]) => present(data.frames, phase)),
            },
      );
    worker.onerror = () => setResult({ error: 'The demonstration could not be calculated.' });
    worker.postMessage({
      mode: shape === 'radial' ? 'circle' : 'tree',
      smartGroups: grouped,
      spacing: 0.5,
    });
    return () => worker.terminate();
  }, [shape, grouped]);
  const [phase] = phases[active];
  return (
    <section className="finale">
      <header>
        <small>The complete run</small>
        <h2>Putting it all together</h2>
        <p>
          One 17-state machine, through the path you selected. Each stage below captures the running
          layout solver.
        </p>
      </header>
      {result?.error ? (
        <p role="alert">{result.error}</p>
      ) : !result ? (
        <p role="status">Calculating the example…</p>
      ) : (
        <>
          <ol className="finale-timeline" aria-label="Complete layout stages">
            {phases.map(([key, label], i) => (
              <li
                key={key}
                aria-current={active === i ? 'step' : undefined}
                data-complete={i < active}
              >
                <button
                  type="button"
                  aria-label={`${i + 1}. ${label}`}
                  title={label}
                  onClick={() => setActive(i)}
                >
                  {i + 1}
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="finale-captions" aria-live="polite">
            {phases.map(([, label, text], i) => (
              <div key={label} aria-hidden={i !== active}>
                <h3>{label}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <div className="finale-stage">
            <Graph
              graph={result.presentations[active]}
              bounds="0 0 1100 600"
              name={
                phase === 'input' || phase === 'packing'
                  ? 'Complete graph'
                  : 'Start component · Independent island'
              }
            />
          </div>
          {grouped && (
            <p className="finale-observation">
              {result.groups
                ? `${result.groups} automatic groups were accepted.`
                : 'The grouping checks retained this machine without automatic groups.'}
            </p>
          )}
          <div className="diagram-controls">
            <button
              type="button"
              disabled={!active}
              onClick={() => {
                setActive(active - 1);
              }}
            >
              ← Previous
            </button>
            <span>
              {active + 1} / {phases.length}
            </span>
            <button
              type="button"
              disabled={active === phases.length - 1}
              onClick={() => {
                setActive(active + 1);
              }}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </section>
  );
}
