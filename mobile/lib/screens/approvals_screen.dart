import 'package:flutter/material.dart';
import '../data/rbac.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class ApprovalsScreen extends StatelessWidget {
  const ApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final user = store.currentUser!;
        final decider = can(user.role, Perm.approvalsDecide);
        final pending = store.approvals
            .where((a) => a.status == ApprovalStatus.pending)
            .toList();

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            title: const Text('Approvals'),
            backgroundColor: c.surface,
          ),
          body: pending.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: EmptyState(
                    title: 'Nothing waiting for a decision',
                    sub: 'Requests appear here the moment they are raised.',
                    icon: Icons.verified_outlined,
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                  children: [
                    if (!decider)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Container(
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: c.sky50,
                            borderRadius: BorderRadius.circular(11),
                            border: Border.all(color: c.sky200),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.info_outline,
                                size: 17,
                                color: c.sky700,
                              ),
                              const SizedBox(width: 9),
                              Expanded(
                                child: Text(
                                  'You can see these requests but only a manager can decide them.',
                                  style: TextStyle(
                                    color: c.sky800,
                                    fontSize: 12.5,
                                    height: 1.4,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    for (final a in pending)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ApprovalCard(approval: a, canDecide: decider),
                      ),
                  ],
                ),
        );
      },
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({required this.approval, required this.canDecide});
  final Approval approval;
  final bool canDecide;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final requester = store.user(approval.requestedBy);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  approval.title,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              StatusBadge(approval.ref, tone: Tone.neutral, dot: false),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            approval.summary,
            style: TextStyle(color: c.fgSoft, fontSize: 13, height: 1.45),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: c.subtle,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Requested by',
                        style: TextStyle(color: c.muted, fontSize: 11),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${requester.name} · ${roleLabel[requester.role]}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: c.fg,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (approval.amount != null)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'Amount',
                        style: TextStyle(color: c.muted, fontSize: 11),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        aed(approval.amount!),
                        style: TextStyle(
                          color: c.fg,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          if (canDecide) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 44,
                    child: OutlinedButton(
                      onPressed: () => _decide(context, false),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: c.red200),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(11),
                        ),
                      ),
                      child: Text(
                        'Reject',
                        style: TextStyle(
                          color: c.red700,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: PrimaryButton(
                    label: 'Approve',
                    onPressed: () => _decide(context, true),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _decide(BuildContext context, bool approved) {
    Store.instance.decideApproval(approval, approved);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${approved ? 'Approved' : 'Rejected'} ${approval.ref}'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
