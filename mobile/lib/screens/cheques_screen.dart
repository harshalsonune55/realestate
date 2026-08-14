import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'cheque_detail_screen.dart';

enum ChequeFilter { all, dueSoon, overdue, bounced, cleared }

const _filterLabel = {
  ChequeFilter.all: 'All',
  ChequeFilter.dueSoon: 'Due soon',
  ChequeFilter.overdue: 'Overdue',
  ChequeFilter.bounced: 'Bounced',
  ChequeFilter.cleared: 'Cleared',
};

class ChequesScreen extends StatefulWidget {
  const ChequesScreen({super.key});

  @override
  State<ChequesScreen> createState() => _ChequesScreenState();
}

class _ChequesScreenState extends State<ChequesScreen> {
  ChequeFilter _filter = ChequeFilter.all;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        var list = store.cheques.where((ch) {
          switch (_filter) {
            case ChequeFilter.dueSoon:
              if (!ch.isDueSoon) return false;
            case ChequeFilter.overdue:
              if (!ch.isOverdue) return false;
            case ChequeFilter.bounced:
              if (ch.status != ChequeStatus.bounced) return false;
            case ChequeFilter.cleared:
              if (ch.status != ChequeStatus.cleared) return false;
            case ChequeFilter.all:
              break;
          }
          if (_query.isEmpty) return true;
          final q = _query.toLowerCase();
          final unit = store.unitForCheque(ch);
          final tenant = store.tenantForCheque(ch);
          return ch.chequeNo.contains(q) ||
              ch.bank.toLowerCase().contains(q) ||
              unit.unitNo.toLowerCase().contains(q) ||
              tenant.name.toLowerCase().contains(q);
        }).toList()..sort((a, b) => a.dueDate.compareTo(b.dueDate));

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            title: const Text('Cheques'),
            backgroundColor: c.surface,
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(104),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: TextField(
                      onChanged: (v) => setState(() => _query = v),
                      style: TextStyle(color: c.fg, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: 'Search cheque, unit, tenant or bank',
                        hintStyle: TextStyle(color: c.faint, fontSize: 13.5),
                        prefixIcon: Icon(
                          Icons.search,
                          size: 19,
                          color: c.faint,
                        ),
                        filled: true,
                        fillColor: c.subtle,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 11,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(11),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    height: 38,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      children: [
                        for (final f in ChequeFilter.values)
                          Padding(
                            padding: const EdgeInsets.only(right: 7),
                            child: _Chip(
                              label: _filterLabel[f]!,
                              selected: _filter == f,
                              onTap: () => setState(() => _filter = f),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
          body: list.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: EmptyState(
                    title: 'No cheques match',
                    sub: 'Try a different filter or search term.',
                    icon: Icons.search_off,
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) => _ChequeCard(cheque: list[i]),
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
    return Material(
      color: selected ? c.inverse : c.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? c.inverse : c.line),
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

class _ChequeCard extends StatelessWidget {
  const _ChequeCard({required this.cheque});
  final Cheque cheque;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final unit = store.unitForCheque(cheque);
    final tenant = store.tenantForCheque(cheque);
    final property = store.property(unit.propertyId);

    return AppCard(
      padding: const EdgeInsets.all(13),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChequeDetailScreen(chequeId: cheque.id),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Unit ${unit.unitNo} · ${property.code}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              StatusBadge(
                chequeStatusLabel[cheque.status]!,
                tone: chequeTone(cheque.status),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            tenant.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c.muted, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${cheque.chequeNo} · ${cheque.bank}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: c.fgSoft,
                        fontSize: 12,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${fmtDate(cheque.dueDate)} · ${relativeDays(cheque.daysToDue)}',
                      style: TextStyle(
                        color: cheque.isOverdue ? c.red700 : c.muted,
                        fontSize: 11.5,
                        fontWeight: cheque.isOverdue
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    aed(cheque.amount),
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${cheque.seq} of ${cheque.ofTotal}',
                    style: TextStyle(color: c.faint, fontSize: 11),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
