import 'package:flutter/material.dart';
import '../data/rbac.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'cheque_detail_screen.dart';

/// Everything about one tenancy: the money, the parties, and the cheque
/// schedule it generated. Reached by tapping a row on [ContractsScreen].
class ContractDetailScreen extends StatelessWidget {
  const ContractDetailScreen({super.key, required this.contractId});
  final String contractId;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final ct = store.contract(contractId);
        final unit = store.unit(ct.unitId);
        final tenant = store.tenant(ct.tenantId);
        final property = store.property(unit.propertyId);
        final user = store.currentUser!;

        final cheques =
            store.cheques.where((x) => x.contractId == ct.id).toList()
              ..sort((a, b) => a.seq.compareTo(b.seq));
        final cleared = cheques
            .where((x) => x.status == ChequeStatus.cleared)
            .fold<num>(0, (sum, x) => sum + x.amount);
        final daysLeft = ct.endDate.difference(DateTime.now()).inDays;

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(title: Text(ct.ref), backgroundColor: c.surface),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              // --------------------------------------------------- hero card
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            aed(ct.annualRent),
                            style: TextStyle(
                              color: c.fg,
                              fontSize: 27,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.6,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
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
                      'a year · ${ct.chequeCount} cheque'
                      '${ct.chequeCount > 1 ? 's' : ''}',
                      style: TextStyle(color: c.muted, fontSize: 12.5),
                    ),
                    const SizedBox(height: 14),
                    ProgressBar(
                      value: ct.annualRent == 0 ? 0 : cleared / ct.annualRent,
                      tone: Tone.good,
                    ),
                    const SizedBox(height: 7),
                    Text(
                      '${aed(cleared)} collected of ${aed(ct.annualRent)}',
                      style: TextStyle(color: c.faint, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ------------------------------------------------------ parties
              SectionHeader(title: 'Tenancy'),
              AppCard(
                child: Column(
                  children: [
                    KeyValueRow('Tenant', tenant.name),
                    KeyValueRow('Unit', 'Unit ${unit.unitNo} · ${unit.type}'),
                    KeyValueRow('Property', property.name),
                    KeyValueRow('Ejari', ct.ejariNo),
                    KeyValueRow('Starts', fmtDate(ct.startDate)),
                    KeyValueRow(
                      'Ends',
                      '${fmtDate(ct.endDate)} · '
                      '${daysLeft < 0 ? 'expired' : 'in $daysLeft days'}',
                      valueColor: daysLeft <= 90 ? c.amber700 : null,
                    ),
                    KeyValueRow(
                      'Security deposit',
                      aed(ct.securityDeposit),
                      strong: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ------------------------------------------------ cheque ladder
              if (can(user.role, Perm.chequesView)) ...[
                SectionHeader(
                  title: 'Cheque schedule',
                  sub: 'Every cheque this tenancy generated.',
                ),
                if (cheques.isEmpty)
                  const EmptyState(
                    title: 'No cheques recorded',
                    icon: Icons.receipt_long_outlined,
                  )
                else
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var i = 0; i < cheques.length; i++)
                          _ChequeLine(
                            cheque: cheques[i],
                            last: i == cheques.length - 1,
                          ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _ChequeLine extends StatelessWidget {
  const _ChequeLine({required this.cheque, required this.last});
  final Cheque cheque;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChequeDetailScreen(chequeId: cheque.id),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
        decoration: BoxDecoration(
          border: last
              ? null
              : Border(bottom: BorderSide(color: c.lineSoft)),
        ),
        child: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: c.subtle,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Text(
                '${cheque.seq}',
                style: TextStyle(
                  color: c.muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    cheque.chequeNo,
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  Text(
                    'Due ${fmtDate(cheque.dueDate)} · ${cheque.bank}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.faint, fontSize: 11),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  aed(cheque.amount),
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 3),
                StatusBadge(
                  chequeStatusLabel[cheque.status]!,
                  tone: chequeTone(cheque.status),
                  dot: false,
                ),
              ],
            ),
            Icon(Icons.chevron_right, size: 18, color: c.faint),
          ],
        ),
      ),
    );
  }
}
