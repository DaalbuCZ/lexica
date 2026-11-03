import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tokenColorClass } from '../core/token-colors.js';
export function TokenOutput({ tokens, pending, error, onTrace, onSelect, activeOffsets }) {
  const ref = useRef(null);
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const node = ref.current;
    const observer = new ResizeObserver(() =>
      setColumns(Math.max(1, Math.floor((node.clientWidth - 18) / 174))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const virtual = tokens.length > 500;
  const rows = useVirtualizer({
    count: virtual ? Math.ceil(tokens.length / columns) : 0,
    getScrollElement: () => ref.current,
    estimateSize: () => 56,
    overscan: 4,
  });
  const firstActive = tokens.findIndex((token) => activeOffsets.has(token.offset));
  useEffect(() => {
    if (firstActive < 0) return;
    if (virtual)
      rows.scrollToIndex(Math.floor(firstActive / columns), {
        align: 'auto',
      });
    else
      ref.current?.querySelector(`[data-token-index="${firstActive}"]`)?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
  }, [firstActive, virtual, columns]);
  const card = (token, index) => (
    <button
      key={`${token.offset}:${index}`}
      type="button"
      data-token-index={index}
      aria-pressed={activeOffsets.has(token.offset)}
      className={`token ${token.token === 'ERROR' ? 'error' : `token-tinted ${tokenColorClass(token.token)}`} ${token.skip ? 'token-skipped' : ''} ${activeOffsets.has(token.offset) ? 'token-active' : ''}`}
      title={`Click to select in input · Hover to trace in graph · Offset ${token.offset}`}
      onPointerEnter={() => onTrace(token)}
      onPointerLeave={() => onTrace(null)}
      onFocus={() => onTrace(token)}
      onBlur={() => onTrace(null)}
      onClick={() => onSelect(token)}
    >
      <b>
        {token.token}
        {token.skip ? ' · skip' : ''}
      </b>
      {JSON.stringify(token.value)}
    </button>
  );
  return (
    <div
      id="tokens"
      ref={ref}
      aria-busy={pending}
      className={virtual ? 'react-virtual-tokens' : undefined}
    >
      {error ? (
        <span className="lexer-error" role="alert">
          {error.message}
        </span>
      ) : !tokens.length ? (
        <span className="empty">{pending ? 'Analyzing…' : 'Type some input to see tokens.'}</span>
      ) : virtual ? (
        <div
          style={{
            height: rows.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {rows.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              ref={rows.measureElement}
              className="virtual-token-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                minHeight: 56,
                paddingBottom: 8,
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
              }}
            >
              {tokens
                .slice(row.index * columns, (row.index + 1) * columns)
                .map((token, index) => card(token, row.index * columns + index))}
            </div>
          ))}
        </div>
      ) : (
        tokens.map(card)
      )}
    </div>
  );
}
