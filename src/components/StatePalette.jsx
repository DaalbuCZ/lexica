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
    picked = useRef(false),
    previousRows = useRef(null);
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
  const resetSearch = () => {
    setQuery('');
    setHighlight(null);
    scrollTo(0);
  };
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (open) {
      if (panel.dataset.closing) {
        delete panel.dataset.closing;
        picked.current = false;
        resetSearch();
      }
      if (!panel.open) panel.showModal();
      return;
    }
    if (!panel.open) return;
    const finishClose = () => {
      panel.close();
      delete panel.dataset.closing;
      if (picked.current) document.getElementById('canvas')?.focus({ preventScroll: true });
      picked.current = false;
      resetSearch();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose();
      return;
    }
    // Keep the native dialog in the top layer until its exit fade ends.
    panel.dataset.closing = 'true';
    const onEnd = (event) => {
      if (event.target === panel && !event.pseudoElement && event.propertyName === 'opacity')
        finishClose();
    };
    const timer = setTimeout(() => {
      if (panel.open) finishClose();
    }, 190);
    panel.addEventListener('transitionend', onEnd);
    return () => {
      clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
    };
  }, [open]);

  const changeQuery = (value) => {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previousRows.current = new Map(
        Array.from(list.current.querySelectorAll('[data-palette-state]'), (row) => [
          row.dataset.paletteState,
          row.getBoundingClientRect().top,
        ]),
      );
    }
    setQuery(value);
    setHighlight(null);
    scrollTo(0);
  };
  useLayoutEffect(() => {
    const before = previousRows.current;
    previousRows.current = null;
    if (!before || !open) return;
    const visible = list.current.getBoundingClientRect();
    const moves = [];
    for (const row of list.current.querySelectorAll('[data-palette-state]')) {
      for (const animation of row.getAnimations())
        if (animation.id === 'palette-reorder') animation.cancel();
      const box = row.getBoundingClientRect();
      if (box.bottom <= visible.top || box.top >= visible.bottom) continue;
      const oldTop = before.get(row.dataset.paletteState);
      const offset = oldTop === undefined ? 5 : oldTop - box.top;
      if (Math.abs(offset) > 0.5) moves.push({ row, offset, entering: oldTop === undefined });
    }
    for (const { row, offset, entering } of moves) {
      const animation = row.animate(
        [
          { transform: `translateY(${offset}px)`, opacity: entering ? 0 : 1 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 160, easing: 'cubic-bezier(.2,.75,.25,1)' },
      );
      animation.id = 'palette-reorder';
    }
  }, [query, open]);

  const choose = (item) => {
    if (!item || !open) return;
    picked.current = true;
    onClose();
    controller.revealState(item.state.id);
  };
  const keyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!open && picked.current) controller.showProperties(true);
      else choose(results[active]);
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
          onChange={(event) => changeQuery(event.target.value)}
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
                data-palette-state={state.id}
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
