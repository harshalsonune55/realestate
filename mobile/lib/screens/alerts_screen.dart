import 'package:flutter/material.dart';

import '../data/notifications.dart';
import '../data/store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// In-app view of the same conditions that raise notifications.
///
/// Reads [Notifications.pending] rather than recomputing, so what the phone
/// buzzes about and what this screen lists can never drift apart.
class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final notices = Notifications.instance.pending(store);
        final critical = notices.where((n) => n.critical).toList();
        final rest = notices.where((n) => !n.critical).toList();

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            title: const Text('Alerts'),
            backgroundColor: c.surface,
            actions: [
              IconButton(
                tooltip: 'Notification settings',
                icon: const Icon(Icons.notifications_none, size: 21),
                onPressed: () async {
                  final granted = await Notifications.instance
                      .requestPermission();
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        granted
                            ? 'Notifications are on for this device.'
                            : 'Notifications are blocked — turn them on in '
                                  'Android settings for Aber Group.',
                      ),
                    ),
                  );
                  if (granted) {
                    await Notifications.instance.sync(store);
                  }
                },
              ),
            ],
          ),
          body: notices.isEmpty
              ? const EmptyState(
                  title: 'Nothing needs attention',
                  sub: 'Overdue cheques, bounces, approvals and late tasks '
                      'appear here as they happen.',
                  icon: Icons.check_circle_outline,
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                  children: [
                    if (critical.isNotEmpty) ...[
                      SectionHeader(
                        title: 'Needs attention',
                        sub: 'Money is at risk while these are open.',
                      ),
                      for (final n in critical)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _AlertCard(notice: n),
                        ),
                      const SizedBox(height: 8),
                    ],
                    if (rest.isNotEmpty) ...[
                      SectionHeader(title: 'Worth knowing'),
                      for (final n in rest)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _AlertCard(notice: n),
                        ),
                    ],
                  ],
                ),
        );
      },
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.notice});
  final AlertNotice notice;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final tone = notice.critical ? Tone.bad : Tone.warn;
    final t = toneColors(context, tone);

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            notice.critical
                ? Icons.warning_amber_rounded
                : Icons.info_outline,
            size: 19,
            color: t.fg,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notice.title,
                  style: TextStyle(
                    color: t.fg,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  notice.body,
                  style: TextStyle(
                    color: c.fgSoft,
                    fontSize: 12.5,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
