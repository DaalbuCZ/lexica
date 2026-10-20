import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui';

String _characterAt(String input, int offset) {
  final code = input.codeUnitAt(offset);
  final pair =
      code >= 0xd800 &&
      code <= 0xdbff &&
      offset + 1 < input.length &&
      input.codeUnitAt(offset + 1) >= 0xdc00 &&
      input.codeUnitAt(offset + 1) <= 0xdfff;
  return input.substring(offset, offset + (pair ? 2 : 1));
}

class FsmState {
  FsmState({
    required this.id,
    required this.name,
    required this.position,
    this.token = '',
    this.accepting = true,
    this.skip = false,
  });
  final String id;
  String name, token;
  Offset position;
  bool accepting, skip;
  bool get emits => accepting && token.isNotEmpty;
  void setAccepting(bool value) {
    accepting = value;
    if (value && token.isEmpty) token = name.toUpperCase();
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'token': token,
    'x': position.dx,
    'y': position.dy,
    'accepting': accepting,
    'skip': skip,
  };
}

class Transition {
  Transition(this.from, this.to, this.label);
  String from, to, label;
  Map<String, String> toJson() => {'from': from, 'to': to, 'label': label};
}

class LexToken {
  const LexToken(this.token, this.value, this.offset, {this.skip = false});
  final String token, value;
  final int offset;
  final bool skip;
}

RegExp characterMatcher(String expression) {
  if (expression.isEmpty) {
    throw const FormatException('Enter a character expression.');
  }
  try {
    final result = RegExp('^(?:$expression)\$', unicode: true);
    if (result.hasMatch('')) {
      throw const FormatException('Transitions must consume a character.');
    }
    return result;
  } on FormatException {
    rethrow;
  } catch (_) {
    throw FormatException('Invalid character expression: $expression');
  }
}

class Machine {
  Machine(this.states, this.edges, this.start);
  final List<FsmState> states;
  final List<Transition> edges;
  String? start;
  FsmState state(String id) => states.firstWhere((s) => s.id == id);
  String encode() => const JsonEncoder.withIndent('  ').convert(toJson());
  Map<String, Object?> toJson() => {
    'start': start,
    'states': states.map((s) => s.toJson()).toList(),
    'edges': edges.map((e) => e.toJson()).toList(),
  };
  Machine copy() => Machine.decode(encode());

  static Machine decode(String source) {
    if (source.length > 1000000) {
      throw const FormatException('Maximum machine size is 1 MB.');
    }
    try {
      final json = jsonDecode(source) as Map<String, dynamic>;
      final states = (json['states'] as List).map((raw) {
        final s = raw as Map<String, dynamic>;
        final position = Offset(
          (s['x'] as num).toDouble(),
          (s['y'] as num).toDouble(),
        );
        if (!position.dx.isFinite || !position.dy.isFinite) {
          throw const FormatException('Invalid position.');
        }
        return FsmState(
          id: s['id'] as String,
          name: s['name'] as String,
          position: position,
          token: s['token'] as String,
          accepting: s['accepting'] as bool? ?? true,
          skip: s['skip'] as bool? ?? false,
        );
      }).toList();
      if (states.isEmpty ||
          states.any((s) => s.id.isEmpty || s.name.trim().isEmpty) ||
          states.map((s) => s.id).toSet().length != states.length) {
        throw const FormatException(
          'States need unique IDs and nonempty names.',
        );
      }
      final ids = states.map((s) => s.id).toSet();
      final start = json['start'] as String?;
      if (start != null && !ids.contains(start)) {
        throw const FormatException('Unknown initial state.');
      }
      final edges = (json['edges'] as List).map((raw) {
        final e = raw as Map<String, dynamic>;
        final edge = Transition(
          e['from'] as String,
          e['to'] as String,
          e['label'] as String,
        );
        if (!ids.contains(edge.from) || !ids.contains(edge.to)) {
          throw const FormatException('Unknown transition state.');
        }
        characterMatcher(edge.label);
        return edge;
      }).toList();
      return Machine(states, edges, start);
    } on FormatException {
      rethrow;
    } catch (_) {
      throw const FormatException('Invalid machine JSON.');
    }
  }

  List<LexToken> tokenize(String input) {
    if (start == null) {
      throw const FormatException('Choose an initial state to test the lexer.');
    }
    final matchers = edges.map((e) => characterMatcher(e.label)).toList();
    final result = <LexToken>[];
    var pos = 0;
    while (pos < input.length) {
      var current = start!, end = pos, lastEnd = pos;
      FsmState? last;
      while (end < input.length) {
        final char = _characterAt(input, end);
        final matches = <int>[];
        for (var i = 0; i < edges.length; i++) {
          if (edges[i].from == current && matchers[i].hasMatch(char)) {
            matches.add(i);
          }
        }
        if (matches.length > 1) {
          throw FormatException(
            'Ambiguous transitions from ${state(current).name} on ${jsonEncode(char)}.',
          );
        }
        if (matches.isEmpty) break;
        current = edges[matches.single].to;
        end += char.length;
        final candidate = state(current);
        if (candidate.emits) {
          last = candidate;
          lastEnd = end;
        }
      }
      if (last == null) {
        final char = _characterAt(input, pos);
        result.add(LexToken('ERROR', char, pos));
        pos += char.length;
      } else {
        result.add(
          LexToken(
            last.token,
            input.substring(pos, lastEnd),
            pos,
            skip: last.skip,
          ),
        );
        pos = lastEnd;
      }
    }
    return result;
  }

  void autoLayout() {
    final root = start ?? states.first.id;
    final levels = <String, int>{root: 0}, queue = <String>[root];
    for (var i = 0; i < queue.length; i++) {
      for (final edge in edges.where((e) => e.from == queue[i])) {
        if (!levels.containsKey(edge.to)) {
          levels[edge.to] = levels[queue[i]]! + 1;
          queue.add(edge.to);
        }
      }
    }
    var last = levels.values.reduce(math.max);
    for (final s in states) {
      levels.putIfAbsent(s.id, () => ++last);
    }
    final columns = <int, List<FsmState>>{};
    for (final s in states) {
      columns.putIfAbsent(levels[s.id]!, () => []).add(s);
    }
    final height = columns.values.map((c) => c.length).reduce(math.max) * 160.0;
    for (final entry in columns.entries) {
      for (var i = 0; i < entry.value.length; i++) {
        entry.value[i].position = Offset(
          160 + entry.key * 220,
          150 + (height - entry.value.length * 160) / 2 + i * 160,
        );
      }
    }
  }

  String toTikz({bool standalone = true}) {
    final names = {for (var i = 0; i < states.length; i++) states[i].id: 'q$i'};
    String coord(Offset p) =>
        '(${(p.dx / 60).toStringAsFixed(3)},${(-p.dy / 60).toStringAsFixed(3)})';
    final out = StringBuffer(
      r'\begin{tikzpicture}[>=stealth,semithick,'
      '\n'
      r'  every state/.style={minimum size=12mm,inner sep=0pt,font=\scriptsize}]'
      '\n',
    );
    for (final s in states) {
      final options = [
        'state',
        if (s.id == start) 'initial,initial text={}',
        if (s.emits)
          'accepting,label=below:{\\scriptsize\\texttt{${tex(s.token)}${s.skip ? ' (skip)' : ''}}}',
      ];
      out.writeln(
        '  \\node[${options.join(',')}] (${names[s.id]}) at ${coord(s.position)} {\\resizebox{10mm}{!}{\\strut ${tex(s.name)}}};',
      );
    }
    final routes = routeEdges(this);
    for (var i = 0; i < edges.length; i++) {
      final r = routes[i];
      out.writeln(
        '  \\draw[->] ${coord(r.p0)} .. controls ${coord(r.c1)} and ${coord(r.c2)} .. ${coord(r.p3)};',
      );
      out.writeln(
        '  \\node[fill=white,inner sep=2pt,font=\\scriptsize] at ${coord(r.label - const Offset(0, 4))} {\\texttt{${tex(edges[i].label)}}};',
      );
    }
    out.writeln(r'\end{tikzpicture}');
    if (!standalone) return out.toString();
    return r'\documentclass[tikz,border=10pt]{standalone}'
        '\n'
        r'\usepackage[T1]{fontenc}'
        '\n'
        r'\usepackage{graphicx}'
        '\n'
        r'\usetikzlibrary{automata,positioning,arrows}'
        '\n'
        r'\begin{document}'
        '\n$out'
        r'\end{document}'
        '\n';
  }

  static Machine example() => Machine(
    [
      FsmState(id: 's0', name: 'start', position: const Offset(160, 310)),
      FsmState(
        id: 's1',
        name: 'identifier',
        token: 'IDENT',
        position: const Offset(380, 150),
      ),
      FsmState(
        id: 's2',
        name: 'number',
        token: 'NUMBER',
        position: const Offset(380, 310),
      ),
      FsmState(
        id: 's3',
        name: 'whitespace',
        token: 'WS',
        skip: true,
        position: const Offset(380, 470),
      ),
    ],
    [
      Transition('s0', 's1', r'[a-zA-Z_]'),
      Transition('s1', 's1', r'[a-zA-Z0-9_]'),
      Transition('s0', 's2', r'[0-9]'),
      Transition('s2', 's2', r'[0-9]'),
      Transition('s0', 's3', r'\s'),
      Transition('s3', 's3', r'\s'),
    ],
    's0',
  );
}

String tex(String value) => value
    .split('')
    .map(
      (c) =>
          const {
            r'\': r'\textbackslash{}',
            '{': r'\{',
            '}': r'\}',
            r'$': r'\$',
            '&': r'\&',
            '#': r'\#',
            '%': r'\%',
            '_': r'\_',
            '^': r'\textasciicircum{}',
            '~': r'\textasciitilde{}',
          }[c] ??
          c,
    )
    .join();

class EdgeRoute {
  EdgeRoute(this.p0, this.c1, this.c2, this.p3, String text) {
    label = sample(.5) - const Offset(0, 13);
    labelBox = Rect.fromCenter(
      center: label,
      width: text.length * 7 + 14,
      height: 22,
    );
  }
  final Offset p0, c1, c2, p3;
  late final Offset label;
  late final Rect labelBox;
  Offset sample(double t) {
    final a = Offset.lerp(p0, c1, t)!,
        b = Offset.lerp(c1, c2, t)!,
        c = Offset.lerp(c2, p3, t)!;
    return Offset.lerp(Offset.lerp(a, b, t), Offset.lerp(b, c, t), t)!;
  }

  Path get path => Path()
    ..moveTo(p0.dx, p0.dy)
    ..cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p3.dx, p3.dy);
}

List<EdgeRoute> routeEdges(Machine m) {
  final reserved = m.states
      .expand(
        (s) => [
          Rect.fromCenter(center: s.position, width: 90, height: 90),
          if (s.emits)
            Rect.fromCenter(
              center: s.position + const Offset(0, 57),
              width: math.max(70, s.token.length * 7).toDouble(),
              height: 20,
            ),
        ],
      )
      .toList();
  final routes = List<EdgeRoute?>.filled(m.edges.length, null);
  final order = List<int>.generate(m.edges.length, (i) => i)
    ..sort(
      (a, b) => (m.edges[a].from == m.edges[a].to ? 0 : 1).compareTo(
        m.edges[b].from == m.edges[b].to ? 0 : 1,
      ),
    );
  for (final i in order) {
    final e = m.edges[i], a = m.state(e.from), b = m.state(e.to);
    EdgeRoute? best;
    var bestScore = double.infinity;
    for (var attempt = 0; attempt < 31; attempt++) {
      late EdgeRoute r;
      if (a == b) {
        final size = 80 + (attempt ~/ 4) * 25.0,
            angle = (attempt % 4) * math.pi / 2;
        Offset rotate(double x, double y) =>
            a.position +
            Offset(
              x * math.cos(angle) - y * math.sin(angle),
              x * math.sin(angle) + y * math.cos(angle),
            );
        r = EdgeRoute(
          rotate(-22, -29),
          rotate(-size, -size * 1.45),
          rotate(size, -size * 1.45),
          rotate(22, -29),
          e.label,
        );
      } else {
        final delta = b.position - a.position, length = delta.distance;
        final unit = length == 0 ? const Offset(1, 0) : delta / length;
        final reverse = m.edges.any((x) => x.from == e.to && x.to == e.from);
        final bend =
            (attempt == 0
                ? 0
                : ((attempt + 1) ~/ 2) * 65 * (attempt.isOdd ? 1 : -1)) +
            (reverse ? 45 : 0);
        final mid =
            (a.position + b.position) / 2 +
            Offset(-unit.dy, unit.dx) * bend.toDouble();
        Offset endpoint(Offset origin, double radius) {
          final d = mid - origin;
          return origin + (d.distance == 0 ? unit : d / d.distance) * radius;
        }

        final p0 = endpoint(a.position, 37), p3 = endpoint(b.position, 42);
        r = EdgeRoute(
          p0,
          Offset.lerp(p0, mid, 2 / 3)!,
          Offset.lerp(p3, mid, 2 / 3)!,
          p3,
          e.label,
        );
      }
      var score = attempt * .1;
      for (final box in reserved) {
        if (r.labelBox.inflate(8).overlaps(box)) score += 1000;
      }
      for (var t = .12; t < .9; t += .08) {
        final p = r.sample(t);
        for (final s in m.states) {
          if (s != a && s != b && (p - s.position).distance < 65) score += 500;
        }
      }
      if (score < bestScore) {
        best = r;
        bestScore = score;
      }
      if (score < 1) break;
    }
    routes[i] = best!;
    reserved.add(best.labelBox);
  }
  return routes.cast<EdgeRoute>();
}
