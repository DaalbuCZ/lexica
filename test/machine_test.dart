import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lexica/machine.dart';

void main() {
  test('longest match, skip, errors and UTF-16 offsets', () {
    final result = Machine.example().tokenize('hello_2 42😀');
    expect(result.map((t) => t.token), ['IDENT', 'WS', 'NUMBER', 'ERROR']);
    expect(result.map((t) => t.value), ['hello_2', ' ', '42', '😀']);
    expect(result.last.offset, 10);
    expect(result[1].skip, isTrue);
  });
  test('ambiguous transitions fail explicitly', () {
    final m = Machine.example();
    m.edges.add(Transition('s0', 's2', '[a-z]'));
    expect(() => m.tokenize('a'), throwsFormatException);
  });
  test('accepting toggles preserve custom token names', () {
    final m = Machine.example(), s = m.states[1];
    s.token = 'CUSTOM';
    s.setAccepting(false);
    expect(s.token, 'CUSTOM');
    expect(m.tokenize('a').single.token, 'ERROR');
    s.setAccepting(true);
    expect(m.tokenize('a').single.token, 'CUSTOM');
  });
  test('initial state can be unassigned, but is required for lexing', () {
    final m = Machine.example();
    m.start = null;
    expect(Machine.decode(m.encode()).start, isNull);
    expect(() => m.tokenize('a'), throwsFormatException);
    expect(m.toTikz(), isNot(contains('state,initial')));
    m.start = 's1';
    expect(RegExp('state,initial').allMatches(m.toTikz()).length, 1);
  });
  test('legacy JSON round trips with coordinates and token flags', () {
    final m = Machine.example();
    final raw = m.toJson();
    final states = raw['states']! as List<Map<String, Object?>>;
    states[1].remove('accepting');
    final clone = Machine.decode(jsonEncode(raw));
    expect(clone.states[1].emits, isTrue);
    expect(clone.toJson(), m.toJson());
  });
  test('import validates states, references and expressions', () {
    expect(() => Machine.decode('{'), throwsFormatException);
    final m = Machine.example();
    m.edges[0].to = 'missing';
    expect(() => Machine.decode(m.encode()), throwsFormatException);
    m.edges[0].to = 's1';
    m.edges[0].label = '[';
    expect(() => Machine.decode(m.encode()), throwsFormatException);
    expect(() => characterMatcher('a*'), throwsFormatException);
  });
  test('TikZ preserves geometry and escapes labels in standalone and snippet exports', () {
    final m = Machine.example();
    m.states[1].token = 'ID_%';
    final t = m.toTikz();
    expect(t, contains(r'\documentclass'));
    expect(t, contains('controls'));
    expect(t, contains(r'ID\_\%'));
    expect(t, contains(r'\textbackslash{}s'));
    expect(t, contains('state,initial'));
    expect(t, contains('state,accepting'));
    expect(m.toTikz(standalone: false), isNot(contains('documentclass')));
  });
  test('layout separates states and routes labels outside nodes', () {
    final m = Machine.example()..autoLayout();
    for (var i = 0; i < m.states.length; i++) {
      for (var j = i + 1; j < m.states.length; j++) {
        expect(
          (m.states[i].position - m.states[j].position).distance,
          greaterThanOrEqualTo(160),
        );
      }
    }
    final routes = routeEdges(m);
    for (final r in routes) {
      for (final s in m.states) {
        expect((r.label - s.position).distance, greaterThan(45));
      }
    }
    for (var i = 0; i < routes.length; i++) {
      for (var j = i + 1; j < routes.length; j++) {
        expect(routes[i].labelBox.overlaps(routes[j].labelBox), isFalse);
      }
    }
  });
}
