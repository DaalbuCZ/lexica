# Lexica

A browser-local DFA editor for lexer design, with TikZ/LaTeX export.

Run `npm run dev` and open http://localhost:5173. No install step or build required.

- Double-click the canvas or use + State. Drag states to arrange them.
- Right-click a source state, then click a destination (same state creates a loop). Right-drag also connects. Escape cancels. Edit the expression in Properties.
- Drag empty canvas to pan; scroll to zoom. Space-drag or middle-drag also pans. The minimap supports click/drag navigation, and Fit shows the whole graph. State positions are unrestricted.
- Auto layout arranges states in layers and routes transition labels around states and other labels. Undo restores the previous layout. Dense graphs may still have crossing edges.
- Double-click a state or transition to open its properties popover. Single-click selects; Escape or clicking the canvas dismisses properties.
- Transition expressions match one Unicode character at a time: `[a-zA-Z_]`, `[0-9]`, `\s`, `\+`. Epsilon transitions are not supported. Ambiguous outgoing transitions are reported on tested input.
- Input uses longest-match tokenization, falling back to the last accepting state. Errors consume one Unicode code point. Token offsets use UTF-16 indices.
- Export offers a complete `.tex` document or a TikZ snippet. The complete document needs `standalone`, `tikz`, and the `automata`, `positioning`, and `arrows` libraries. Snippets need `\usepackage{tikz,graphicx}` and `\usetikzlibrary{automata,positioning,arrows}` in the host document. Labels are exported literally with TeX escaping.
- JSON import/export preserves the editable machine. SVG export produces a portable diagram.
- Machines save in localStorage. Export JSON for a portable backup. Undo/redo works within the current session.

Run `npm test` for lexer, import validation, and TeX serialization checks. PDF compilation requires a LaTeX installation with the packages above.

Shortcuts: select a state and press **A** to toggle accepting status (its token name is preserved); **Delete** removes the selection, **Ctrl/Cmd+Z** undoes, **Ctrl/Cmd+Shift+Z** redoes, and **Escape** dismisses properties or cancels connecting. Shortcuts do not change states while typing in fields.

Only one initial state can be assigned. Its toggle is hidden on other states. Uncheck the current initial state, then open another state's properties to assign it. Machines without an initial state can be saved/exported; testing prompts you to assign one.
