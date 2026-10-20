import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'diagram_painter.dart';
import 'machine.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb) await BrowserContextMenu.disableContextMenu();
  SharedPreferences? storage;
  var machine = Machine.example();
  String? warning;
  try {
    storage = await SharedPreferences.getInstance();
    final saved = storage.getString('lexica-machine');
    if (saved != null) machine = Machine.decode(saved);
  } catch (_) {
    warning =
        'Saved machine could not be restored. Import a JSON backup if needed.';
  }
  runApp(LexicaApp(initial: machine, storage: storage, warning: warning));
}

class LexicaApp extends StatelessWidget {
  const LexicaApp({super.key, this.initial, this.storage, this.warning});
  final Machine? initial;
  final SharedPreferences? storage;
  final String? warning;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Lexica',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: ink, surface: paper),
      scaffoldBackgroundColor: paper,
      useMaterial3: true,
      inputDecorationTheme: InputDecorationTheme(
        isDense: true,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
        contentPadding: const EdgeInsets.all(10),
      ),
    ),
    home: Editor(
      initial: initial ?? Machine.example(),
      storage: storage,
      warning: warning,
    ),
  );
}

class Editor extends StatefulWidget {
  const Editor({super.key, required this.initial, this.storage, this.warning});
  final Machine initial;
  final SharedPreferences? storage;
  final String? warning;
  @override
  State<Editor> createState() => _EditorState();
}

class _EditorState extends State<Editor> {
  late Machine machine;
  final focus = FocusNode(),
      input = TextEditingController(text: 'hello 42 world');
  final undo = <String>[], redo = <String>[];
  Offset pan = Offset.zero;
  double zoom = 1;
  Size canvasSize = Size.zero;
  String? selected, source, dragging;
  int? selectedEdge;
  Offset? popover, pointer, dragOffset, lastPointer;
  bool panning = false,
      moved = false,
      space = false,
      showSkipped = false,
      collapsed = false;
  bool _fitted = false;
  int _id = 0;
  Rect? _mapDragBounds;
  Future<void> _saveQueue = Future.value();
  String saveStatus = 'Saved locally';
  @override
  void initState() {
    super.initState();
    machine = widget.initial.copy();
    if (widget.warning != null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => message(widget.warning!),
      );
    }
  }

  @override
  void dispose() {
    input.dispose();
    focus.dispose();
    super.dispose();
  }

  void message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), duration: const Duration(seconds: 3)),
    );
  }

  void checkpoint() {
    undo.add(machine.encode());
    if (undo.length > 80) undo.removeAt(0);
    redo.clear();
  }

  void save() {
    final snapshot = machine.encode();
    setState(() => saveStatus = 'Saving…');
    _saveQueue = _saveQueue.then((_) async {
      try {
        if (widget.storage != null &&
            !await widget.storage!.setString('lexica-machine', snapshot)) {
          throw StateError('Storage unavailable');
        }
        if (mounted) {
          setState(
            () => saveStatus = widget.storage == null
                ? 'Export JSON to save'
                : 'Saved locally',
          );
        }
      } catch (_) {
        if (mounted) {
          setState(() => saveStatus = 'Autosave failed — export JSON');
        }
      }
    });
  }

  void change(VoidCallback action) {
    checkpoint();
    setState(action);
    save();
  }

  void history(bool forward) {
    final from = forward ? redo : undo, to = forward ? undo : redo;
    if (from.isEmpty) return;
    setState(() {
      to.add(machine.encode());
      machine = Machine.decode(from.removeLast());
      if (!machine.states.any((s) => s.id == selected)) selected = null;
      if (selectedEdge != null && selectedEdge! >= machine.edges.length) {
        selectedEdge = null;
      }
      source = null;
      popover = null;
    });
    save();
  }

  Offset world(Offset local) => (local - pan) / zoom;
  String? hitState(Offset p) {
    for (final s in machine.states.reversed) {
      if ((s.position - p).distance < 40) return s.id;
    }
    return null;
  }

  int? hitEdge(Offset p, List<EdgeRoute> routes) {
    for (var i = routes.length - 1; i >= 0; i--) {
      if (routes[i].labelBox.inflate(6).contains(p)) return i;
      for (var t = 0.0; t <= 1; t += .02) {
        if ((routes[i].sample(t) - p).distance < 9 / zoom) return i;
      }
    }
    return null;
  }

  void fit({bool readable = false}) {
    if (canvasSize.isEmpty) return;
    final bounds = diagramBounds(machine, routeEdges(machine)).inflate(30);
    setState(() {
      zoom = math
          .min(
            canvasSize.width / bounds.width,
            math.max(180, canvasSize.height - 110) / bounds.height,
          )
          .clamp(.15, 1.3);
      if (readable) zoom = math.max(.9, zoom);
      pan = Offset(
        (canvasSize.width - bounds.width * zoom) / 2 - bounds.left * zoom,
        65 +
            (canvasSize.height - 110 - bounds.height * zoom) / 2 -
            bounds.top * zoom,
      );
    });
  }

  void zoomAt(Offset at, double factor) {
    final p = world(at);
    setState(() {
      popover = null;
      zoom = (zoom * factor).clamp(.1, 5);
      pan = at - p * zoom;
    });
  }

  void addState(Offset at) {
    final id = 'q${DateTime.now().microsecondsSinceEpoch}_${_id++}';
    change(() {
      machine.states.add(
        FsmState(id: id, name: 'q${machine.states.length}', position: at),
      );
      selected = id;
      selectedEdge = null;
      popover = at * zoom + pan;
    });
  }

  void deleteSelection() {
    if (selected == null && selectedEdge == null) return;
    if (selected != null && machine.states.length == 1) {
      message('Keep at least one state.');
      return;
    }
    change(() {
      if (selected != null) {
        machine.states.removeWhere((s) => s.id == selected);
        machine.edges.removeWhere(
          (e) => e.from == selected || e.to == selected,
        );
        if (machine.start == selected) machine.start = null;
      } else {
        machine.edges.removeAt(selectedEdge!);
      }
      selected = null;
      selectedEdge = null;
      popover = null;
      source = null;
    });
  }

  void connect(String target) {
    change(() {
      machine.edges.add(Transition(source!, target, '[a-z]'));
      selectedEdge = machine.edges.length - 1;
      selected = null;
      source = null;
      popover = machine.state(target).position * zoom + pan;
    });
  }

  void pointerDown(PointerDownEvent e) {
    focus.requestFocus();
    final p = world(e.localPosition), id = hitState(p);
    if (e.buttons == kSecondaryMouseButton) {
      setState(() {
        popover = null;
      });
      if (id != null) {
        if (source == null) {
          setState(() {
            source = id;
            pointer = p;
          });
        } else {
          connect(id);
        }
      } else {
        setState(() => source = null);
      }
      return;
    }
    if (source != null && id != null) {
      connect(id);
      return;
    }
    setState(() {
      popover = null;
      lastPointer = e.localPosition;
      if (space || e.buttons == kMiddleMouseButton) {
        panning = true;
        return;
      }
      selected = id;
      selectedEdge = id == null ? hitEdge(p, routeEdges(machine)) : null;
      if (id != null) {
        dragging = id;
        dragOffset = p - machine.state(id).position;
        moved = false;
      } else if (selectedEdge == null) {
        panning = true;
      }
    });
  }

  void pointerMove(PointerEvent e) {
    final p = world(e.localPosition);
    if (source != null) {
      setState(() => pointer = p);
      return;
    }
    if (panning) {
      setState(() => pan += e.localPosition - lastPointer!);
      lastPointer = e.localPosition;
      return;
    }
    if (dragging != null) {
      final next = p - dragOffset!;
      if (!moved && (next - machine.state(dragging!).position).distance < 2) {
        return;
      }
      if (!moved) {
        checkpoint();
        moved = true;
      }
      setState(() => machine.state(dragging!).position = next);
    }
  }

  void pointerUp(PointerUpEvent e) {
    if (moved) save();
    dragging = null;
    panning = false;
    moved = false;
    lastPointer = null;
  }

  void doubleClick(TapDownDetails e) {
    final p = world(e.localPosition),
        id = hitState(p),
        edge = hitEdge(p, routeEdges(machine));
    if (id == null && edge == null) {
      addState(p);
      return;
    }
    setState(() {
      selected = id;
      selectedEdge = id == null ? edge : null;
      popover = e.localPosition;
      source = null;
    });
  }

  KeyEventResult key(FocusNode node, KeyEvent e) {
    if (e is KeyUpEvent) {
      if (e.logicalKey == LogicalKeyboardKey.space) {
        setState(() => space = false);
      }
      return KeyEventResult.ignored;
    }
    if (e is! KeyDownEvent) return KeyEventResult.ignored;
    final editing =
        FocusManager.instance.primaryFocus?.context
            ?.findAncestorWidgetOfExactType<EditableText>() !=
        null;
    if (e.logicalKey == LogicalKeyboardKey.escape) {
      setState(() {
        popover = null;
        source = null;
        space = false;
      });
      focus.requestFocus();
      return KeyEventResult.handled;
    }
    if (editing) return KeyEventResult.ignored;
    final control =
        HardwareKeyboard.instance.isControlPressed ||
        HardwareKeyboard.instance.isMetaPressed;
    if (control && e.logicalKey == LogicalKeyboardKey.keyZ) {
      history(HardwareKeyboard.instance.isShiftPressed);
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.keyA &&
        !control &&
        !HardwareKeyboard.instance.isAltPressed &&
        selected != null) {
      final s = machine.state(selected!);
      change(() => s.setAccepting(!s.emits));
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.delete) {
      deleteSelection();
      return KeyEventResult.handled;
    }
    if (e.logicalKey == LogicalKeyboardKey.space) {
      setState(() => space = true);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Widget tool(IconData icon, String tooltip, VoidCallback? action) =>
      IconButton(
        tooltip: tooltip,
        onPressed: action,
        icon: Icon(icon, size: 19),
        visualDensity: VisualDensity.compact,
      );
  Widget panel(Widget child) => Material(
    color: Colors.white.withValues(alpha: .97),
    elevation: 2,
    shadowColor: ink.withValues(alpha: .15),
    borderRadius: BorderRadius.circular(10),
    child: child,
  );

  @override
  Widget build(BuildContext context) {
    final routes = routeEdges(machine);
    return Scaffold(
      body: Focus(
        focusNode: focus,
        autofocus: true,
        onKeyEvent: key,
        child: Column(
          children: [
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  canvasSize = constraints.biggest;
                  if (!_fitted) {
                    _fitted = true;
                    WidgetsBinding.instance.addPostFrameCallback(
                      (_) => fit(readable: true),
                    );
                  }
                  final narrow = canvasSize.width < 1100;
                  return Stack(
                    children: [
                      Positioned.fill(
                        child: MouseRegion(
                          cursor: space || panning
                              ? SystemMouseCursors.grab
                              : SystemMouseCursors.basic,
                          onHover: (e) {
                            if (source != null) {
                              setState(() => pointer = world(e.localPosition));
                            }
                          },
                          child: Listener(
                            onPointerDown: pointerDown,
                            onPointerMove: pointerMove,
                            onPointerUp: pointerUp,
                            onPointerCancel: (_) {
                              dragging = null;
                              panning = false;
                              space = false;
                            },
                            onPointerSignal: (e) {
                              if (e is PointerScrollEvent) {
                                GestureBinding.instance.pointerSignalResolver
                                    .register(
                                      e,
                                      (event) => zoomAt(
                                        e.localPosition,
                                        e.scrollDelta.dy > 0 ? 1 / 1.1 : 1.1,
                                      ),
                                    );
                              }
                            },
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onDoubleTapDown: doubleClick,
                              onDoubleTap: () {},
                              child: CustomPaint(
                                painter: DiagramPainter(
                                  machine: machine,
                                  routes: routes,
                                  pan: pan,
                                  zoom: zoom,
                                  selectedState: selected,
                                  selectedEdge: selectedEdge,
                                  source: source,
                                  pointer: pointer,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 16,
                        top: 16,
                        child: panel(
                          const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 13,
                              vertical: 8,
                            ),
                            child: Text(
                              'λ lexica',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w700,
                                color: ink,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        right: 16,
                        top: 16,
                        child: Row(
                          children: [
                            if (canvasSize.width > 800)
                              Padding(
                                padding: const EdgeInsets.only(right: 12),
                                child: Text(
                                  saveStatus,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey,
                                  ),
                                ),
                              ),
                            FilledButton.tonalIcon(
                              onPressed: importJson,
                              icon: const Icon(Icons.upload, size: 16),
                              label: const Text('Import'),
                            ),
                            const SizedBox(width: 8),
                            FilledButton.icon(
                              onPressed: export,
                              icon: const Icon(Icons.download, size: 16),
                              label: const Text('Export'),
                            ),
                          ],
                        ),
                      ),
                      Positioned(
                        left: narrow
                            ? 16
                            : math.max(160, (canvasSize.width - 390) / 2),
                        top: narrow ? 74 : 16,
                        child: panel(
                          Padding(
                            padding: const EdgeInsets.all(4),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                tool(
                                  Icons.add_circle_outline,
                                  'Add state',
                                  () => addState(
                                    world(canvasSize.center(Offset.zero)),
                                  ),
                                ),
                                tool(
                                  Icons.undo,
                                  'Undo · Ctrl/Cmd+Z',
                                  undo.isEmpty ? null : () => history(false),
                                ),
                                tool(
                                  Icons.redo,
                                  'Redo · Ctrl/Cmd+Shift+Z',
                                  redo.isEmpty ? null : () => history(true),
                                ),
                                tool(
                                  Icons.account_tree_outlined,
                                  'Compact auto layout',
                                  () {
                                    change(() => machine.autoLayout());
                                    fit(readable: true);
                                  },
                                ),
                                tool(Icons.fit_screen, 'Fit diagram', fit),
                                tool(
                                  Icons.remove,
                                  'Zoom out',
                                  () => zoomAt(
                                    canvasSize.center(Offset.zero),
                                    1 / 1.2,
                                  ),
                                ),
                                tool(
                                  Icons.add,
                                  'Zoom in',
                                  () => zoomAt(
                                    canvasSize.center(Offset.zero),
                                    1.2,
                                  ),
                                ),
                                tool(
                                  Icons.tune,
                                  'Properties',
                                  selected == null && selectedEdge == null
                                      ? null
                                      : () => setState(
                                          () => popover = canvasSize.center(
                                            Offset.zero,
                                          ),
                                        ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 16,
                        bottom: 42,
                        child: panel(
                          SizedBox(
                            width: 150,
                            height: 102,
                            child: LayoutBuilder(
                              builder: (context, c) {
                                final viewport = Rect.fromLTWH(
                                  -pan.dx / zoom,
                                  -pan.dy / zoom,
                                  canvasSize.width / zoom,
                                  canvasSize.height / zoom,
                                );
                                void navigate(Offset p) {
                                  final bounds =
                                          _mapDragBounds ??
                                          minimapBounds(
                                            machine,
                                            routes,
                                            viewport,
                                          ),
                                      scale = math.min(
                                        c.maxWidth / bounds.width,
                                        c.maxHeight / bounds.height,
                                      );
                                  final margin = Offset(
                                    (c.maxWidth - bounds.width * scale) / 2,
                                    (c.maxHeight - bounds.height * scale) / 2,
                                  );
                                  final target =
                                      (p - margin) / scale + bounds.topLeft;
                                  setState(() {
                                    pan =
                                        canvasSize.center(Offset.zero) -
                                        target * zoom;
                                    popover = null;
                                  });
                                }

                                return GestureDetector(
                                  onTapDown: (e) => navigate(e.localPosition),
                                  onPanStart: (_) => _mapDragBounds =
                                      minimapBounds(machine, routes, viewport),
                                  onPanEnd: (_) => _mapDragBounds = null,
                                  onPanCancel: () => _mapDragBounds = null,
                                  onPanUpdate: (e) => navigate(e.localPosition),
                                  child: CustomPaint(
                                    painter: MinimapPainter(
                                      machine,
                                      routes,
                                      viewport,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: 16,
                        right: 16,
                        bottom: 10,
                        child: Row(
                          children: [
                            Text(
                              '${machine.states.length} states · ${machine.edges.length} transitions',
                              style: const TextStyle(
                                fontSize: 10,
                                color: Color(0xff8c9a80),
                              ),
                            ),
                            const SizedBox(width: 15),
                            Expanded(
                              child: Text(
                                source == null
                                    ? 'Right-click to connect · Double-click for properties · A: accepting'
                                    : 'Choose destination · Esc to cancel',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: Color(0xff8c9a80),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (popover != null) properties(),
                    ],
                  );
                },
              ),
            ),
            tester(),
          ],
        ),
      ),
    );
  }

  Widget properties() {
    final fields = <Widget>[];
    if (selected != null) {
      final s = machine.state(selected!);
      fields.addAll([
        EditField(
          key: ValueKey('name-${s.id}'),
          label: 'State name',
          value: s.name,
          onCommit: (v) {
            if (v.trim().isEmpty) {
              throw const FormatException('State name cannot be empty.');
            }
            change(() => s.name = v.trim());
          },
        ),
        if (machine.start == null || machine.start == s.id)
          CheckboxListTile(
            title: const Text('Initial state'),
            value: machine.start == s.id,
            onChanged: (v) => change(() => machine.start = v! ? s.id : null),
          ),
        CheckboxListTile(
          title: const Text('Accepting state · A'),
          value: s.emits,
          onChanged: (v) => change(() => s.setAccepting(v!)),
        ),
        EditField(
          key: ValueKey('token-${s.id}-${s.emits}'),
          label: 'Token name',
          value: s.token,
          onCommit: (v) => change(() => s.token = v.trim()),
        ),
        CheckboxListTile(
          title: const Text('Skip token'),
          value: s.skip,
          onChanged: (v) => change(() => s.skip = v!),
        ),
      ]);
    } else if (selectedEdge != null && selectedEdge! < machine.edges.length) {
      final e = machine.edges[selectedEdge!];
      Widget endpoint(String label, String value, ValueChanged<String> apply) =>
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DropdownButtonFormField<String>(
              initialValue: value,
              decoration: InputDecoration(labelText: label),
              items: machine.states
                  .map(
                    (s) => DropdownMenuItem(value: s.id, child: Text(s.name)),
                  )
                  .toList(),
              onChanged: (v) => change(() => apply(v!)),
            ),
          );
      fields.addAll([
        endpoint('From', e.from, (v) => e.from = v),
        endpoint('To', e.to, (v) => e.to = v),
        EditField(
          key: ValueKey('edge-$selectedEdge'),
          label: 'Character expression',
          value: e.label,
          onCommit: (v) {
            characterMatcher(v);
            change(() => e.label = v);
          },
        ),
      ]);
    } else {
      return const SizedBox.shrink();
    }
    final position = popover!,
        width = math.min(260.0, canvasSize.width - 24),
        height = math.min(420.0, canvasSize.height - 90);
    return Positioned(
      left: (position.dx + 16).clamp(
        12,
        math.max(12, canvasSize.width - width - 12),
      ),
      top: (position.dy - 15).clamp(
        70,
        math.max(70, canvasSize.height - height - 12),
      ),
      child: SizedBox(
        width: width,
        child: panel(
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: height),
            child: SingleChildScrollView(
              child: Theme(
                data: Theme.of(context).copyWith(
                  listTileTheme: const ListTileThemeData(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                  checkboxTheme: const CheckboxThemeData(
                    visualDensity: VisualDensity.compact,
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Properties',
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                          tool(
                            Icons.close,
                            'Close properties',
                            () => setState(() => popover = null),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ...fields,
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: deleteSelection,
                          icon: const Icon(Icons.delete_outline, size: 15),
                          label: const Text('Delete'),
                          style: TextButton.styleFrom(
                            foregroundColor: const Color(0xffa66b5c),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget tester() {
    List<LexToken> tokens = [];
    String? error;
    try {
      tokens = machine
          .tokenize(input.text)
          .where((t) => showSkipped || !t.skip)
          .toList();
    } on FormatException catch (e) {
      error = e.message;
    }
    final output = error != null
        ? Text(error, style: const TextStyle(fontSize: 12, color: Colors.red))
        : tokens.isEmpty
        ? const Text(
            'Type input to see tokens.',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          )
        : SingleChildScrollView(
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: tokens
                  .map(
                    (t) => Tooltip(
                      message:
                          'Offset ${t.offset}${t.skip ? ' · skipped' : ''}',
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: t.token == 'ERROR'
                              ? const Color(0xffffeeeb)
                              : t.token == 'NUMBER'
                              ? const Color(0xfff9f1e1)
                              : const Color(0xfff1f6ea),
                          border: Border.all(color: const Color(0xffdde5d4)),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              t.token,
                              style: const TextStyle(
                                fontSize: 9,
                                color: Color(0xff82916e),
                              ),
                            ),
                            Text(
                              jsonEncode(t.value),
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          );
    return Container(
      height: collapsed ? 48 : 190,
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 12),
      decoration: const BoxDecoration(
        color: Color(0xfffcfdf9),
        border: Border(top: BorderSide(color: Color(0xffdde5d9))),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Lexer tester',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                ),
              ),
              Checkbox(
                value: showSkipped,
                onChanged: (v) => setState(() => showSkipped = v!),
              ),
              const Text('Show skipped', style: TextStyle(fontSize: 11)),
              tool(
                collapsed ? Icons.expand_less : Icons.expand_more,
                'Toggle tester',
                () => setState(() => collapsed = !collapsed),
              ),
            ],
          ),
          if (!collapsed)
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: TextField(
                      controller: input,
                      onChanged: (_) => setState(() {}),
                      maxLines: null,
                      expands: true,
                      style: const TextStyle(
                        fontSize: 12,
                        fontFamily: 'monospace',
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Input',
                        alignLabelWithHint: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xffdde5d9)),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: output,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Future<void> importJson() async {
    final controller = TextEditingController();
    String? error;
    final result = await showDialog<Machine>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) => AlertDialog(
          title: const Text('Import machine JSON'),
          content: SizedBox(
            width: 620,
            child: TextField(
              controller: controller,
              maxLines: 14,
              style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
              decoration: InputDecoration(
                hintText: 'Paste JSON exported from either version of Lexica.',
                errorText: error,
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                try {
                  Navigator.pop(context, Machine.decode(controller.text));
                } on FormatException catch (e) {
                  refresh(() => error = e.message);
                }
              },
              child: const Text('Import'),
            ),
          ],
        ),
      ),
    );
    if (result != null && mounted) {
      change(() {
        machine = result;
        selected = null;
        selectedEdge = null;
        source = null;
        popover = null;
      });
      fit();
    }
    // Dialog text fields finish their closing animation before disposal.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    controller.dispose();
  }

  Future<void> export() async {
    var standalone = true, json = false;
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) {
          final value = json
              ? machine.encode()
              : machine.toTikz(standalone: standalone);
          return AlertDialog(
            title: const Text('Export machine'),
            content: SizedBox(
              width: 720,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      DropdownButton<bool>(
                        value: json,
                        items: const [
                          DropdownMenuItem(
                            value: false,
                            child: Text('LaTeX / TikZ'),
                          ),
                          DropdownMenuItem(
                            value: true,
                            child: Text('Machine JSON'),
                          ),
                        ],
                        onChanged: (v) => refresh(() => json = v!),
                      ),
                      const Spacer(),
                      if (!json)
                        Flexible(
                          child: CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text(
                              'Full document',
                              style: TextStyle(fontSize: 12),
                            ),
                            value: standalone,
                            onChanged: (v) => refresh(() => standalone = v!),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: math.min(
                      360,
                      MediaQuery.sizeOf(context).height * .45,
                    ),
                    child: SingleChildScrollView(
                      child: SelectableText(
                        value,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
              FilledButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: value));
                  if (mounted) {
                    message('Copied ${json ? 'JSON' : 'TikZ'} to clipboard.');
                  }
                },
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('Copy'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class EditField extends StatefulWidget {
  const EditField({
    super.key,
    required this.label,
    required this.value,
    required this.onCommit,
  });
  final String label, value;
  final ValueChanged<String> onCommit;
  @override
  State<EditField> createState() => _EditFieldState();
}

class _EditFieldState extends State<EditField> {
  late final controller = TextEditingController(text: widget.value);
  String? error;
  void commit() {
    if (controller.text == widget.value) return;
    try {
      widget.onCommit(controller.text);
      setState(() => error = null);
    } on FormatException catch (e) {
      setState(() => error = e.message);
    }
  }

  @override
  void didUpdateWidget(covariant EditField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) controller.text = widget.value;
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: controller,
      style: const TextStyle(fontSize: 12),
      decoration: InputDecoration(labelText: widget.label, errorText: error),
      onSubmitted: (_) => commit(),
      onTapOutside: (_) {
        commit();
        FocusScope.of(context).unfocus();
      },
    ),
  );
}
