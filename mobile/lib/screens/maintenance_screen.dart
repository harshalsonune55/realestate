import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'unit_detail_screen.dart';

/// Work orders — the maintenance section, mirroring the web app's list.
class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({super.key});

  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final list = store.maintenance.where((m) {
      if (_query.isEmpty) return true;
      final q = _query.toLowerCase();
      final unitNo = store.unit(m.unitId).unitNo.toLowerCase();
      return m.ref.toLowerCase().contains(q) ||
          m.category.toLowerCase().contains(q) ||
          m.vendor.toLowerCase().contains(q) ||
          unitNo.contains(q);
    }).toList()
      ..sort((a, b) => b.reportedAt.compareTo(a.reportedAt));

    final open = store.maintenance
        .where((m) =>
            m.status != MaintenanceStatus.closed &&
            m.status != MaintenanceStatus.completed &&
            m.status != MaintenanceStatus.rejected)
        .length;

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        title: const Text('Maintenance'),
        backgroundColor: c.surface,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              style: TextStyle(color: c.fg, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Search WO number, unit, category or vendor',
                hintStyle: TextStyle(color: c.faint, fontSize: 13.5),
                prefixIcon: Icon(Icons.search, size: 19, color: c.faint),
                filled: true,
                fillColor: c.subtle,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 11),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(11),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Text('$open open',
                    style: TextStyle(
                        color: c.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
                const Spacer(),
                Text('${store.maintenance.length} total',
                    style: TextStyle(color: c.faint, fontSize: 12.5)),
              ],
            ),
          ),
          Expanded(
            child: list.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(16),
                    child: EmptyState(
                        title: 'No work orders match', icon: Icons.search_off),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) => _WorkOrderCard(m: list[i]),
                  ),
          ),
        ],
      ),
    );
  }
}

class _WorkOrderCard extends StatelessWidget {
  const _WorkOrderCard({required this.m});
  final MaintenanceRequest m;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final unit = Store.instance.unit(m.unitId);

    return AppCard(
      onTap: () => _showDetail(context, m, unit),
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${m.ref} · ${m.category}',
                    style: TextStyle(
                        color: c.fg, fontSize: 14, fontWeight: FontWeight.w700)),
              ),
              _StatusChip(status: m.status),
            ],
          ),
          const SizedBox(height: 4),
          Text('Unit ${unit.unitNo} · ${m.vendor}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.muted, fontSize: 12.5)),
          const SizedBox(height: 8),
          Row(
            children: [
              _Pill(text: m.priority.toUpperCase(), tone: _priorityColor(m.priority, c)),
              const SizedBox(width: 8),
              if (m.quoteAmount > 0)
                Text('AED ${m.quoteAmount.toStringAsFixed(0)}',
                    style: TextStyle(color: c.fgSoft, fontSize: 12.5)),
              const Spacer(),
              Text('SLA ${_d(m.slaDueAt)}',
                  style: TextStyle(color: c.faint, fontSize: 11.5)),
            ],
          ),
        ],
      ),
    );
  }

  static String _d(DateTime d) => '${d.day}/${d.month}/${d.year}';

  /// The full work order.
  ///
  /// A sheet rather than a screen: a work order is a handful of fields and a
  /// description, and pushing a whole route to read two paragraphs makes the
  /// list feel heavier than it is.
  static void _showDetail(
    BuildContext context,
    MaintenanceRequest m,
    Unit unit,
  ) {
    final c = context.c;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: c.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: c.line,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${m.ref} · ${m.category}',
                      style: TextStyle(
                        color: c.fg,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ),
                  _StatusChip(status: m.status),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                m.description,
                style: TextStyle(color: c.fgSoft, fontSize: 13.5, height: 1.45),
              ),
              const SizedBox(height: 16),
              _DetailRow(label: 'Unit', value: 'Unit ${unit.unitNo}'),
              _DetailRow(label: 'Priority', value: m.priority.toUpperCase()),
              _DetailRow(label: 'Vendor', value: m.vendor.isEmpty ? '—' : m.vendor),
              _DetailRow(
                label: 'Assigned to',
                value: m.assignedToName ?? 'Unassigned',
              ),
              _DetailRow(
                label: 'Quote',
                value: m.quoteAmount > 0
                    ? 'AED ${m.quoteAmount.toStringAsFixed(0)}'
                    : 'Not quoted',
              ),
              _DetailRow(label: 'Reported', value: _d(m.reportedAt)),
              _DetailRow(label: 'SLA due', value: _d(m.slaDueAt), last: true),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () {
                    Navigator.of(sheet).pop();
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => UnitDetailScreen(unitId: unit.id),
                      ),
                    );
                  },
                  style: TextButton.styleFrom(
                    backgroundColor: c.subtle,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    'Open unit ${unit.unitNo}',
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Color _priorityColor(String p, AppColors c) {
    switch (p) {
      case 'emergency':
        return c.red600;
      case 'high':
        return c.amber700;
      default:
        return c.muted;
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final MaintenanceStatus status;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final label = maintenanceStatusLabel[status]!;
    late final Color bg, fg;
    switch (status) {
      case MaintenanceStatus.completed:
      case MaintenanceStatus.closed:
        bg = c.brand50;
        fg = c.brand600;
        break;
      case MaintenanceStatus.awaitingApproval:
        bg = c.amber50;
        fg = c.amber700;
        break;
      case MaintenanceStatus.rejected:
        bg = c.red50;
        fg = c.red700;
        break;
      default:
        bg = c.subtle;
        fg = c.fgSoft;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.tone});
  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: TextStyle(color: tone, fontSize: 11, fontWeight: FontWeight.w700));
  }
}


class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value, this.last = false});
  final String label, value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: c.lineSoft)),
      ),
      child: Row(
        children: [
          Text(label, style: TextStyle(color: c.muted, fontSize: 13)),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: c.fg,
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
