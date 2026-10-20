import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'machine.dart';

const ink = Color(0xff386b4e);
const paper = Color(0xfffafcf8);

Rect diagramBounds(Machine machine, List<EdgeRoute> routes) {
  var bounds = Rect.fromCircle(
    center: machine.states.first.position,
    radius: 90,
  );
  for (final s in machine.states) {
    bounds = bounds.expandToInclude(
      Rect.fromCircle(center: s.position, radius: 90),
    );
  }
  for (final r in routes) {
    bounds = bounds
        .expandToInclude(r.path.getBounds())
        .expandToInclude(r.labelBox);
  }
  return bounds;
}

class DiagramPainter extends CustomPainter {
  DiagramPainter({
    required this.machine,
    required this.routes,
    required this.pan,
    required this.zoom,
    this.selectedState,
    this.selectedEdge,
    this.source,
    this.pointer,
  });
  final Machine machine;
  final List<EdgeRoute> routes;
  final Offset pan;
  final double zoom;
  final String? selectedState, source;
  final int? selectedEdge;
  final Offset? pointer;

  void text(
    Canvas canvas,
    String value,
    Offset center, {
    double size = 12,
    Color color = ink,
    double maxWidth = double.infinity,
  }) {
    final tp = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(fontSize: size, color: color, fontFamily: 'monospace'),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    final factor = math.min(1.0, maxWidth / tp.width);
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.scale(factor);
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
    canvas.restore();
  }

  void arrow(Canvas canvas, Offset tip, Offset tangent, Color color) {
    final angle = math.atan2(tangent.dy, tangent.dx);
    canvas.drawPath(
      Path()
        ..moveTo(tip.dx, tip.dy)
        ..lineTo(
          tip.dx - 9 * math.cos(angle - .45),
          tip.dy - 9 * math.sin(angle - .45),
        )
        ..lineTo(
          tip.dx - 9 * math.cos(angle + .45),
          tip.dy - 9 * math.sin(angle + .45),
        )
        ..close(),
      Paint()..color = color,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawColor(paper, BlendMode.src);
    final step = math.max(12.0, 24 * zoom),
        dots = Paint()..color = const Color(0xffdce5d5);
    for (var x = pan.dx % step; x < size.width; x += step) {
      for (var y = pan.dy % step; y < size.height; y += step) {
        canvas.drawCircle(Offset(x, y), .7, dots);
      }
    }
    canvas.save();
    canvas.translate(pan.dx, pan.dy);
    canvas.scale(zoom);
    for (var i = 0; i < routes.length; i++) {
      final r = routes[i],
          color = i == selectedEdge ? ink : const Color(0xff7d9074);
      canvas.drawPath(
        r.path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = i == selectedEdge ? 2.5 : 1.5,
      );
      arrow(canvas, r.p3, r.p3 - r.c2, color);
      canvas.drawRRect(
        RRect.fromRectAndRadius(r.labelBox, const Radius.circular(3)),
        Paint()..color = paper,
      );
      text(
        canvas,
        machine.edges[i].label,
        r.label,
        size: 11,
        color: const Color(0xff6e805f),
      );
    }
    for (final s in machine.states) {
      final p = s.position;
      if (s.id == machine.start) {
        canvas.drawLine(
          p - const Offset(85, 0),
          p - const Offset(40, 0),
          Paint()
            ..color = const Color(0xff7d9074)
            ..strokeWidth = 1.5,
        );
        arrow(
          canvas,
          p - const Offset(40, 0),
          const Offset(1, 0),
          const Color(0xff7d9074),
        );
      }
      canvas.drawCircle(
        p,
        36,
        Paint()
          ..color = s.id == selectedState ? const Color(0xffeaf1e2) : paper,
      );
      final stroke = Paint()
        ..color = s.id == selectedState ? ink : const Color(0xff8b9d7d)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6;
      canvas.drawCircle(p, 36, stroke);
      if (s.emits) canvas.drawCircle(p, 31, stroke..strokeWidth = 1);
      if (s.id == source) {
        canvas.drawCircle(
          p,
          40,
          Paint()
            ..color = ink
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }
      text(canvas, s.name, p, maxWidth: 61);
      if (s.emits) {
        text(
          canvas,
          '${s.token}${s.skip ? ' · skip' : ''}',
          p + const Offset(0, 57),
          size: 9,
          color: const Color(0xff8a9a7a),
        );
      }
    }
    if (source != null && pointer != null) {
      canvas.drawLine(
        machine.state(source!).position,
        pointer!,
        Paint()
          ..color = ink.withValues(alpha: .5)
          ..strokeWidth = 1.5,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant DiagramPainter oldDelegate) => true;
}

Rect minimapBounds(Machine machine, List<EdgeRoute> routes, Rect viewport) =>
    diagramBounds(machine, routes).expandToInclude(viewport).inflate(50);

class MinimapPainter extends CustomPainter {
  MinimapPainter(this.machine, this.routes, this.viewport);
  final Machine machine;
  final List<EdgeRoute> routes;
  final Rect viewport;
  @override
  void paint(Canvas canvas, Size size) {
    final bounds = minimapBounds(machine, routes, viewport),
        scale = math.min(
          size.width / bounds.width,
          size.height / bounds.height,
        );
    canvas.save();
    canvas.translate(
      (size.width - bounds.width * scale) / 2,
      (size.height - bounds.height * scale) / 2,
    );
    canvas.scale(scale);
    canvas.translate(-bounds.left, -bounds.top);
    for (final r in routes) {
      canvas.drawPath(
        r.path,
        Paint()
          ..color = const Color(0xffa4b397)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1 / scale,
      );
    }
    for (final s in machine.states) {
      canvas.drawCircle(
        s.position,
        22,
        Paint()..color = const Color(0xff839b70),
      );
    }
    canvas.drawRect(viewport, Paint()..color = ink.withValues(alpha: .08));
    canvas.drawRect(
      viewport,
      Paint()
        ..color = ink.withValues(alpha: .6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1 / scale,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant MinimapPainter oldDelegate) => true;
}
