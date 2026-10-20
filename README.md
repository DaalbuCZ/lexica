# Lexica

A browser-local DFA editor for lexer design, with TikZ/LaTeX export.

Run `npm run dev` and open http://localhost:5173. No install step or build required.

To serve it with Docker, run `docker build -t lexica .` followed by `docker run --rm -p 8080:80 lexica`, then open http://localhost:8080.

- Double-click the canvas or use + State. Drag states to arrange them.
- Right-click a source state, then click a destination (same state creates a loop). Right-drag also connects. Escape cancels. New self-loops prefill the last valid transition expression you edited in this session (blank until a rule has been edited). Other new transitions start blank. Edit the expression in Properties; blank rules can be saved/exported, but must be filled before testing.
- Drag empty canvas to pan; scroll to zoom. Space-drag or middle-drag also pans. The minimap supports click/drag navigation, and Fit shows the whole graph. State positions are unrestricted.
- Choose **Tree** or **Radial** beside **Auto layout**, choose **Extra compact**, **Compact**, **Normal**, or **Spacious** density, then click it to arrange. Density adjusts branch and layer spacing for both layouts. Both the layout style and density are remembered in this browser. Radial layout centers each component on its parent/root and spreads descendant branches through angular sectors, with deeper states farther outward. Tree layout follows each branch before considering shortcuts from the initial state, keeping shared destinations close to their longer paths. It builds a left-to-right branching tree, reserves a separate band for each subtree, and routes transition labels around states and other labels. It prioritizes separation over compactness; comments are placed below the graph. Cycles and shared destinations remain connected by extra arrows. Undo restores the previous layout. Dense graphs may still have crossing edges.
- Double-click a state or transition to open its properties popover. Single-click selects; Escape or clicking the canvas dismisses properties.
- Transition expressions match one Unicode character at a time: `[a-zA-Z_]`, `[0-9]`, `\s`, `\+`. Epsilon transitions are not supported. Ambiguous outgoing transitions are reported on tested input.
- Input uses longest-match tokenization, falling back to the last accepting state. Errors consume one Unicode code point. Token offsets use UTF-16 indices.
- Export offers a complete `.tex` document or a TikZ snippet. The complete document needs `standalone`, `tikz`, and the `automata`, `positioning`, and `arrows` libraries. Snippets need `\usepackage{tikz,graphicx}` and `\usetikzlibrary{automata,positioning,arrows}` in the host document. Labels are exported literally with TeX escaping.
- JSON import/export preserves the editable machine. SVG export produces a portable diagram.
- Machines save in localStorage. Export JSON for a portable backup. Undo/redo works within the current session.

Run `npm test` for lexer, portal resolution, import validation, and TeX serialization checks. PDF compilation requires a LaTeX installation with the packages above.

Shortcuts: select a state and press **A** to toggle accepting status (its token name is preserved); **Delete** removes the selection, **Ctrl/Cmd+Z** undoes, **Ctrl/Cmd+Shift+Z** redoes, and **Escape** dismisses properties or cancels connecting. Shortcuts do not change states while typing in fields.

Only one initial state can be assigned. Its toggle is hidden on other states. Uncheck the current initial state, then open another state's properties to assign it. Machines without an initial state can be saved/exported; testing prompts you to assign one.

Portal labels are supported: enable **Connect via portal** on an arrow, or use **New portal transition** on a state. Matching labels resolve to one destination state without an extra input-consuming step. Missing or duplicate destinations are reported by the tester. Renaming a unique destination updates references. Portal JSON is stored with the machine; TikZ and SVG preserve the labels.

Right-drag an arrow from a state and release on empty canvas to create a connected state. One Undo removes both the state and its new arrow.

Use **Select (V)** to drag a selection box, or **Shift-click** items to add/remove them. Drag a selected state or comment to move the whole group. Internal transitions follow their states. **Ctrl/Cmd+A** selects everything; **Ctrl/Cmd+C/X/V** copies, cuts, and pastes (toolbar buttons also work). Pasted states get new IDs, copied portal destinations get unique labels, and the existing initial state stays assigned. **Pan (H)** restores drag-to-pan.

Use **Comment (C)** to add a comment label at the cursor; the toolbar button lets you click to place one. Comments automatically attach to the nearest state with a dashed line. Right-click a comment, click states to add/remove connections, then right-click again or press Esc to finish. Several states can connect to one comment, and several comments can share a state. You can also right-click a state and then a comment to toggle their attachment. Comments follow the center of their connected states during dragging and auto layout, keeping their relative offset. Copying a state includes its attached notes. Double-click a comment to edit its text; drag it to reposition it. Comments support multiple lines, group selection, copy/paste, deletion, and undo/redo. They save with JSON and appear in SVG and TikZ exports without affecting lexer behavior.

**Ctrl-drag** from a state onto another state inserts an intermediary: parent → new state → destination. Drop on blank canvas to place the intermediary there and continue connecting from it to your next destination. Ctrl also works with right-drag. Each insertion is one undo step; both new rules start blank.

Use **Box transition labels** in the toolbar to toggle borders around regex labels. The setting saves with the machine, supports Undo, and is included in SVG and TikZ exports.

State names wrap at spaces only when too long to fit on one line, on the canvas and in SVG/TikZ exports. Long names scale to fit inside the state.

Use the moon/sun button beside Import to switch between light and dark mode. The editor initially follows your system theme, then remembers your manual choice. SVG and TeX exports retain their paper-friendly light styling.

Use **Import** to paste a complete machine JSON document or choose a `.json` file. Imported data is validated before replacing the graph; Undo restores the previous machine.
