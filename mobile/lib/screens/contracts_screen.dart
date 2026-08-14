import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'contract_detail_screen.dart';

class ContractsScreen extends StatefulWidget {
  const ContractsScreen({super.key});

  @override
  State<ContractsScreen> createState() => _ContractsScreenState();
}

class _ContractsScreenState extends State<ContractsScreen> {
  bool _expiringOnly = false;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final list =
        store.contracts
            .where((x) => !_expiringOnly || x.status == ContractStatus.expiring)
            .toList()
          ..sort((a, b) => a.endDate.compareTo(b.endDate));

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        title: const Text('Contracts'),
        backgroundColor: c.surface,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton(
              onPressed: () => setState(() => _expiringOnly = !_expiringOnly),
              child: Text(
                _expiringOnly ? 'Show all' : 'Expiring',
                style: TextStyle(
                  color: c.brand600,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        itemCount: list.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final ct = list[i];
          final unit = store.unit(ct.unitId);
          final tenant = store.tenant(ct.tenantId);
          final property = store.property(unit.propertyId);
          final daysLeft = ct.endDate.difference(DateTime.now()).inDays;

          return AppCard(
            padding: const EdgeInsets.all(13),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ContractDetailScreen(contractId: ct.id),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${ct.ref} · Unit ${unit.unitNo}',
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
                      contractStatusLabel[ct.status]!,
                      tone: contractTone(ct.status),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${tenant.name} · ${property.code}',
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
                            aed(ct.annualRent),
                            style: TextStyle(
                              color: c.fg,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                          Text(
                            '${ct.chequeCount} cheque${ct.chequeCount > 1 ? 's' : ''} a year',
                            style: TextStyle(color: c.faint, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'Ends ${fmtDate(ct.endDate)}',
                          style: TextStyle(color: c.fgSoft, fontSize: 12),
                        ),
                        Text(
                          daysLeft < 0 ? 'expired' : 'in $daysLeft days',
                          style: TextStyle(
                            color: daysLeft <= 90 ? c.amber700 : c.faint,
                            fontSize: 11,
                            fontWeight: daysLeft <= 90
                                ? FontWeight.w600
                                : FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
