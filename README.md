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

Radix supplies dialog focus management and application menus, Lucide supplies icons, and Zustand supplies shared UI state. Dialogs and graph arrangement code load separately from the initial editor.

## Editing

- Double-click blank canvas to add a state, or use the Add state tool.
- Select with **V**, pan with **H**, and hold **Space** for temporary panning.
- Right-drag between states to connect them. Ctrl-drag inserts an intermediary state; continue onto blank canvas to build a chain.
- Use **A** to toggle accepting states and **C** to place comments.
- Use Ctrl/Cmd+C, X, V, A, Z, and Shift+Z for clipboard, selection, and history.
- Select states and choose Group; open a group to edit its contents. Settings offers full-canvas and overlay presentations.
- Settings also controls standard/extended FSM mode, simplified properties, label backgrounds, skipped tokens, zoom sensitivity, and theme.
- Extended FSMs support numeric stacks, legacy counters, conditions, and ordered side effects.
- Use the debugger or Alt+S, Alt+Left/Right, and Alt+Shift+Left/Right to inspect execution.
- Drag the toolbar/tester grips to dock them, or focus a grip and use arrow keys. The tester separator supports dragging and arrow keys.
- Open Keyboard shortcuts for the full reference.

## Data compatibility

Existing JSON machines, portals, groups, comments, memory rules, start views, tester input, and skipped-token preferences remain supported. The app continues using the `lexica-*` local-storage keys; there is no destructive storage migration.

JSON exports include tester input and its skipped-token preference. TikZ exports can include a complete compilable document. SVG exports remain vector diagrams. Import validates before replacing the current machine and is undoable.

Open the React app at the same origin to recover saved browser data automatically. Local storage belongs to the browser profile and origin; export JSON before changing either.

## Building and serving

`pnpm build` creates static files in `build/`. Serve those files with a static web server. The Dockerfile builds the React app and serves it with nginx. Deployment is managed by the user; development and verification do not publish the app.
