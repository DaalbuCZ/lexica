# Lexica

A local React application for designing, testing, and exporting finite state machine lexers. Built with Vite and pnpm, with no backend or hosted-service dependency.

## Development

Use Node.js 24 or newer and the pnpm version in `package.json`.

```sh
pnpm install
pnpm dev
```

Vite serves the app at `http://127.0.0.1:5173`. The port is fixed so saved browser data stays at the same origin.

```sh
pnpm build         # Production files in build/
pnpm preview       # Preview the production build
pnpm test          # Domain regression checks
pnpm lint          # JavaScript, JSX, and hook correctness
pnpm format
pnpm format:check
```

Optional browser smoke checks:

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

These cover editing, history, all export formats, settings, memory rules, grouping, overlays, debugging, docking, persisted data, and large token output. Failure traces and screenshots go to `test-results/`.

## Project structure

```text
index.html             Vite entry and theme initialization
src/main.jsx           React root and error boundary
src/App.jsx            Application composition
src/components/        React views, accessible dialogs, reusable form controls
src/hooks/             Analysis, persistence, theme, shortcuts, docking, resizing
src/state/studio.js    Zustand store and storage boundary
src/editor/            Canvas session, pointer interactions, viewport, drawing
src/core/              Lexer, graph model, layout algorithms, serialization
src/style.css          Existing visual design
src/react.css          React hosts, accessible overlays, virtual token rows
public/                Static assets and third-party notices
fixtures/              Compatible machine examples
tests.mjs              Domain regression checks
tests/                 Playwright browser workflows
```

React owns the application UI. The canvas engine owns high-frequency pointer state and drawing, publishing document and selection changes to the store. Listeners, animation frames, observers, workers, and text highlights have explicit cleanup, including React Strict Mode and Vite hot reload.

Keep lexer semantics and validation in `src/core/`, and editable form drafts inside components. Document changes go through the canvas session's transaction/history API so validation, undo, persistence, and redraw stay consistent. Canvas movements use animation frames. Large lexer input uses a cancellable worker; large token lists use TanStack Virtual.

Radix Themes supplies the shared controls; the pre-React palette is mapped onto its visual tokens in `src/palette.css`. Radix primitives provide window and menu behavior, Lucide supplies icons, and Zustand supplies shared UI state. The legacy graph styling is isolated in a CSS layer, while control geometry and focus states use the shared design system. Arrangement and memory panels open beside their toolbar buttons; settings, import, and export are centered dialogs. Dialogs and graph arrangement code load separately from the initial editor.

## Editing

- Double-click blank canvas to add a state, or use the Add state tool.
- Select with **V**, pan with **H**, and hold **Space** for temporary panning.
- Right-drag between states to connect them. Ctrl-drag inserts an intermediary state; continue onto blank canvas to build a chain.
- Use **A** to toggle accepting states and **C** to place comments.
- Use Ctrl/Cmd+C, X, V, A, Z, and Shift+Z for clipboard, selection, and history.
- Select states and choose Group (or use the selection context menu in simplified view); open a group to edit its contents. Floating groups are centered on their group nodes, using the main graph's scale and navigation without moving the camera. Their frames fit their contents and never shrink below their opening bounds. Moving members leaves the group node fixed. The minimap shows only the open group. Outside-state images have independent saved positions and cannot edit or move their original states.
- The debugger gently follows the current state when it approaches the edge of the visible area. Disable “Follow current state while debugging” under Settings → Navigation to keep the camera still. Manual navigation interrupts a camera move.
- Arrange offers Radial and Tree layouts. Tree uses layered ranks for shared branches and cycles.
- Enable “Recalculate paths while dragging” under Settings → Editor for continuous obstacle routing. Routing runs in a worker; endpoints track the pointer between completed calculations.
- SVG export includes a visual preview and separate diagrams for the main graph and every group. Download a diagram individually or all SVG files together in a ZIP archive.
- Settings also controls standard/extended FSM mode, simplified properties, label backgrounds, skipped tokens, zoom sensitivity, and theme.
- Extended FSMs support numeric stacks, legacy counters, conditions, and ordered side effects.
- Use the debugger or Alt+S, Alt+Left/Right, and Alt+Shift+Left/Right to inspect execution. Debug controls, status, and memory values appear together in a separate window above the graph.
- Drag the toolbar/tester grips to dock them, or focus a grip and use arrow keys. The tester separator supports dragging and arrow keys.
- Open Keyboard shortcuts for the full reference.

## Data compatibility

Existing JSON machines, portals, groups, comments, memory rules, start views, tester input, and skipped-token preferences remain supported. The app continues using the `lexica-*` local-storage keys; there is no destructive storage migration.

JSON exports include tester input and its skipped-token preference. TikZ exports can include a complete compilable document. SVG exports remain vector diagrams. Import validates before replacing the current machine and is undoable.

Open the React app at the same origin to recover saved browser data automatically. Local storage belongs to the browser profile and origin; export JSON before changing either.

## Building and serving

`pnpm build` creates static files in `build/`. Serve those files with a static web server. The Dockerfile builds the React app and serves it with nginx. Deployment is managed by the user; development and verification do not publish the app.
