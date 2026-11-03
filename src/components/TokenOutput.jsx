import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tokenColorClass } from '../core/token-colors.js';
import { packTokenRows } from '../core/token-rows.js';

export function TokenOutput({ tokens, pending, error, onTrace, onSelect, activeOffsets }) {
  const ref = useRef(null),
    measure = useRef(null);
  const [width, setWidth] = useState(300),
    [fontVersion, setFontVersion] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current,
      observer = new ResizeObserver(() => setWidth(Math.max(1, node.clientWidth - 20)));
    observer.observe(node);
    let active = true;
    document.fonts.ready.then(() => {
      if (active) setFontVersion((value) => value + 1);
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);
  const virtual = tokens.length > 500;
  const sizes = useMemo(() => {
    if (!virtual) return [];
    const context =
      measure.current ?? (measure.current = document.createElement('canvas').getContext('2d'));
    return tokens.map((token) => {
      context.font = '11px "IBM Plex Mono",monospace';
      const text = context.measureText(JSON.stringify(token.value)).width;
      context.font = '8px "IBM Plex Mono",monospace';
      const label = context.measureText(token.token + (token.skip ? ' · skip' : '')).width;
      return {
        width: Math.min(width, Math.ceil(Math.max(label, text) + 22)),
        height: Math.max(48, Math.ceil(text / Math.max(1, width - 22)) * 17 + 29),
      };
    });
  }, [tokens, width, virtual, fontVersion]);
  const packed = useMemo(() => packTokenRows(sizes, width), [sizes, width]);
  const rows = useVirtualizer({
    count: virtual ? packed.length : 0,
    getScrollElement: () => ref.current,
    estimateSize: (index) => (packed[index]?.height ?? 48) + 6,
    overscan: 3,
  });
  const firstActive = tokens.findIndex((token) => activeOffsets.has(token.offset));
  useEffect(() => {
    if (firstActive < 0) return;
    if (virtual) {
      const index = packed.findIndex((row) => firstActive >= row.start && firstActive < row.end);
      if (index >= 0) rows.scrollToIndex(index, { align: 'auto' });
    } else
      ref.current
        ?.querySelector(`[data-token-index="${firstActive}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [firstActive, virtual, packed]);
  const card = (token, index) => (
    <button
      key={token.offset}
      type="button"
      data-token-index={index}
      aria-pressed={activeOffsets.has(token.offset)}
      style={virtual ? { width: sizes[index].width } : undefined}
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
        <div style={{ height: rows.getTotalSize(), position: 'relative', width: '100%' }}>
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
                minHeight: 54,
                paddingBottom: 6,
                transform: `translateY(${row.start}px)`,
              }}
            >
              {tokens
                .slice(packed[row.index].start, packed[row.index].end)
                .map((token, index) => card(token, packed[row.index].start + index))}
            </div>
          ))}
        </div>
      ) : (
        tokens.map(card)
      )}
    </div>
  );
}
