import 'package:flutter/material.dart';
import '../data/notifications.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'ai_chat_screen.dart';
import 'alerts_screen.dart';
import 'cheque_detail_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final user = store.currentUser!;
        final myTasks = store.tasksFor(user.id);
        final overdueCount = myTasks
            .where((t) => t.status == TaskStatus.overdue)
            .length;
        final overdueCheques = store.cheques.where((c) => c.isOverdue).toList();
        final bounced = store.cheques
            .where((c) => c.status == ChequeStatus.bounced)
            .toList();
        final due = store.dueSoon.take(6).toList();
        final hour = DateTime.now().hour;
        final greeting = hour < 12
            ? 'Good morning'
            : hour < 17
            ? 'Good afternoon'
            : 'Good evening';

        final alertCount = Notifications.instance.pending(store).length;

        return Scaffold(
          backgroundColor: c.canvas,
          floatingActionButton: FloatingActionButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AiChatScreen()),
            ),
            backgroundColor: c.brandSolid,
            foregroundColor: Colors.white,
            tooltip: 'Ask the assistant',
            child: const Icon(Icons.auto_awesome, size: 21),
          ),
          body: SafeArea(
            bottom: false,
            child: RefreshIndicator(
              onRefresh: () async {},
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  // ------------------------------------------------- greeting
                  _HeroBand(
                    greeting: greeting,
                    name: user.name.split(' ').first,
                    initials: user.initials,
                    avatar: store.avatarFor(user.id),
                    openTasks: myTasks.length,
                    overdue: overdueCount,
                    alertCount: alertCount,
                    onAlerts: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const AlertsScreen()),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // -------------------------------------------- critical band
                  if (overdueCheques.isNotEmpty || bounced.isNotEmpty) ...[
                    _AlertBand(
                      overdue: overdueCheques.length,
                      bounced: bounced.length,
                      atRisk: store.atRisk,
                    ),
                    const SizedBox(height: 14),
                  ],

                  // ------------------------------------------------ KPI grid
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 9,
                    crossAxisSpacing: 9,
                    // Tuned against the narrowest supported handset (375pt);
                    // covered by the layout tests in test/layout_test.dart.
                    childAspectRatio: 1.9,
                    children: [
                      StatTile(
                        label: 'Occupancy',
                        value: '${(store.occupancy * 100).toStringAsFixed(1)}%',
                        sub:
                            '${store.occupiedCount} of ${store.units.length} units',
                        tone: Tone.good,
                      ),
                      StatTile(
                        label: 'Annual rent roll',
                        value: aedShort(store.annualisedRent),
                        sub: '${store.contracts.length} contracts',
                      ),
                      StatTile(
                        label: 'Collected',
                        value: aedShort(store.collected),
                        sub: 'Cheques cleared',
                        tone: Tone.good,
                      ),
                      StatTile(
                        label: 'At risk',
                        value: aedShort(store.atRisk),
                        sub: 'Overdue + bounced',
                        tone: Tone.bad,
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // ------------------------------------------- cheques to bank
                  SectionHeader(
                    title: 'Cheques to bank',
                    sub: 'Overdue and due within 14 days.',
                  ),
                  if (due.isEmpty)
                    const EmptyState(
                      title: 'Nothing due in the next two weeks',
                      icon: Icons.check_circle_outline,
                    )
                  else
                    AppCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (var i = 0; i < due.length; i++)
                            _ChequeRow(
                              cheque: due[i],
                              last: i == due.length - 1,
                            ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 18),

                  // --------------------------------------------- forecast bars
                  SectionHeader(
                    title: 'Expected collections',
                    sub: 'Next 12 months, from cheques already held.',
                  ),
                  AppCard(child: _ForecastChart(data: store.forecast())),
                  const SizedBox(height: 18),

                  // ---------------------------------------------- portfolio
                  SectionHeader(title: 'Portfolio'),
                  AppCard(
                    child: Column(
                      children: [
                        for (final p in store.properties)
                          _PropertyRow(property: p),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Greeting card at the top of the dashboard. Mirrors the web hero: a warm
/// wash across the palette's two creams into the olive tint, with the day's
/// workload reduced to chips rather than a sentence.
class _HeroBand extends StatelessWidget {
  const _HeroBand({
    required this.greeting,
    required this.name,
    required this.initials,
    required this.avatar,
    required this.openTasks,
    required this.overdue,
    required this.alertCount,
    required this.onAlerts,
  });

  final String greeting, name, initials;
  final String? avatar;
  final int openTasks, overdue, alertCount;
  final VoidCallback onAlerts;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final date = DateTime.now();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const days = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
      'Saturday', 'Sunday',
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c.line),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [c.brand50, c.surface, c.gold50],
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${days[date.weekday - 1]}, ${date.day} '
                  '${months[date.month - 1]}',
                  style: TextStyle(
                    color: c.brand600,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.7,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '$greeting, $name',
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 9),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    StatusBadge(
                      openTasks == 0
                          ? 'No open tasks'
                          : '$openTasks open task${openTasks > 1 ? 's' : ''}',
                      tone: overdue > 0
                          ? Tone.bad
                          : openTasks > 0
                          ? Tone.warn
                          : Tone.good,
                    ),
                    if (overdue > 0) StatusBadge('$overdue overdue', tone: Tone.bad),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            children: [
              // Bell with the live alert count — the in-app counterpart of the
              // notifications, for anyone who has them switched off.
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Material(
                    color: c.surface,
                    shape: CircleBorder(side: BorderSide(color: c.line)),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: onAlerts,
                      child: SizedBox(
                        width: 38,
                        height: 38,
                        child: Icon(
                          Icons.notifications_none,
                          size: 19,
                          color: c.muted,
                        ),
                      ),
                    ),
                  ),
                  if (alertCount > 0)
                    Positioned(
                      right: -2,
                      top: -2,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        constraints: const BoxConstraints(minWidth: 17),
                        height: 17,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: c.red600,
                          borderRadius: BorderRadius.circular(9),
                          border: Border.all(color: c.surface, width: 1.5),
                        ),
                        child: Text(
                          '$alertCount',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Avatar(initials: initials, base64Image: avatar, size: 42),
            ],
          ),
        ],
      ),
    );
  }
}

class _AlertBand extends StatelessWidget {
  const _AlertBand({
    required this.overdue,
    required this.bounced,
    required this.atRisk,
  });
  final int overdue, bounced;
  final num atRisk;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.red50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.red200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, size: 19, color: c.red600),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Requires attention — money is at risk',
                  style: TextStyle(
                    color: c.red800,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$overdue overdue cheque${overdue == 1 ? '' : 's'}'
                  '${bounced > 0 ? ' · $bounced bounced' : ''} · ${aedShort(atRisk)} exposed',
                  style: TextStyle(
                    color: c.red700,
                    fontSize: 12.5,
                    height: 1.4,
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

class _ChequeRow extends StatelessWidget {
  const _ChequeRow({required this.cheque, required this.last});
  final Cheque cheque;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final unit = store.unitForCheque(cheque);
    final tenant = store.tenantForCheque(cheque);
    final late = cheque.isOverdue;

    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChequeDetailScreen(chequeId: cheque.id),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          border: last ? null : Border(bottom: BorderSide(color: c.lineSoft)),
        ),
        child: Row(
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: late ? c.red500 : c.amber400,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Unit ${unit.unitNo} · ${tenant.name}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${cheque.chequeNo} · ${cheque.bank} · ${relativeDays(cheque.daysToDue)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: late ? c.red700 : c.muted,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              aedShort(cheque.amount),
              maxLines: 1,
              style: TextStyle(
                color: c.fg,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            Icon(Icons.chevron_right, size: 18, color: c.faint),
          ],
        ),
      ),
    );
  }
}

class _ForecastChart extends StatelessWidget {
  const _ForecastChart({required this.data});
  final List<({String label, num due, int count})> data;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final maxDue = data.fold<num>(1, (m, d) => d.due > m ? d.due : m);
    return SizedBox(
      height: 132,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final d in data)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Container(
                      height: (d.due / maxDue * 92).clamp(3, 92).toDouble(),
                      decoration: BoxDecoration(
                        color: c.brand500,
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(3),
                        ),
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      d.label,
                      style: TextStyle(color: c.muted, fontSize: 9.5),
                    ),
                    Text(
                      '${d.count}',
                      style: TextStyle(color: c.faint, fontSize: 9),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PropertyRow extends StatelessWidget {
  const _PropertyRow({required this.property});
  final Property property;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final us = store.units.where((u) => u.propertyId == property.id).toList();
    final occ = us.where((u) => u.status == UnitStatus.occupied).length;
    final ratio = us.isEmpty ? 0.0 : occ / us.length;

    return Padding(
      padding: const EdgeInsets.only(bottom: 13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  property.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Text(
                '$occ/${us.length}',
                style: TextStyle(
                  color: c.muted,
                  fontSize: 12,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ProgressBar(
            value: ratio,
            tone: ratio > 0.9
                ? Tone.good
                : ratio > 0.75
                ? Tone.warn
                : Tone.bad,
          ),
        ],
      ),
    );
  }
}
