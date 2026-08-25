import 'package:flutter/material.dart';
import '../data/rbac.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import 'approvals_screen.dart';
import 'cheques_screen.dart';
import 'dashboard_screen.dart';
import 'more_screen.dart';
import 'tasks_screen.dart';

/// The web app's 20-item sidebar does not transfer to a phone. Instead the five
/// destinations staff use in the field get a bottom bar, and everything else
/// lives behind "More" — the same information architecture, re-cut for thumbs.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final user = store.currentUser;
        if (user == null) return const SizedBox.shrink();

        final destinations =
            <
              ({
                String label,
                IconData icon,
                IconData active,
                Widget page,
                int badge,
              })
            >[
              (
                label: 'Home',
                icon: Icons.dashboard_outlined,
                active: Icons.dashboard,
                page: const DashboardScreen(),
                badge: 0,
              ),
              if (can(user.role, Perm.chequesView))
                (
                  label: 'Cheques',
                  icon: Icons.account_balance_outlined,
                  active: Icons.account_balance,
                  page: const ChequesScreen(),
                  badge: store.cheques
                      .where(
                        (c) => c.isOverdue || c.status == ChequeStatus.bounced,
                      )
                      .length,
                ),
              (
                label: 'Tasks',
                icon: Icons.checklist_outlined,
                active: Icons.checklist,
                page: const TasksScreen(),
                badge: store.tasksFor(user.id).length,
              ),
              if (can(user.role, Perm.approvalsView))
                (
                  label: 'Approvals',
                  icon: Icons.verified_user_outlined,
                  active: Icons.verified_user,
                  page: const ApprovalsScreen(),
                  badge: store.pendingApprovals,
                ),
              (
                label: 'More',
                icon: Icons.more_horiz_outlined,
                active: Icons.more_horiz,
                page: const MoreScreen(),
                badge: 0,
              ),
            ];

        final safeIndex = _index.clamp(0, destinations.length - 1);

        return Scaffold(
          backgroundColor: c.canvas,
          body: IndexedStack(
            index: safeIndex,
            children: [for (final d in destinations) d.page],
          ),
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              color: c.surface,
              border: Border(top: BorderSide(color: c.line)),
            ),
            child: SafeArea(
              top: false,
              child: SizedBox(
                height: 60,
                child: Row(
                  children: [
                    for (var i = 0; i < destinations.length; i++)
                      Expanded(
                        child: _NavItem(
                          label: destinations[i].label,
                          icon: i == safeIndex
                              ? destinations[i].active
                              : destinations[i].icon,
                          selected: i == safeIndex,
                          badge: destinations[i].badge,
                          onTap: () => setState(() => _index = i),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.selected,
    required this.badge,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final bool selected;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final color = selected ? c.brand600 : c.muted;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(icon, size: 22, color: color),
              if (badge > 0)
                Positioned(
                  right: -7,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 1,
                    ),
                    constraints: const BoxConstraints(minWidth: 15),
                    decoration: BoxDecoration(
                      color: c.red500,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: c.surface, width: 1.5),
                    ),
                    child: Text(
                      badge > 99 ? '99+' : '$badge',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 10.5,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
