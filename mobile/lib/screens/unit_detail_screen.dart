import 'package:flutter/material.dart';

import '../data/photos.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'contract_detail_screen.dart';

/// One unit, and everything currently attached to it.
///
/// Opened by tapping a unit card. The unit itself is only half the answer —
/// what anyone actually wants to know is whether it is let, to whom, until
/// when, and what is broken — so the live tenancy and the open maintenance
/// come with it rather than sitting a search away on another screen.
class UnitDetailScreen extends StatelessWidget {
  const UnitDetailScreen({super.key, required this.unitId});

  final String unitId;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final unit = store.units.firstWhere((u) => u.id == unitId);
        final property = store.property(unit.propertyId);
        final m2 = (unit.sizeSqft * 0.0929).round();

        // The tenancy that is running now, if there is one. A unit keeps its
        // expired contracts, so the latest live one is the one that matters.
        final contract = store.contracts
            .where(
              (x) =>
                  x.unitId == unit.id &&
                  (x.status == ContractStatus.active ||
                      x.status == ContractStatus.expiring),
            )
            .fold<Contract?>(
              null,
              (best, x) =>
                  best == null || x.endDate.isAfter(best.endDate) ? x : best,
            );
        final tenant = contract == null ? null : store.tenant(contract.tenantId);

        final jobs = store.maintenance
            .where(
              (m) =>
                  m.unitId == unit.id &&
                  m.status != MaintenanceStatus.completed &&
                  m.status != MaintenanceStatus.closed,
            )
            .toList();

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            backgroundColor: c.canvas,
            surfaceTintColor: c.canvas,
            elevation: 0,
            foregroundColor: c.fg,
            title: Text(
              'Unit ${unit.unitNo}',
              style: TextStyle(
                color: c.fg,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
            children: [
              PropertyPhoto(
                url: Photos.interior(unit.id),
                gradient: const [Color(0xFF2B3A4A), Color(0xFF5C7189)],
                height: 200,
              ),
              const SizedBox(height: 16),

              Text(
                '${property.name} · ${unit.unitNo}',
                style: TextStyle(
                  color: c.fg,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${property.area} · Floor ${unit.floor} · ${unit.type}',
                style: TextStyle(color: c.muted, fontSize: 14),
              ),
              const SizedBox(height: 18),

              _Facts(
                rows: [
                  ('Status', _statusLabel(unit.status)),
                  ('Size', '$m2 m² (${unit.sizeSqft} sq ft)'),
                  ('Market rent', 'AED ${unit.marketRent.round()}'),
                  ('Building', '${property.code} · ${property.floors} floors'),
                ],
              ),
              const SizedBox(height: 22),

              SectionHeader(title: 'Tenancy'),
              const SizedBox(height: 10),
              if (contract == null)
                _Note(
                  icon: Icons.event_available_outlined,
                  text: unit.status == UnitStatus.vacant
                      ? 'Vacant — no tenancy running on this unit.'
                      : 'No live tenancy recorded against this unit.',
                )
              else
                _TenancyCard(
                  contract: contract,
                  tenantName: tenant?.name ?? '—',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) =>
                          ContractDetailScreen(contractId: contract.id),
                    ),
                  ),
                ),
              const SizedBox(height: 22),

              SectionHeader(title: 'Open maintenance'),
              const SizedBox(height: 10),
              if (jobs.isEmpty)
                const _Note(
                  icon: Icons.check_circle_outline,
                  text: 'Nothing outstanding on this unit.',
                )
              else
                ...jobs.map(
                  (m) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: c.line),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.build_outlined, size: 18, color: c.muted),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                m.category,
                                style: TextStyle(
                                  color: c.fg,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                m.description,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: c.muted, fontSize: 12.5),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  static String _statusLabel(UnitStatus s) => switch (s) {
    UnitStatus.vacant => 'Vacant',
    UnitStatus.occupied => 'Occupied',
    UnitStatus.reserved => 'Reserved',
    UnitStatus.maintenance => 'Under maintenance',
  };
}

class _Facts extends StatelessWidget {
  const _Facts({required this.rows});
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c.line),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
              decoration: BoxDecoration(
                border: i == rows.length - 1
                    ? null
                    : Border(bottom: BorderSide(color: c.lineSoft)),
              ),
              child: Row(
                children: [
                  Text(
                    rows[i].$1,
                    style: TextStyle(color: c.muted, fontSize: 13),
                  ),
                  const Spacer(),
                  Flexible(
                    child: Text(
                      rows[i].$2,
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
            ),
        ],
      ),
    );
  }
}

class _TenancyCard extends StatelessWidget {
  const _TenancyCard({
    required this.contract,
    required this.tenantName,
    required this.onTap,
  });

  final Contract contract;
  final String tenantName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final days = contract.endDate.difference(DateTime.now()).inDays;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: c.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    tenantName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Icon(Icons.chevron_right, size: 20, color: c.faint),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${contract.ref} · AED ${contract.annualRent.round()} a year',
              style: TextStyle(color: c.muted, fontSize: 13),
            ),
            const SizedBox(height: 10),
            Text(
              days < 0
                  ? 'Expired ${-days} days ago'
                  : 'Expires in $days days · ${contract.chequeCount} cheques',
              style: TextStyle(
                color: days < 90 ? c.fg : c.muted,
                fontSize: 12.5,
                fontWeight: days < 90 ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: c.subtle,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: c.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: c.fgSoft, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
