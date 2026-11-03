import { createPortal } from 'react-dom';
import { Theme, Badge } from '@radix-ui/themes';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { IconButton } from './ui.jsx';

export function DebuggerWindow({ frame, canPrevious, canNext, onMove, onStop }) {
  return createPortal(
    <Theme asChild>
      <section className="debugger-window" role="dialog" aria-label="Lexer debugger">
        <div className="window-heading">
          <h2>Lexer debugger</h2>
          <Badge variant="soft">Step {frame.position}</Badge>
          <IconButton icon={X} label="Stop debugging" onClick={onStop} />
        </div>
        <div className="debugger-controls">
          <IconButton
            icon={ChevronsLeft}
            label="Previous token"
            title="Previous token · Alt+Shift+Left"
            disabled={!canPrevious}
            onClick={() => onMove('previousToken')}
          />
          <IconButton
            icon={ChevronLeft}
            label="Previous step"
            title="Previous step · Alt+Left"
            disabled={!canPrevious}
            onClick={() => onMove('previous')}
          />
          <IconButton
            icon={ChevronRight}
            label="Next step"
            title="Next step · Alt+Right"
            disabled={!canNext}
            onClick={() => onMove('next')}
          />
          <IconButton
            icon={ChevronsRight}
            label="Next token"
            title="Next token · Alt+Shift+Right"
            disabled={!canNext}
            onClick={() => onMove('nextToken')}
          />
          <span className="debugger-offset">Offset {frame.offset}</span>
        </div>
        <p id="step-status" className="debugger-status" role="status" aria-live="polite">
          {frame.message}
        </p>
        <div className="debugger-memory">
          <h3>Memory</h3>
          {Object.keys(frame.memory ?? {}).length ? (
            <div id="step-memory" className="debugger-stacks">
              {Object.entries(frame.memory).map(([name, value]) => (
                <div className="debugger-stack" key={name}>
                  <strong>{name}</strong>
                  <output>
                    {Array.isArray(value)
                      ? value.length
                        ? '[' + value.join(', ') + '] ← top'
                        : '[] (empty)'
                      : value}
                  </output>
                </div>
              ))}
            </div>
          ) : (
            <p className="debugger-empty">No memory cells</p>
          )}
        </div>
      </section>
    </Theme>,
    document.body,
  );
}
