import { useEffect, useId, useRef, useState } from 'react';

const mix = (a, b, t) => a + (b - a) * t;
const tones = ['neutral', 'amber', 'green'];

function RadialGuides({ step }) {
  if (step.guides === 'depth')
    return (
      <g className="guides">
        {[140, 271, 446].map((x, i) => (
          <g key={x}>
            <line x1={x} x2={x} y1="30" y2="310" />
            <text x={x} y="340">
              {i === 0 ? 'Start' : `${i} ${i === 1 ? 'step' : 'steps'}`}
            </text>
          </g>
        ))}
      </g>
    );
  return (
    <g className="guides">
      {step.guides === 'sectors' && (
        <g className="wedges">
          <path className="amber" d="M300 182 V40 A142 142 0 1 1 158 182 Z" />
          <path className="green" d="M300 182 H158 A142 142 0 0 1 300 40 Z" />
          <line x1="300" x2="300" y1="40" y2="182" />
          <line x1="158" x2="300" y1="182" y2="182" />
        </g>
      )}
      {step.radii.map((r) => (
        <circle key={r} cx="300" cy="182" r={r} />
      ))}
      {step.guides === 'sectors' ? (
        <>
          <text className="green" x="158" y="48">
            90°
          </text>
          <text className="amber" x="445" y="328">
            270°
          </text>
        </>
      ) : (
        <text x="300" y="349">
          Inner ring · 1 step / Outer ring · 2 steps
        </text>
      )}
    </g>
  );
}

function edgeGeometry(a, b, bend, loop, group) {
  const [x, y] = a;
  if (loop)
    return {
      path: `M ${x - 12} ${y - 15} c -49 -51 -74 22 -9 24`,
      label: [x - 48, y - 27],
    };
  const dx = b[0] - x;
  const dy = b[1] - y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const cx = x + dx / 2 - uy * bend;
  const cy = y + dy / 2 + ux * bend;
  const port = ([px, py], isGroup) => {
    const vx = cx - px;
    const vy = cy - py;
    const distance = Math.hypot(vx, vy) || 1;
    const inset = isGroup
      ? Math.min(43 / Math.abs(vx / distance), 23 / Math.abs(vy / distance))
      : 22;
    const t = Math.min(1, inset / distance);
    return `${px + vx * t} ${py + vy * t}`;
  };
  return {
    path: `M ${port(a, false)} Q ${cx} ${cy} ${port(b, group)}`,
    label: [x + dx / 2 - (uy * bend) / 2, y + dy / 2 + (ux * bend) / 2 - 11],
  };
}

function frame(example, index) {
  const step = example.steps[index];
  const bundles = new Map();
  example.edges.forEach(([from, to], i) => {
    if (from === to) return;
    const key = [from, to].sort((a, b) => a - b).join(',');
    if (!bundles.has(key)) bundles.set(key, []);
    bundles.get(key).push(i);
  });
  const bends = example.edges.map(() => 0);
  if (!step.bare)
    for (const members of bundles.values()) {
      members.forEach((index, lane) => {
        const [from, to] = example.edges[index];
        bends[index] = (lane - (members.length - 1) / 2) * 34 * (from < to ? 1 : -1);
      });
    }
  return {
    points: step.points,
    nodes: example.nodes.map((_, i) => Number(!step.hidden?.includes(i))),
    edges: example.edges.map(([from, to, , , extra], i) =>
      Number(
        !step.hideEdges?.includes(i) &&
          !step.hidden?.includes(from) &&
          !step.hidden?.includes(to) &&
          !(step.bare && extra),
      ),
    ),
    bends,
  };
}

function viewport(example) {
  if (example.viewBox) return example.viewBox;
  const points = example.steps.flatMap((step) =>
    step.points.filter((_, i) => !step.hidden?.includes(i)),
  );
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = Math.max(400, right - left + 120);
  const height = Math.max(248, bottom - top + 120);
  return `${(left + right - width) / 2} ${(top + bottom - height) / 2} ${width} ${height}`;
}

export function Diagram({ title, example }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const [drawing, setDrawing] = useState(() => frame(example, 0));
  const animation = useRef(0);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);
  const step = example.steps[active];

  function select(index) {
    if (index === active) return;
    cancelAnimationFrame(animation.current);
    setActive(index);
    const target = frame(example, index);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDrawing(target);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / 520);
      const t = 1 - (1 - progress) ** 3;
      const blend = (key) => target[key].map((value, i) => mix(drawing[key][i], value, t));
      setDrawing({
        points: target.points.map(([x, y], i) => [
          mix(drawing.points[i][0], x, t),
          mix(drawing.points[i][1], y, t),
        ]),
        nodes: blend('nodes'),
        edges: blend('edges'),
        bends: blend('bends'),
      });
      if (progress < 1) animation.current = requestAnimationFrame(tick);
    }
    animation.current = requestAnimationFrame(tick);
  }

  return (
    <figure className="diagram" aria-label={title}>
      <figcaption aria-live="polite">
        <div className="step-captions">
          {example.steps.map((entry, i) => (
            <div key={i} className="step-caption" aria-hidden={i !== active}>
              <h4>{entry.label}</h4>
              <p>{entry.note}</p>
            </div>
          ))}
        </div>
      </figcaption>
      <svg viewBox={viewport(example)} aria-hidden="true">
        <defs>
          {tones.map((tone) => (
            <marker
              key={tone}
              id={id + tone}
              viewBox="0 0 8 8"
              markerWidth="6"
              markerHeight="6"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path className={tone} d="M0 0 8 4 0 8 2 4Z" />
            </marker>
          ))}
        </defs>
        {step.identify?.map((i) => (
          <circle
            key={i}
            className={'identify-node ' + tones[example.colors?.[i] ?? 0]}
            cx={drawing.points[i][0]}
            cy={drawing.points[i][1]}
            r="30"
          />
        ))}
        {step.regions?.map(({ members, tone }, i) => {
          const points = members.map((member) => drawing.points[member]);
          const left = Math.min(...points.map(([x]) => x)) - 32;
          const top = Math.min(...points.map(([, y]) => y)) - 32;
          const right = Math.max(...points.map(([x]) => x)) + 32;
          const bottom = Math.max(...points.map(([, y]) => y)) + 32;
          return (
            <rect
              key={i}
              className={'component-region ' + tone}
              x={left}
              y={top}
              width={right - left}
              height={bottom - top}
              rx="12"
            />
          );
        })}
        {step.contours?.map((c, i) => (
          <rect
            key={i}
            className={'contour ' + c.tone}
            x={c.x}
            y={c.y}
            width={c.width}
            height={c.height}
            rx="12"
          />
        ))}
        {step.guides && <RadialGuides step={step} />}
        {step.wedges && (
          <g className="wedges" transform="rotate(90 300 124)">
            <path className="amber" d="M300 124 110 320 490 320Z" />
            <path className="green" d="M300 124 110 -72 490 -72Z" />
          </g>
        )}
        {step.guard && (
          <circle className="clearance-guard" cx={step.guard[0]} cy={step.guard[1]} r="36" />
        )}
        {example.edges.map(([from, to], i) => {
          const tone =
            step.edgeTones?.[i] ?? tones[(example.colors?.[to] || example.colors?.[from]) ?? 0];
          const { path } = edgeGeometry(
            drawing.points[from],
            drawing.points[to],
            drawing.bends[i],
            from === to,
            step.group === to,
          );
          return (
            <g
              key={i}
              className={tone + (step.identifyEdges?.includes(i) ? ' identify-edge' : '')}
              opacity={drawing.edges[i]}
            >
              <path
                className="wire"
                d={step.routes?.[i] ?? path}
                markerEnd={step.bare ? undefined : `url(#${id + tone})`}
              />
            </g>
          );
        })}
        {example.nodes.map((name, i) => {
          const [x, y] = drawing.points[i];
          return (
            <g
              key={name}
              className={tones[example.colors?.[i] ?? 0]}
              transform={`translate(${x} ${y})`}
              opacity={drawing.nodes[i]}
            >
              {step.group === i ? (
                <rect className="node" x="-40" y="-20" width="80" height="40" rx="10" />
              ) : (
                <circle className={step.context === i ? 'node context' : 'node'} r="19" />
              )}
              <text className="node-label" y="1" dominantBaseline="middle">
                {step.group === i ? 'Letter' : name}
              </text>
            </g>
          );
        })}
        {step.ports?.map(({ point, tone }, i) => (
          <circle key={i} className={'route-port ' + tone} cx={point[0]} cy={point[1]} r="5" />
        ))}
      </svg>
      <div className="diagram-controls" role="group" aria-label={title}>
        <button type="button" disabled={active === 0} onClick={() => select(active - 1)}>
          ← Previous
        </button>
        <ol className="step-progress" aria-label="Step progression">
          {example.steps.map(({ label }, i) => (
            <li key={label} aria-current={active === i ? 'step' : undefined}>
              <span title={label}>{String.fromCharCode(65 + i)}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          disabled={active === example.steps.length - 1}
          onClick={() => select(active + 1)}
        >
          Next →
        </button>
      </div>
    </figure>
  );
}
