import 'package:flutter/material.dart';

import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'profile_screen.dart';

/// Every employee's sign-in and sign-out history.
///
/// Administrator-only — it is the record you check when asking who was in the
/// system at a given time, so it is deliberately separate from the audit log,
/// which answers what they changed once they were in.
class AccessLogScreen extends StatefulWidget {
  const AccessLogScreen({super.key});

  @override
  State<AccessLogScreen> createState() => _AccessLogScreenState();
}

class _AccessLogScreenState extends State<AccessLogScreen> {
  String? _userFilter;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final events = store.sessions
            .where((s) => _userFilter == null || s.userId == _userFilter)
            .toList();

        // Only offer filters for people who actually appear in the log.
        final present = <String, String>{};
        for (final s in store.sessions) {
          present[s.userId] = s.userName;
        }

        final signIns = events
            .where((s) => s.kind == SessionKind.signIn)
            .length;

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            title: const Text('Employee access'),
            backgroundColor: c.surface,
          ),
          body: Column(
            children: [
              if (present.length > 1)
                SizedBox(
                  height: 52,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    children: [
                      _Chip(
                        label: 'Everyone',
                        selected: _userFilter == null,
                        onTap: () => setState(() => _userFilter = null),
                      ),
                      for (final e in present.entries)
                        _Chip(
                          label: e.value.split(' ').first,
                          selected: _userFilter == e.key,
                          onTap: () => setState(() => _userFilter = e.key),
                        ),
                    ],
                  ),
                ),
              Expanded(
                child: events.isEmpty
                    ? const EmptyState(
                        title: 'No access recorded yet',
                        sub: 'Sign-ins appear here as employees use the app.',
                        icon: Icons.history,
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text(
                              '${events.length} event'
                              '${events.length == 1 ? '' : 's'} · '
                              '$signIns sign-in${signIns == 1 ? '' : 's'}',
                              style: TextStyle(color: c.muted, fontSize: 12),
                            ),
                          ),
                          AppCard(
                            padding: EdgeInsets.zero,
                            child: Column(
                              children: [
                                for (var i = 0; i < events.length; i++)
                                  SessionRow(
                                    event: events[i],
                                    last: i == events.length - 1,
                                    showName: true,
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(right: 8, top: 10, bottom: 10),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? c.brandSolid : c.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? c.brandSolid : c.line),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : c.fgSoft,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
