import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { isAccepting } from '../core/lexer.js';
import { tokenColorClass } from '../core/token-colors.js';
import { useStudio } from '../state/studio.js';

function matchScore(text, query) {
  if (text === query) return 0;
  const match = text.indexOf(query);
  if (match >= 0) return 1 + match;
  let position = 0;
  for (const letter of query) {
    const next = text.indexOf(letter, position);
    if (next < 0) return Infinity;
    position = next + 1;
  }
  return 100 + position;
}

// Interior.dev Command Palette adapted to Lexica's modal and token palette.
// https://www.interior.dev/docs/command-palette
export function StatePaletteHost() {
  const open = useStudio((state) => state.dialog?.type === 'state-search');
  const onClose = () => useStudio.setState({ dialog: null });
  const machine = useStudio((state) => state.scene.machine);
  const version = useStudio((state) => state.scene.version);
  const controller = useStudio((state) => state.controller);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const listId = useId(),
    dialog = useRef(null),
    list = useRef(null),
    picked = useRef(false);
  const items = useMemo(() => {
    const groups = new Map(
      (machine.groups ?? []).flatMap((group) => group.stateIds.map((id) => [id, group.name])),
    );
    return machine.states.map((state) => ({ state, group: groups.get(state.id) }));
  }, [machine, version]);
  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items
      .map((item) => {
        const { state, group } = item;
        const name = state.name.toLowerCase(),
          context = `${state.token} ${group ?? ''}`.toLowerCase();
        const score = terms.reduce(
          (sum, term) =>
            sum + Math.min(matchScore(name, term), context.includes(term) ? 50 : Infinity),
          0,
        );
        return { item, score };
      })
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => a.score - b.score)
      .map(({ item }) => item);
  }, [items, query]);
  const active = Math.max(
    0,
    results.findIndex(({ state }) => state.id === highlight),
  );
  // The list shows up to six fixed-height rows. Keep only a small window
  // mounted so opening the palette does not lay out the whole machine.
  const rowHeight = 38;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const rows = results.slice(first, first + 10).map((item, i) => ({ item, index: first + i }));
  if (results[active] && !rows.some(({ index }) => index === active))
    rows.push({ item: results[active], index: active });
  const scrollTo = (top) => {
    const element = list.current;
    if (!element) return;
    element.scrollTop = top;
    setScrollTop(element.scrollTop);
  };
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (open) {
      if (!panel.open) panel.showModal();
    } else if (panel.open) {
      panel.close();
      if (picked.current) document.getElementById('canvas')?.focus({ preventScroll: true });
      picked.current = false;
      setQuery('');
      setHighlight(null);
      scrollTo(0);
    }
  }, [open]);
  const choose = (item) => {
    if (!item) return;
    picked.current = true;
    onClose();
    controller.revealState(item.state.id);
  };
  const keyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    } else if (results.length && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const next =
        (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setHighlight(results[next].state.id);
      const element = list.current;
      if (!element) return;
      const top = next * rowHeight;
      if (top < element.scrollTop) scrollTo(top);
      else if (top + rowHeight > element.scrollTop + element.clientHeight)
        scrollTo(top + rowHeight - element.clientHeight);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="react-dialog state-palette"
      aria-label="Command palette"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <div className="state-palette-search">
        <Search size={16} aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Find a state"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Search states…"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(null);
            scrollTo(0);
          }}
          onKeyDown={keyDown}
        />
        <span role="status" aria-label={`${results.length} states found`}>
          {results.length}
        </span>
        <kbd>Esc</kbd>
      </div>
      <div
        className="state-palette-results"
        style={{ '--palette-rows': Math.max(1, Math.min(items.length, 6)) }}
      >
        <ul
          role="listbox"
          aria-label="Matching states"
          id={listId}
          ref={list}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onMouseDown={(event) => event.preventDefault()}
        >
          <li
            aria-hidden="true"
            role="presentation"
            className="state-palette-spacer"
            style={{ height: results.length * rowHeight }}
          />
          {rows.map(({ item, index: i }) => {
            const { state, group } = item;
            const color =
              isAccepting(state) && !state.skip
                ? `var(--token-accent-${tokenColorClass(state.token).slice(-1)})`
                : undefined;
            return (
              <li
                key={state.id}
                id={`${listId}-${i}`}
                style={{ top: i * rowHeight }}
                aria-posinset={i + 1}
                aria-setsize={results.length}
                role="option"
                aria-selected={i === active}
                onPointerMove={() => setHighlight(state.id)}
                onClick={() => choose(item)}
              >
                <span className="state-palette-name" style={{ color }}>
                  {state.name || 'Unnamed state'}
                </span>
                <span className="state-palette-group">{group ?? 'Overview'}</span>
              </li>
            );
          })}
        </ul>
        {!results.length && <p>No matching states</p>}
      </div>
      <div className="state-palette-footer">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> Navigate
        </span>
        <span>
          <kbd>↵</kbd> Go to state
        </span>
      </div>
    </dialog>
  );
}
