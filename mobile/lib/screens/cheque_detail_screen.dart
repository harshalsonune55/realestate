import 'package:flutter/material.dart';
import '../data/rbac.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'deposit_wizard.dart';

class ChequeDetailScreen extends StatelessWidget {
  const ChequeDetailScreen({super.key, required this.chequeId});
  final String chequeId;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final cheque = store.cheques.firstWhere((x) => x.id == chequeId);
        final contract = store.contractForCheque(cheque);
        final unit = store.unitForCheque(cheque);
        final tenant = store.tenantForCheque(cheque);
        final property = store.property(unit.propertyId);
        final user = store.currentUser!;
        final canDeposit =
            can(user.role, Perm.chequesDeposit) &&
            cheque.status == ChequeStatus.pending;

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            title: Text('Cheque ${cheque.chequeNo}'),
            backgroundColor: c.surface,
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
            children: [
              // ------------------------------------------------- hero amount
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            aed(cheque.amount),
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
                          chequeStatusLabel[cheque.status]!,
                          tone: chequeTone(cheque.status),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'Cheque ${cheque.seq} of ${cheque.ofTotal} · due ${fmtDate(cheque.dueDate)}',
                      style: TextStyle(color: c.muted, fontSize: 13),
                    ),
                    if (cheque.isOverdue) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(11),
                        decoration: BoxDecoration(
                          color: c.red50,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: c.red200),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.error_outline,
                              size: 17,
                              color: c.red600,
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Text(
                                'Overdue by ${-cheque.daysToDue} days. Bank it today.',
                                style: TextStyle(
                                  color: c.red800,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),

              SectionHeader(title: 'Cheque'),
              AppCard(
                child: Column(
                  children: [
                    KeyValueRow('Cheque number', cheque.chequeNo, strong: true),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow('Bank', cheque.bank),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow('Due date', fmtDate(cheque.dueDate)),
                    if (cheque.depositSlipNo != null) ...[
                      Divider(height: 1, color: c.lineSoft),
                      KeyValueRow('Deposit slip', cheque.depositSlipNo!),
                    ],
                    if (cheque.bounceReason != null) ...[
                      Divider(height: 1, color: c.lineSoft),
                      KeyValueRow(
                        'Return reason',
                        cheque.bounceReason!,
                        valueColor: c.red700,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),

              SectionHeader(title: 'Tenancy'),
              AppCard(
                child: Column(
                  children: [
                    KeyValueRow('Contract', contract.ref),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow('Unit', '${unit.unitNo} · ${unit.type}'),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow('Building', property.name),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow('Tenant', tenant.name),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow('Phone', tenant.phone),
                    Divider(height: 1, color: c.lineSoft),
                    KeyValueRow(
                      'Annual rent',
                      aed(contract.annualRent),
                      strong: true,
                    ),
                  ],
                ),
              ),
            ],
          ),
          bottomNavigationBar: canDeposit
              ? Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  decoration: BoxDecoration(
                    color: c.surface,
                    border: Border(top: BorderSide(color: c.line)),
                  ),
                  child: SafeArea(
                    top: false,
                    child: PrimaryButton(
                      label: 'Bank this cheque',
                      icon: Icons.account_balance,
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => DepositWizard(chequeId: cheque.id),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
        );
      },
    );
  }
}
