import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The Markdown an assistant actually writes, rendered as rich text.
///
/// Headings, ordered and bulleted lists, paragraphs, bold, italic and inline
/// code. The model reaches for `**bold**` and numbered lists whatever it is
/// told, and printing those literally is what made the replies read as source
/// code rather than as answers.
///
/// Deliberately hand-rolled rather than pulling in a Markdown package: this
/// needs one small, predictable subset that matches the web app's renderer, and
/// the widely used Flutter package for it has been discontinued. Nothing here
/// interprets HTML — a reply is text, and it is drawn as text.
class MarkdownText extends StatelessWidget {
  const MarkdownText({
    super.key,
    required this.text,
    required this.color,
    this.strongColor,
    this.fontSize = 13.5,
  });

  final String text;

  /// Body colour. [strongColor] defaults to it, one step firmer where given.
  final Color color;
  final Color? strongColor;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final strong = strongColor ?? color;
    final blocks = _parse(text);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < blocks.length; i++) ...[
          if (i > 0) SizedBox(height: blocks[i].tightWithPrevious ? 4 : 10),
          _build(context, blocks[i], strong, c),
        ],
      ],
    );
  }

  Widget _build(BuildContext context, _Block b, Color strong, AppColors c) {
    switch (b.kind) {
      case _Kind.heading:
        return SelectableText.rich(
          _spans(b.text, strong, c, bold: true),
          style: TextStyle(
            color: strong,
            fontSize: fontSize + 1,
            height: 1.35,
            fontWeight: FontWeight.w700,
          ),
        );

      case _Kind.bullet:
      case _Kind.numbered:
        return Padding(
          padding: EdgeInsets.only(left: b.indented ? 16 : 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // A fixed-width marker column keeps wrapped lines aligned under
              // the text rather than under the bullet.
              SizedBox(
                width: b.kind == _Kind.numbered ? 22 : 14,
                child: Text(
                  b.kind == _Kind.numbered ? '${b.number}.' : '•',
                  style: TextStyle(
                    color: color.withValues(alpha: 0.7),
                    fontSize: fontSize,
                    height: 1.5,
                  ),
                ),
              ),
              Expanded(
                child: SelectableText.rich(
                  _spans(b.text, strong, c),
                  style: TextStyle(color: color, fontSize: fontSize, height: 1.5),
                ),
              ),
            ],
          ),
        );

      case _Kind.paragraph:
        return SelectableText.rich(
          _spans(b.text, strong, c),
          style: TextStyle(color: color, fontSize: fontSize, height: 1.5),
        );
    }
  }

  /* ------------------------------------------------------------- inline */

  static final _inline = RegExp(
    r'`([^`]+)`'
    r'|(\*\*|__)(.+?)\2'
    r'|(?<![\w*])(\*|_)(?!\s)(.+?)(?<!\s)\4(?![\w*])',
    dotAll: true,
  );

  TextSpan _spans(String src, Color strong, AppColors c, {bool bold = false}) {
    final out = <TextSpan>[];
    var last = 0;

    for (final m in _inline.allMatches(src)) {
      if (m.start > last) out.add(TextSpan(text: src.substring(last, m.start)));

      if (m.group(1) != null) {
        out.add(TextSpan(
          text: m.group(1),
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: fontSize - 0.5,
            backgroundColor: c.subtle,
          ),
        ));
      } else if (m.group(3) != null) {
        out.add(TextSpan(
          text: m.group(3),
          style: TextStyle(fontWeight: FontWeight.w700, color: strong),
        ));
      } else if (m.group(5) != null) {
        out.add(TextSpan(
          text: m.group(5),
          style: const TextStyle(fontStyle: FontStyle.italic),
        ));
      }
      last = m.end;
    }

    if (last < src.length) out.add(TextSpan(text: src.substring(last)));
    return TextSpan(
      children: out,
      style: bold ? const TextStyle(fontWeight: FontWeight.w700) : null,
    );
  }

  /* -------------------------------------------------------------- blocks */

  static final _bullet = RegExp(r'^(\s*)[-*•]\s+(.*)$');
  static final _numbered = RegExp(r'^(\s*)(\d+)[.)]\s+(.*)$');
  static final _heading = RegExp(r'^(#{1,4})\s+(.*)$');

  static List<_Block> _parse(String src) {
    final lines = src.replaceAll('\r\n', '\n').split('\n');
    final out = <_Block>[];
    final para = <String>[];

    void flush() {
      if (para.isEmpty) return;
      out.add(_Block(_Kind.paragraph, para.join(' ')));
      para.clear();
    }

    for (final line in lines) {
      if (line.trim().isEmpty) {
        flush();
        continue;
      }

      final h = _heading.firstMatch(line);
      if (h != null) {
        flush();
        out.add(_Block(_Kind.heading, h.group(2)!));
        continue;
      }

      final n = _numbered.firstMatch(line);
      if (n != null) {
        flush();
        out.add(_Block(
          _Kind.numbered,
          n.group(3)!,
          number: int.tryParse(n.group(2)!) ?? 1,
          indented: n.group(1)!.length >= 2,
          tightWithPrevious: out.isNotEmpty && out.last.isListItem,
        ));
        continue;
      }

      final b = _bullet.firstMatch(line);
      if (b != null) {
        flush();
        out.add(_Block(
          _Kind.bullet,
          b.group(2)!,
          indented: b.group(1)!.length >= 2,
          tightWithPrevious: out.isNotEmpty && out.last.isListItem,
        ));
        continue;
      }

      // A plain line under a list item is that item continuing, not a new
      // paragraph — models wrap long bullets across lines.
      if (para.isEmpty && out.isNotEmpty && out.last.isListItem) {
        out[out.length - 1] = out.last.append(line.trim());
        continue;
      }

      para.add(line.trim());
    }

    flush();
    return out;
  }
}

enum _Kind { paragraph, heading, bullet, numbered }

@immutable
class _Block {
  const _Block(
    this.kind,
    this.text, {
    this.number = 1,
    this.indented = false,
    this.tightWithPrevious = false,
  });

  final _Kind kind;
  final String text;
  final int number;
  final bool indented;

  /// Items in one run sit closer together than separate blocks do.
  final bool tightWithPrevious;

  bool get isListItem => kind == _Kind.bullet || kind == _Kind.numbered;

  _Block append(String more) => _Block(
        kind,
        '$text $more',
        number: number,
        indented: indented,
        tightWithPrevious: tightWithPrevious,
      );
}
