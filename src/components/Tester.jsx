import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Play, Square, ArrowDown } from 'lucide-react';
import { useStudio, readStorage, writeStorage } from '../state/studio.js';
import { useLexer } from '../hooks/useLexer.js';
import { setupInputHighlights } from '../core/input-highlights.js';
import { tokenColorClass } from '../core/token-colors.js';
import { tokensAtSelection } from '../core/token-output.js';
import { nextErrorToken } from '../core/error-navigation.js';
import { createDebugSession } from '../core/debug-session.js';
import { TokenOutput } from './TokenOutput.jsx';
import { IconButton, Button } from './ui.jsx';
import { useDockGrip } from '../hooks/useDocking.js';
import { useTesterResize } from '../hooks/useTesterResize.js';
import { DebuggerWindow } from './DebuggerWindow.jsx';
import { usePresence } from '../hooks/usePresence.js';
export function Tester({ debuggerRef }) {
  // Document edits may mutate the machine in place; selection changes need no lexer rerender.
  const version = useStudio((s) => s.scene.version);
  const machine = useStudio((s) => s.scene.machine),
    input = useStudio((s) => s.input),
    showSkipped = useStudio((s) => s.showSkipped),
    controller = useStudio((s) => s.controller);
  const analysis = useLexer(machine, input, version);
  useEffect(() => {
    if (!controller || analysis.pending) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => document.body.classList.add('app-ready'));
    });
    return () => cancelAnimationFrame(frame);
  }, [controller, analysis.pending]);
  const inputRef = useRef(null),
    mirror = useRef(null),
    errorsRef = useRef(null),
    highlights = useRef(null),
    session = useRef(null);
  const scrollFrame = useRef(null);
  const [frame, setFrame] = useState(null),
    [hover, setHover] = useState(null),
    [activeOffsets, setActiveOffsets] = useState(new Set()),
    [collapsed, setCollapsed] = useState(() => readStorage('lexica-tester-collapsed', false));
  const visible = useMemo(
    () => analysis.tokens.filter((t) => showSkipped || !t.skip),
    [analysis.tokens, showSkipped],
  );
  const errors = useMemo(
    () => analysis.tokens.filter((t) => t.token === 'ERROR'),
    [analysis.tokens],
  );
  const grip = useDockGrip('tester'),
    resize = useTesterResize();
  const [dock, setDock] = useState(() => document.body.dataset.testerDock || 'right');
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDock(document.body.dataset.testerDock || 'right'),
    );
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-tester-dock'] });
    return () => observer.disconnect();
  }, []);
  const CollapseIcon = {
    bottom: collapsed ? ChevronUp : ChevronDown,
    top: collapsed ? ChevronDown : ChevronUp,
    left: collapsed ? ChevronUp : ChevronDown,
    right: collapsed ? ChevronUp : ChevronDown,
  }[dock];
  const [canPrevious, setCanPrevious] = useState(false),
    [canNext, setCanNext] = useState(false);
  const debugPresent = usePresence(!!frame),
    lastFrame = useRef(null);
  if (frame) lastFrame.current = frame;
  useLayoutEffect(() => {
    highlights.current = setupInputHighlights(
      inputRef.current,
      mirror.current,
      tokenColorClass,
      errorsRef.current,
    );
    return () => {
      highlights.current?.dispose();
      highlights.current = null;
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    };
  }, []);
  const sync = () => {
    const area = inputRef.current,
      layer = mirror.current;
    if (!area || !layer || area.closest('.analysis-pending')) return;
    layer.style.paddingRight = 11 + Math.max(0, area.offsetWidth - area.clientWidth) + 'px';
    layer.scrollTop = area.scrollTop;
    layer.scrollLeft = area.scrollLeft;
    highlights.current?.refresh();
  };
  useLayoutEffect(() => {
    if (analysis.pending) return;
    highlights.current?.render(analysis.tokens);
    sync();
  }, [analysis.tokens, analysis.pending]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!document.body.classList.contains('resizing-tester')) sync();
    });
    observer.observe(inputRef.current);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);
  useEffect(() => {
    session.current = null;
    setFrame(null);
    setCanNext(false);
    setCanPrevious(false);
    setHover(null);
    setActiveOffsets((offsets) => (offsets.size ? new Set() : offsets));
  }, [analysis.key, input]);
  useEffect(() => {
    if (!controller) return;
    controller.setTrace(
      frame,
      analysis.error
        ? {
            states: analysis.error.stateId ? [analysis.error.stateId] : [],
            edges: analysis.error.edgeIndices ?? [],
          }
        : {
            states: errors.map((t) => t.failureState).filter(Boolean),
            edges: [],
          },
    );
  }, [controller, analysis.error, errors, frame]);
  useEffect(() => {
    document.body.classList.toggle('tester-collapsed', collapsed);
    writeStorage('lexica-tester-collapsed', collapsed);
    const id = requestAnimationFrame(() => {
      sync();
      controller?.refreshViewport();
    });
    return () => cancelAnimationFrame(id);
  }, [collapsed, controller]);
  const reveal = (box) => {
    if (!box) return;
    const area = inputRef.current,
      bounds = area.getBoundingClientRect();
    if (box.top < bounds.top + 12 || box.bottom > bounds.bottom - 12)
      area.scrollTop += box.top - bounds.top - 12;
    if (box.left < bounds.left + 12 || box.right > bounds.right - 12)
      area.scrollLeft += box.left - bounds.left - 12;
    sync();
  };
  const focusSelection = () => {
    if (analysis.pending || session.current || document.activeElement !== inputRef.current) return;
    const area = inputRef.current;
    const matches = tokensAtSelection(
      visible,
      area.selectionStart,
      area.selectionEnd,
      input.length,
    );
    setActiveOffsets(new Set(matches.map(({ t }) => t.offset)));
    controller?.setTrace(
      matches.length
        ? {
            traceStates: matches.flatMap(({ t }) => t.traceStates ?? []),
            traceEdges: matches.flatMap(({ t }) => t.traceEdges ?? []),
            token: matches.some(({ t }) => t.token === 'ERROR') ? 'ERROR' : '',
          }
        : null,
    );
  };
  const clearSelectionTrace = () => {
    if (session.current) return;
    setActiveOffsets((offsets) => (offsets.size ? new Set() : offsets));
    clearHover();
    controller?.setTrace(null);
  };
  useEffect(() => {
    const clearOutside = (event) => {
      if (!event.target.closest?.('.tester, .debugger-window')) clearSelectionTrace();
    };
    document.addEventListener('pointerdown', clearOutside, true);
    return () => document.removeEventListener('pointerdown', clearOutside, true);
  }, [controller]);
  const selectToken = (token) => {
    session.current = null;
    setFrame(null);
    highlights.current.clearStep();
    const area = inputRef.current;
    area.focus({
      preventScroll: true,
    });
    area.setSelectionRange(token.offset, token.offset + token.value.length);
    reveal(highlights.current.rect(token.offset, token.offset + token.value.length));
    focusSelection();
  };
  const showFrame = () => {
    const next = session.current?.current();
    setFrame(next ? { ...next, position: session.current.position() } : null);
    setCanPrevious(session.current?.canPrevious() ?? false);
    setCanNext(session.current?.canNext() ?? false);
    if (next) reveal(highlights.current.step(next));
    else highlights.current.clearStep();
  };
  const start = () => {
    if (analysis.pending) return;
    session.current = createDebugSession(machine, input, analysis.tokens);
    session.current.seek(inputRef.current.selectionStart ?? 0);
    showFrame();
  };
  const toggle = () => {
    if (session.current) {
      session.current = null;
      setFrame(null);
      highlights.current.clearStep();
    } else start();
  };
  const move = (method) => {
    if (!session.current) start();
    else {
      session.current[method]();
      showFrame();
    }
  };
  debuggerRef.current = {
    toggle,
    move,
  };
  const seek = () => {
    if (session.current) {
      session.current.seek(inputRef.current.selectionStart);
      showFrame();
    } else focusSelection();
  };
  const pointerMove = (event) => {
    if (analysis.pending) return;
    const x = event.clientX,
      y = event.clientY;
    const token = highlights.current?.tokenAtPoint(x, y);
    highlights.current?.hover(token);
    setHover(token ? { token, x, y } : null);
  };
  const clearHover = () => {
    setHover(null);
    highlights.current?.hover(null);
  };
  return (
    <section className={`tester ${analysis.pending ? 'analysis-pending' : ''}`}>
      <div
        id="tester-resize"
        role="separator"
        tabIndex={0}
        aria-label="Resize lexer tester"
        {...resize}
      />
      <div className="panel-title">
        <IconButton
          id="tester-grip"
          className="dock-grip"
          icon={GripVertical}
          label="Move tester (drag or use arrow keys)"
          {...grip}
        />
        <h2>Lexer tester</h2>
        <div className="tester-actions">
          <IconButton
            id="step-toggle"
            icon={frame ? Square : Play}
            className={frame ? 'debug-stop' : ''}
            label={frame ? 'Stop debugging' : 'Start debugging'}
            aria-pressed={!!frame}
            disabled={analysis.pending}
            onClick={toggle}
          />
          <IconButton
            id="toggle-tester"
            icon={CollapseIcon}
            label={collapsed ? 'Expand tester' : 'Collapse tester'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
      </div>
      {debugPresent && lastFrame.current && (
        <DebuggerWindow
          open={!!frame}
          testerCollapsed={collapsed}
          frame={frame ?? lastFrame.current}
          canPrevious={canPrevious}
          canNext={canNext}
          onMove={move}
          onStop={toggle}
        />
      )}
      <div className="test-grid">
        <div>
          <div id="tester-debugger-slot" />
          <div className="input-label">
            <label className="field-label" htmlFor="input">
              INPUT
            </label>
          </div>
          <div className="input-wrap">
            <div
              id="input-highlights"
              ref={mirror}
              className="input-highlights"
              aria-hidden="true"
            />
            <div
              id="input-errors"
              ref={errorsRef}
              className="input-error-lines"
              aria-hidden="true"
            />
            {hover && (
              <div
                className={`input-token-hover ${hover.token.token === 'ERROR' ? 'token-hover-error' : tokenColorClass(hover.token.token)}`}
                style={{
                  position: 'fixed',
                  left: Math.max(6, Math.min(innerWidth - 160, hover.x - 40)),
                  top: Math.max(6, hover.y - 40),
                }}
                aria-hidden="true"
              >
                {hover.token.token}
              </div>
            )}
            <textarea
              id="input"
              ref={inputRef}
              spellCheck={false}
              value={input}
              onChange={(e) =>
                useStudio.setState({
                  input: e.target.value,
                })
              }
              onScroll={() => {
                if (scrollFrame.current !== null) return;
                scrollFrame.current = requestAnimationFrame(() => {
                  scrollFrame.current = null;
                  clearHover();
                  sync();
                });
              }}
              onSelect={focusSelection}
              onBlur={clearSelectionTrace}
              onClick={seek}
              onKeyUp={(e) => {
                if (!e.altKey && e.key.startsWith('Arrow')) seek();
              }}
              onPointerMove={pointerMove}
              onPointerLeave={clearHover}
            />
          </div>
        </div>
        <div>
          <div className="output-label">
            <span className="field-label">TOKENS</span>
            <div className="lexer-error-actions">
              <span
                id="error-count"
                role="status"
                aria-live="polite"
                className={errors.length || analysis.error ? 'has-errors' : ''}
              >
                {analysis.error ? 1 : errors.length}{' '}
                {errors.length === 1 || analysis.error ? 'error' : 'errors'}
              </span>
              <Button
                id="next-error"
                className="text-action"
                label="Next error"
                disabled={!errors.length || analysis.pending}
                onClick={() => {
                  const token = nextErrorToken(errors, inputRef.current.selectionEnd);
                  if (token) selectToken(token);
                }}
              >
                <ArrowDown className="tool-icon" />
                <span>Next error</span>
              </Button>
            </div>
          </div>
          <TokenOutput
            tokens={visible}
            pending={analysis.pending}
            error={analysis.error}
            activeOffsets={activeOffsets}
            onTrace={(token) => {
              if (!session.current && !analysis.pending) controller?.setTrace(token);
            }}
            onSelect={selectToken}
          />
        </div>
      </div>
    </section>
  );
}
