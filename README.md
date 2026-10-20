# Lexica

A visual finite-state machine editor for lexer design, with editable TikZ export. The Flutter rewrite targets web, Linux, macOS, and Windows. The original browser editor is preserved in [`legacy/`](legacy/).

## Run the Flutter app

Requires Flutter 3.47 / Dart 3.13 or newer, plus the native toolchain for your desktop OS.

```sh
flutter pub get
flutter run -d chrome
# Or on the corresponding host:
flutter run -d linux
flutter run -d macos
flutter run -d windows
```

To use another browser locally:

```sh
flutter run -d web-server --web-hostname 127.0.0.1 --web-port 5174
```

## First working Flutter pass

- Infinite canvas: drag empty space to pan, scroll to zoom, or use the zoom and Fit buttons. State positions are unrestricted.
- Minimap: click or drag to navigate. Compact auto layout separates states and routes labels around nodes and other labels.
- Double-click empty canvas to add a state. Double-click a state or transition for its properties popover. Drag states to move them.
- Right-click a source, then click a destination to connect. Choose the same state to create a loop. Escape cancels.
- Select a state and press **A** to toggle accepting status, preserving its token name. **Delete** removes the selection; **Ctrl/Cmd+Z** undoes; **Ctrl/Cmd+Shift+Z** redoes.
- Exactly one initial state can be assigned. Its toggle is hidden on other states. Uncheck the current initial state to assign another.
- The bottom tester uses longest-match lexing, accepts Unicode input, emits UTF-16 offsets, supports skipped tokens, and reports ambiguous transitions.
- Export copies a standalone LaTeX document, TikZ snippet, or editable machine JSON. TikZ uses the same geometry as the canvas.
- Import accepts pasted machine JSON from either version. Machine data automatically saves to local platform storage.

Transition expressions match one Unicode character per step, such as `[a-zA-Z_]`, `[0-9]`, `\s`, or `\+`. Epsilon transitions are not supported. Dense graphs may still have crossing edges.

For complete TeX documents, install `standalone`, `graphicx`, and TikZ with its `automata`, `positioning`, and `arrows` libraries. For snippets, add `\usepackage{tikz,graphicx}` and `\usetikzlibrary{automata,positioning,arrows}` to your document.

## Validate and build

```sh
flutter analyze
flutter test
flutter build web --release --no-web-resources-cdn
flutter build linux --release
# Run on the corresponding OS:
flutter build macos --release
flutter build windows --release
```

Verified on Linux: all 11 Flutter tests, all 10 preserved JavaScript tests, static analysis, and release builds for web and Linux.

Web output is in `build/web/`. Linux output is in `build/linux/x64/release/bundle/`; run `lexica` from that bundle with the accompanying libraries and data.

The first migration pass uses clipboard export and pasted JSON import on every platform. Native file dialogs, SVG export, touch pinch gestures, and packaged desktop installers have not been ported yet. Windows and macOS runners are generated but require verification on their respective hosts. TeX output is serialization-tested; PDF compilation requires a separate LaTeX installation.

To run the preserved browser app:

```sh
cd legacy
npm run dev
npm test
```

No Sites deployment is configured or performed by this repository.
