import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../data/photos.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'ai_chat_screen.dart';
import 'alerts_screen.dart';
import 'maintenance_screen.dart';
import 'more_screen.dart';
import 'properties_screen.dart';
import 'units_screen.dart';

/// Home dashboard — a clean, modern overview: greeting, headline figures, a
/// quick-stats chart and the building-condition breakdown.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final name = (store.currentUser?.name ?? 'there').split(' ').first;

    // Building condition, by work-order status.
    int count(bool Function(MaintenanceRequest) f) =>
        store.maintenance.where(f).length;
    final inProgress = count((m) => m.status == MaintenanceStatus.inProgress);
    final awaiting = count((m) =>
        m.status == MaintenanceStatus.assigned ||
        m.status == MaintenanceStatus.awaitingApproval);
    final onRequest = count((m) => m.status == MaintenanceStatus.newRequest);

    return Scaffold(
      backgroundColor: c.canvas,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          children: [
            // ---- greeting header ----
            Row(
              children: [
                // The Aber Group mark, in place of the generic grid glyph.
                ClipOval(
                  child: Image.asset(
                    'assets/brand/aber_logo.png',
                    width: 40,
                    height: 40,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '${_greeting()}, $name 👋',
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                _CircleIconButton(
                  icon: Icons.menu,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const MoreScreen()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 26),

            // ---- title + actions ----
            Row(
              children: [
                Text(
                  'Dashboard',
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                const Spacer(),
                _DotIconButton(
                  icon: Icons.notifications_none_rounded,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const AlertsScreen()),
                  ),
                ),
                const SizedBox(width: 10),
                _DotIconButton(
                  icon: Icons.chat_bubble_outline_rounded,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const AiChatScreen()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),

            // ---- headline stat cards ----
            // The same three figures the web dashboard leads with, so a
            // manager reading one and then the other sees the same numbers.
            // Short-form amounts: three cards across a phone leaves roughly a
            // third of the width each, and "AED 17,598,500" set in that space
            // shrinks to unreadable. The full figure is on the Cheques screen.
            Row(
              children: [
                Expanded(
                  child: _StatCard(
                    background: const Color(0xFFF6DD8A),
                    icon: Icons.schedule_rounded,
                    label: 'Outstanding',
                    value: aedShort(store.outstanding),
                    delta: '${store.cheques.where((c) => c.status == ChequeStatus.pending).length} cheques',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatCard(
                    background: const Color(0xFFC9D8EA),
                    icon: Icons.trending_up_rounded,
                    label: 'Collected',
                    value: aedShort(store.collected),
                    delta: 'Last 12 months',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatCard(
                    background: const Color(0xFFE0D3EA),
                    icon: Icons.warning_amber_rounded,
                    label: 'At risk',
                    value: aedShort(store.atRisk),
                    delta: 'Overdue + bounced',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            const _QuickStats(),
            const SizedBox(height: 22),

            // ---- my properties ----
            Row(
              children: [
                Text('My Properties',
                    style: TextStyle(
                        color: c.fg, fontSize: 17, fontWeight: FontWeight.w700)),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const PropertiesScreen()),
                  ),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: c.line),
                    ),
                    child: Text('View all',
                        style: TextStyle(
                            color: c.fgSoft,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${store.properties.length} buildings · ${store.units.length} units · '
              '${(store.occupancy * 100).round()}% let',
              style: TextStyle(color: c.muted, fontSize: 13),
            ),
            const SizedBox(height: 14),
            // A shelf rather than a list: the dashboard shows enough of the
            // portfolio to recognise it, and the full screen holds the rest.
            SizedBox(
              height: 196,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                clipBehavior: Clip.none,
                itemCount: store.properties.length,
                separatorBuilder: (_, _) => const SizedBox(width: 14),
                itemBuilder: (_, i) {
                  final p = store.properties[i];
                  final units =
                      store.units.where((u) => u.propertyId == p.id).toList();
                  final rented = units
                      .where((u) =>
                          u.status == UnitStatus.occupied ||
                          u.status == UnitStatus.reserved)
                      .length;
                  return _PropertyTile(
                    propertyId: p.id,
                    name: p.name,
                    area: p.area,
                    units: units.length,
                    rented: rented,
                    gradient: _propertyGradients[i % _propertyGradients.length],
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => UnitsScreen(
                          propertyId: p.id,
                          title: p.name,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 22),

            // ---- building condition ----
            _Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Building Condition',
                      style: TextStyle(
                          color: c.fg,
                          fontSize: 17,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 18),
                  _ConditionBar(
                    label: 'On repairment progress',
                    count: inProgress,
                    fraction: 0.82,
                    color: c,
                  ),
                  const SizedBox(height: 18),
                  _ConditionBar(
                    label: 'Awaiting for repairment',
                    count: awaiting,
                    fraction: 0.5,
                    color: c,
                  ),
                  const SizedBox(height: 18),
                  _ConditionBar(
                    label: 'On request',
                    count: onRequest,
                    fraction: 0.3,
                    color: c,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                          builder: (_) => const MaintenanceScreen()),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

}

/* ------------------------------------------------------------------ pieces */

/// Card headers for the property shelf, in the same order the full Properties
/// screen uses so a building keeps its colour between the two.
const _propertyGradients = [
  [Color(0xFF23415C), Color(0xFF4E7BA6)],
  [Color(0xFF2B3A4A), Color(0xFF5C7189)],
  [Color(0xFF4A3B2A), Color(0xFF8A6A47)],
  [Color(0xFF2E4633), Color(0xFF5F8A6B)],
  [Color(0xFF3A3A3A), Color(0xFF6E6E6E)],
];

class _PropertyTile extends StatelessWidget {
  const _PropertyTile({
    required this.propertyId,
    required this.name,
    required this.area,
    required this.units,
    required this.rented,
    required this.gradient,
    required this.onTap,
  });

  final String propertyId;
  final String name, area;
  final int units, rented;
  final List<Color> gradient;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final vacant = units - rented;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 210,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PropertyPhoto(
              url: Photos.building(propertyId),
              gradient: gradient,
              height: 118,
              radius: 18,
              overlay: Stack(
                children: [
                    Positioned(
                      left: 10,
                      bottom: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.45),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          vacant == 0 ? 'Fully let' : '$vacant vacant',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 9),
            Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: c.fg, fontSize: 14.5, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text('$area · $units units',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: c.muted, fontSize: 12.5)),
          ],
        ),
      ),
    );
  }
}


class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(99),
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: c.surface,
          shape: BoxShape.circle,
          border: Border.all(color: c.line),
        ),
        child: Icon(icon, size: 20, color: c.fg),
      ),
    );
  }
}

class _DotIconButton extends StatelessWidget {
  const _DotIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(99),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: c.surface,
              shape: BoxShape.circle,
              border: Border.all(color: c.line),
            ),
            child: Icon(icon, size: 20, color: c.fg),
          ),
          Positioned(
            right: 9,
            top: 9,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444),
                shape: BoxShape.circle,
                border: Border.all(color: c.surface, width: 1.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.background,
    required this.icon,
    required this.label,
    required this.value,
    required this.delta,
  });
  final Color background;
  final IconData icon;
  final String label, value, delta;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: const BoxDecoration(
                    color: Colors.white, shape: BoxShape.circle),
                child: Icon(icon, size: 13, color: Colors.black87),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.black87,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: const TextStyle(
                    color: Colors.black,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4)),
          ),
          const SizedBox(height: 6),
          Text(delta,
              maxLines: 2,
              style: TextStyle(
                  color: Colors.black.withValues(alpha: 0.6),
                  fontSize: 10.5,
                  height: 1.25,
                  fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: c.line),
      ),
      child: child,
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label,
            style: TextStyle(color: context.c.muted, fontSize: 12.5)),
      ],
    );
  }
}

class _ConditionBar extends StatelessWidget {
  const _ConditionBar({
    required this.label,
    required this.count,
    required this.fraction,
    required this.color,
    this.onTap,
  });
  final String label;
  final int count;
  final double fraction;
  final AppColors color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = color;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(label,
                    style: TextStyle(
                        color: c.fgSoft,
                        fontSize: 14,
                        fontWeight: FontWeight.w600)),
              ),
              Text('$count',
                  style: TextStyle(
                      color: c.fg, fontSize: 14, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 8,
              backgroundColor: c.subtle,
              valueColor: const AlwaysStoppedAnimation(Colors.black),
            ),
          ),
        ],
      ),
    );
  }
}

/* ---------------------------------------------------------------- the chart */

class _QuickStatsChart extends StatelessWidget {
  const _QuickStatsChart({
    required this.income,
    required this.expense,
    required this.labels,
    required this.highlight,
    required this.color,
  });
  final List<double> income, expense;
  final List<String> labels;
  final int? highlight;
  final AppColors color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _ChartPainter(
        income: income,
        expense: expense,
        labels: labels,
        highlight: highlight,
        color: color,
      ),
      size: Size.infinite,
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter({
    required this.income,
    required this.expense,
    required this.labels,
    required this.highlight,
    required this.color,
  });
  final List<double> income, expense;
  final List<String> labels;
  /// Index the reader tapped, drawn with a marker and a vertical rule.
  final int? highlight;
  final AppColors color;

  @override
  void paint(Canvas canvas, Size size) {
    const leftPad = 6.0, rightPad = 40.0, topPad = 8.0, bottomPad = 22.0;
    final w = size.width - leftPad - rightPad;
    final h = size.height - topPad - bottomPad;

    final maxV = [
      ...income,
      ...expense,
    ].fold<double>(1, (m, v) => math.max(m, v));

    Offset pt(int i, double v, int n) => Offset(
          leftPad + (n <= 1 ? 0 : i / (n - 1) * w),
          topPad + h - (v / maxV) * h,
        );

    // faint horizontal gridlines
    final grid = Paint()
      ..color = color.line
      ..strokeWidth = 1;
    for (var g = 0; g <= 4; g++) {
      final y = topPad + h - g / 4 * h;
      canvas.drawLine(Offset(leftPad, y), Offset(leftPad + w, y), grid);
    }

    void drawCurve(List<double> data, Color col, double stroke) {
      if (data.isEmpty) return;
      final pts = [for (var i = 0; i < data.length; i++) pt(i, data[i], data.length)];
      final path = Path()..moveTo(pts.first.dx, pts.first.dy);
      for (var i = 0; i < pts.length - 1; i++) {
        final p0 = pts[i], p1 = pts[i + 1];
        final mx = (p0.dx + p1.dx) / 2;
        path.cubicTo(mx, p0.dy, mx, p1.dy, p1.dx, p1.dy);
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = col
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    drawCurve(expense, const Color(0xFFC7CCD4), 3);
    drawCurve(income, Colors.black, 3);

    // marker + tooltip on the income peak
    final peakIdx =
        income.indexOf(income.fold<double>(0, (m, v) => math.max(m, v)));
    if (peakIdx >= 0) {
      final p = pt(peakIdx, income[peakIdx], income.length);
      canvas.drawCircle(p, 4.5, Paint()..color = Colors.black);
      canvas.drawCircle(
          p, 4.5, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2);
    }

    // y labels (compact) at right
    final tp = TextPainter(textDirection: TextDirection.ltr);
    for (var g = 0; g <= 4; g++) {
      final v = maxV * g / 4;
      final y = topPad + h - g / 4 * h;
      tp.text = TextSpan(
        text: _short(v),
        style: TextStyle(color: color.faint, fontSize: 10),
      );
      tp.layout();
      tp.paint(canvas, Offset(leftPad + w + 6, y - tp.height / 2));
    }

    // the tapped bucket, if there is one
    final hi = highlight;
    if (hi != null && hi >= 0 && hi < income.length) {
      final x = pt(hi, 0, income.length).dx;
      canvas.drawLine(
        Offset(x, topPad),
        Offset(x, topPad + h),
        Paint()
          ..color = color.lineStrong
          ..strokeWidth = 1,
      );
      for (final pair in [(income, Colors.black), (expense, const Color(0xFFC7CCD4))]) {
        final v = pair.$1[hi];
        // A ring in the surface colour keeps the two dots apart where the
        // series cross, rather than letting them merge into one blob.
        canvas.drawCircle(pt(hi, v, income.length), 5.5,
            Paint()..color = color.surface);
        canvas.drawCircle(pt(hi, v, income.length), 3.5,
            Paint()..color = pair.$2);
      }
    }

    // x labels
    for (var i = 0; i < labels.length; i++) {
      final x = leftPad + (labels.length <= 1 ? 0 : i / (labels.length - 1) * w);
      tp.text = TextSpan(
        text: labels[i],
        style: TextStyle(color: color.faint, fontSize: 10),
      );
      tp.layout();
      tp.paint(canvas, Offset(x - tp.width / 2, size.height - bottomPad + 6));
    }
  }

  static String _short(double v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(0)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(0)}K';
    return v.toStringAsFixed(0);
  }

  @override
  bool shouldRepaint(covariant _ChartPainter old) =>
      old.highlight != highlight ||
      old.labels.length != labels.length ||
      old.income != income || old.expense != expense;
}


/* ------------------------------------------------------------ quick stats */

/// How far back the Quick Stats chart looks.
enum StatsRange { months6, months12, years5 }

extension on StatsRange {
  String get label => switch (this) {
    StatsRange.months6 => 'Last 6 months',
    StatsRange.months12 => 'Last 12 months',
    StatsRange.years5 => 'Last 5 years',
  };

  /// Number of buckets drawn.
  int get buckets => switch (this) {
    StatsRange.months6 => 6,
    StatsRange.months12 => 12,
    StatsRange.years5 => 5,
  };

  bool get byYear => this == StatsRange.years5;
}

/// Income against expense over a chosen window.
///
/// Stateful because the range control has to change something — it was drawn
/// as a static chip beside a chart of five hardcoded years, so it looked like
/// a filter and did nothing. The figures underneath are real: cheques by their
/// due date for income, maintenance quotes by the date raised for expense.
class _QuickStats extends StatefulWidget {
  const _QuickStats();

  @override
  State<_QuickStats> createState() => _QuickStatsState();
}

class _QuickStatsState extends State<_QuickStats> {
  StatsRange _range = StatsRange.years5;
  int? _picked;

  /// One bucket's start, oldest first.
  List<DateTime> _starts() {
    final now = DateTime.now();
    return [
      for (var i = _range.buckets - 1; i >= 0; i--)
        _range.byYear
            ? DateTime(now.year - i, 1, 1)
            : DateTime(now.year, now.month - i, 1),
    ];
  }

  DateTime _endOf(DateTime start) =>
      _range.byYear ? DateTime(start.year + 1, 1, 1) : DateTime(start.year, start.month + 1, 1);

  String _labelFor(DateTime d) => _range.byYear
      ? '${d.year}'
      : const [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        ][d.month - 1];

  Future<void> _pickRange() async {
    final c = context.c;
    final chosen = await showModalBottomSheet<StatsRange>(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: c.line,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const SizedBox(height: 14),
            for (final r in StatsRange.values)
              ListTile(
                title: Text(
                  r.label,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 15,
                    fontWeight: r == _range ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                trailing: r == _range
                    ? Icon(Icons.check, size: 19, color: c.brandSolid)
                    : null,
                onTap: () => Navigator.of(sheet).pop(r),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (chosen != null && mounted) {
      setState(() {
        _range = chosen;
        _picked = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final starts = _starts();

    num sumIn(DateTime from, DateTime to) => store.cheques
        .where((x) =>
            x.status == ChequeStatus.cleared &&
            !x.dueDate.isBefore(from) &&
            x.dueDate.isBefore(to))
        .fold<num>(0, (s, x) => s + x.amount);

    num sumOut(DateTime from, DateTime to) => store.maintenance
        .where((m) => !m.reportedAt.isBefore(from) && m.reportedAt.isBefore(to))
        .fold<num>(0, (s, m) => s + m.quoteAmount);

    final income = [
      for (final s in starts) sumIn(s, _endOf(s)).toDouble(),
    ];
    final expense = [
      for (final s in starts) sumOut(s, _endOf(s)).toDouble(),
    ];
    final labels = [for (final s in starts) _labelFor(s)];

    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Quick Stats',
                  style: TextStyle(
                      color: c.fg, fontSize: 17, fontWeight: FontWeight.w700)),
              const Spacer(),
              GestureDetector(
                onTap: _pickRange,
                behavior: HitTestBehavior.opaque,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    border: Border.all(color: c.line),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Text(_range.label,
                          style: TextStyle(color: c.fgSoft, fontSize: 12.5)),
                      const SizedBox(width: 4),
                      Icon(Icons.keyboard_arrow_down, size: 16, color: c.muted),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _Legend(color: Colors.black, label: 'Income'),
              const SizedBox(width: 16),
              _Legend(color: const Color(0xFFC7CCD4), label: 'Expense'),
            ],
          ),
          const SizedBox(height: 8),

          // Tapping a point reads out that bucket rather than opening a screen:
          // the figure behind a dot is what the chart is being asked for.
          LayoutBuilder(
            builder: (context, box) => GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (d) {
                if (labels.length < 2) return;
                const leftPad = 6.0, rightPad = 40.0;
                final w = box.maxWidth - leftPad - rightPad;
                final rel = (d.localPosition.dx - leftPad) / (w <= 0 ? 1 : w);
                final i = (rel * (labels.length - 1)).round();
                setState(() =>
                    _picked = i.clamp(0, labels.length - 1));
              },
              child: SizedBox(
                height: 190,
                child: _QuickStatsChart(
                  income: income,
                  expense: expense,
                  labels: labels,
                  highlight: _picked,
                  color: c,
                ),
              ),
            ),
          ),

          if (_picked != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: c.subtle,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  Text(labels[_picked!],
                      style: TextStyle(
                          color: c.fg,
                          fontSize: 13,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Income AED ${income[_picked!].round()}   ·   '
                      'Expense AED ${expense[_picked!].round()}',
                      style: TextStyle(color: c.fgSoft, fontSize: 12.5),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => setState(() => _picked = null),
                    child: Icon(Icons.close, size: 15, color: c.muted),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
