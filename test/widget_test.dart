import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lexica/main.dart';
import 'package:lexica/machine.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('editor shows canvas, tester, export and layout controls', (
    tester,
  ) async {
    await tester.pumpWidget(LexicaApp(initial: Machine.example()));
    await tester.pumpAndSettle();
    expect(find.text('Lexer tester'), findsOneWidget);
    expect(find.text('Export'), findsOneWidget);
    expect(find.byTooltip('Compact auto layout'), findsOneWidget);
    expect(find.text('"hello"'), findsOneWidget);
    await tester.tap(find.text('Export'));
    await tester.pumpAndSettle();
    expect(find.text('LaTeX / TikZ'), findsOneWidget);
    expect(find.text('Copy'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'adding a state opens properties; A toggles accepting without changing token',
    (tester) async {
      await tester.pumpWidget(LexicaApp(initial: Machine.example()));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add state'));
      await tester.pumpAndSettle();
      expect(find.text('Properties'), findsOneWidget);
      expect(find.text('Initial state'), findsNothing);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
      await tester.pumpAndSettle();
      final check = tester.widget<CheckboxListTile>(
        find.widgetWithText(CheckboxListTile, 'Accepting state · A'),
      );
      expect(check.value, isTrue);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CheckboxListTile>(
              find.widgetWithText(CheckboxListTile, 'Accepting state · A'),
            )
            .value,
        isFalse,
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.text('Properties'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'autosave persists accepting status and shortcuts ignore text fields',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final storage = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        LexicaApp(initial: Machine.example(), storage: storage),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add state'));
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
      await tester.pumpAndSettle();
      final saved = Machine.decode(storage.getString('lexica-machine')!);
      expect(saved.states.last.emits, isTrue);
      final field = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'Token name',
      );
      await tester.tap(field);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CheckboxListTile>(
              find.widgetWithText(CheckboxListTile, 'Accepting state · A'),
            )
            .value,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
