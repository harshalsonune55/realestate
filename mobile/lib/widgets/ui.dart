import 'dart:convert';

import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

/// Shared primitives, the Dart counterpart of `src/components/ui.tsx`.
/// Same names, same tones, so a change on one side is easy to mirror.

enum Tone { neutral, good, warn, bad, info, gold }

({Color bg, Color fg, Color border}) toneColors(
  BuildContext context,
  Tone tone,
) {
  final c = context.c;
  switch (tone) {
    case Tone.good:
      return (bg: c.brand50, fg: c.brand700, border: c.brand200);
    case Tone.warn:
      return (bg: c.amber50, fg: c.amber800, border: c.amber200);
    case Tone.bad:
      return (bg: c.red50, fg: c.red800, border: c.red200);
    case Tone.info:
      return (bg: c.sky50, fg: c.sky800, border: c.sky200);
    case Tone.gold:
      return (bg: c.gold50, fg: c.gold700, border: c.gold200);
    case Tone.neutral:
      return (bg: c.subtle, fg: c.fgSoft, border: c.line);
  }
}

/// Formats to the compact AED figures the dashboard uses (AED 1.2M).
String aedShort(num v) {
  if (v.abs() >= 1000000) return 'AED ${(v / 1000000).toStringAsFixed(1)}M';
  if (v.abs() >= 1000) return 'AED ${(v / 1000).toStringAsFixed(0)}K';
  return 'AED ${v.toStringAsFixed(0)}';
}

String aed(num v) {
  final s = v.round().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  return 'AED $buf';
}

String fmtDate(DateTime d) {
  const m = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${d.day} ${m[d.month - 1]} ${d.year}';
}

String relativeDays(int days) {
  if (days == 0) return 'today';
  if (days == 1) return 'tomorrow';
  if (days == -1) return 'yesterday';
  return days < 0 ? '${-days} days ago' : 'in $days days';
}

// ------------------------------------------------------------------- surfaces

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding, this.onTap});
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final body = Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.line),
      ),
      child: child,
    );
    if (onTap == null) return body;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: body,
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.sub,
    this.trailing,
  });
  final String title;
  final String? sub;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (sub != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      sub!,
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

// --------------------------------------------------------------------- badges

class StatusBadge extends StatelessWidget {
  const StatusBadge(
    this.label, {
    super.key,
    this.tone = Tone.neutral,
    this.dot = true,
  });
  final String label;
  final Tone tone;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    final t = toneColors(context, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: t.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot)
            Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.only(right: 5),
              decoration: BoxDecoration(
                color: t.fg.withValues(alpha: 0.7),
                shape: BoxShape.circle,
              ),
            ),
          Text(
            label,
            style: TextStyle(
              color: t.fg,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

Tone chequeTone(ChequeStatus s) => switch (s) {
  ChequeStatus.cleared => Tone.good,
  ChequeStatus.deposited => Tone.info,
  ChequeStatus.bounced => Tone.bad,
  _ => Tone.neutral,
};

Tone contractTone(ContractStatus s) => switch (s) {
  ContractStatus.active => Tone.good,
  ContractStatus.expiring || ContractStatus.pendingApproval => Tone.warn,
  ContractStatus.renewed => Tone.info,
  ContractStatus.rejected => Tone.bad,
  _ => Tone.neutral,
};

// ---------------------------------------------------------------------- stats

class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.sub,
    this.tone = Tone.neutral,
    this.onTap,
  });
  final String label, value;
  final String? sub;
  final Tone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final accent = switch (tone) {
      Tone.good => c.brand600,
      Tone.warn => c.amber700,
      Tone.bad => c.red700,
      Tone.info => c.sky700,
      Tone.gold => c.gold600,
      Tone.neutral => c.fg,
    };
    // Hairline down the leading edge carrying the tone, matching the web
    // dashboard. A full tinted card would shout on a cream canvas.
    final rail = switch (tone) {
      Tone.good => c.brand400,
      Tone.warn => c.amber400,
      Tone.bad => c.red200,
      Tone.info => c.sky200,
      Tone.gold => c.gold200,
      Tone.neutral => c.lineStrong,
    };
    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 3,
              decoration: BoxDecoration(
                color: rail,
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(14),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(11, 13, 13, 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label.toUpperCase(),
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 7),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        value,
                        style: TextStyle(
                          color: accent,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ),
                    if (sub != null) ...[
                      const SizedBox(height: 5),
                      // One line only: two lines overflow the tile on a 375pt
                      // screen.
                      Flexible(
                        child: Text(
                          sub!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: c.muted,
                            fontSize: 11,
                            height: 1.3,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------- progress

class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.value, this.tone = Tone.good});
  final double value;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final fill = switch (tone) {
      Tone.good => c.brand500,
      Tone.warn => c.amber500,
      Tone.bad => c.red500,
      Tone.info => c.sky500,
      Tone.gold => c.gold500,
      Tone.neutral => c.faint,
    };
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: LinearProgressIndicator(
        value: value.clamp(0, 1),
        minHeight: 6,
        backgroundColor: c.subtle,
        valueColor: AlwaysStoppedAnimation(fill),
      ),
    );
  }
}

// ---------------------------------------------------------------------- empty

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, this.sub, this.icon});
  final String title;
  final String? sub;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.line, style: BorderStyle.solid),
      ),
      child: Column(
        children: [
          if (icon != null)
            Container(
              width: 40,
              height: 40,
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: c.subtle,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 19, color: c.faint),
            ),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: c.fgSoft,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (sub != null) ...[
            const SizedBox(height: 4),
            Text(
              sub!,
              textAlign: TextAlign.center,
              style: TextStyle(color: c.muted, fontSize: 12.5, height: 1.4),
            ),
          ],
        ],
      ),
    );
  }
}

// --------------------------------------------------------------------- button

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.tone = Tone.good,
    this.expand = true,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Tone tone;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final enabled = onPressed != null;
    final bg = !enabled
        ? c.subtleHover
        : tone == Tone.bad
        ? c.red600
        : c.brandSolid;
    final fg = enabled ? Colors.white : c.faint;

    return SizedBox(
      width: expand ? double.infinity : null,
      height: 48,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onPressed,
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 17, color: fg),
                  const SizedBox(width: 8),
                ],
                Text(
                  label,
                  style: TextStyle(
                    color: fg,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A labelled row used on detail screens, matching the web app's KV component.
class KeyValueRow extends StatelessWidget {
  const KeyValueRow(
    this.label,
    this.value, {
    super.key,
    this.strong = false,
    this.valueColor,
  });
  final String label, value;
  final bool strong;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: c.muted, fontSize: 12.5),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? c.fg,
                fontSize: 13,
                fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// --------------------------------------------------------------------- avatar

/// Employee avatar: the uploaded profile picture when there is one, initials
/// on a brand fill when there is not.
///
/// Decoding happens per build, which is cheap at these sizes and keeps the
/// widget stateless — the alternative is a cache that has to be invalidated
/// every time someone changes their picture.
class Avatar extends StatelessWidget {
  const Avatar({
    super.key,
    required this.initials,
    this.base64Image,
    this.size = 42,
    this.onTap,
  });

  final String initials;
  final String? base64Image;
  final double size;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final raw = base64Image;

    Widget inner;
    if (raw != null && raw.isNotEmpty) {
      inner = ClipOval(
        child: Image.memory(
          base64Decode(raw),
          width: size,
          height: size,
          fit: BoxFit.cover,
          // A corrupt or truncated blob must not take the whole screen down.
          errorBuilder: (_, _, _) => _initialsCircle(c),
        ),
      );
    } else {
      inner = _initialsCircle(c);
    }

    if (onTap == null) return inner;
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: inner,
    );
  }

  Widget _initialsCircle(AppColors c) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: c.brandSolid, shape: BoxShape.circle),
    alignment: Alignment.center,
    child: Text(
      initials,
      style: TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: size * 0.31,
      ),
    ),
  );
}
