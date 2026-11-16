import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Preparation,
  Planarity,
  RadialCandidates,
  TreePlacement,
  Grouping,
  Compaction,
  Routing,
  Aesthetics,
  Packing,
} from './Stages.jsx';
import './explainer.css';
import { Finale } from './Finale.jsx';

function Explainer() {
  const [shape, setShape] = useState(null);
  const [grouped, setGrouped] = useState(null);
  const article = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (!isIntersecting) continue;
          target.dataset.revealed = 'true';
          observer.unobserve(target);
        }
      },
      { rootMargin: '0px 0px -50px 0px' },
    );
    for (const element of article.current.querySelectorAll('section, .branch-point, figure')) {
      if (element.dataset.revealed) continue;
      element.dataset.reveal = '';
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [shape, grouped]);
  const radial = shape === 'radial';
  return (
    <>
      <header className="masthead">
        <a href="./index.html">
          <span aria-hidden="true">λ</span> Lexica
        </a>
        <span>Inside the editor</span>
      </header>
      <main>
        <article ref={article}>
          <header className="intro">
            <h1>How auto layout works</h1>
            <p>
              A readable graph emerges one constraint at a time. At each stage, look at the drawing
              we have, find the problem it leaves behind, and follow the next geometric move.
            </p>
          </header>
          <Preparation />
          <div className="branch-point" data-answered={shape !== null}>
            <h2>How should the graph read?</h2>
            <div className="path-picker" role="group" aria-label="Placement path">
              {['radial', 'tree'].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={shape === value}
                  onClick={() => setShape(value)}
                >
                  {value === 'radial' ? 'Radial' : 'Tree'}
                </button>
              ))}
            </div>
          </div>
          {shape === 'tree' && (
            <>
              <Planarity />
              <TreePlacement />
            </>
          )}
          {shape && (
            <div id="grouping-choice" className="branch-point" data-answered={grouped !== null}>
              <p>
                {radial
                  ? 'A large radial component can be reduced to groups before placement.'
                  : 'The initial tree drawing is ready. Grouping is evaluated after this placement.'}
              </p>
              <h2>Allow automatic groups?</h2>
              <div className="path-picker" role="group" aria-label="Automatic grouping path">
                <button
                  type="button"
                  aria-pressed={grouped === false}
                  onClick={() => setGrouped(false)}
                >
                  Without automatic groups
                </button>
                <button
                  type="button"
                  aria-pressed={grouped === true}
                  onClick={() => setGrouped(true)}
                >
                  With automatic groups
                </button>
              </div>
            </div>
          )}
          {shape && grouped !== null && (
            <div id="walkthrough" key={shape + grouped}>
              {radial && grouped && <Grouping early />}
              {radial && (
                <>
                  <Planarity />
                  <RadialCandidates />
                  <Compaction />
                </>
              )}
              {grouped && <Grouping early={false} conditional={radial} />}
              <Routing radial={radial} />
              <Aesthetics />
              <Packing />
              <Finale shape={shape} grouped={grouped} />
              <div className="implementation-link">
                <p>Build the pipeline, from graph records to verified routes.</p>
                <a href="./implementation.html" target="_blank" rel="noopener">
                  Open the implementation guide ↗
                </a>
              </div>
            </div>
          )}
        </article>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<Explainer />);
