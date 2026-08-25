import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/notifications.dart';
import '../data/rbac.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'access_log_screen.dart';
import 'maintenance_screen.dart';
import 'messages_screen.dart';
import 'todo_screen.dart';
import 'properties_screen.dart';
import 'units_screen.dart';
import 'visits_screen.dart';
import 'ai_chat_screen.dart';
import 'alerts_screen.dart';
import 'contracts_screen.dart';
import 'profile_screen.dart';
import 'tenants_screen.dart';

/// Everything the bottom bar cannot hold, plus the account and theme controls.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final user = store.currentUser!;

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(title: const Text('More'), backgroundColor: c.surface),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            children: [
              // ------------------------------------------------------ account
              AppCard(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ProfileScreen()),
                ),
                child: Row(
                  children: [
                    Avatar(
                      initials: user.initials,
                      base64Image: store.avatarFor(user.id),
                      size: 46,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.name,
                            style: TextStyle(
                              color: c.fg,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${user.title} · ${roleLabel[user.role]}',
                            style: TextStyle(color: c.muted, fontSize: 12.5),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, size: 19, color: c.faint),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // --------------------------------------------- access requests
              // People who signed up in the app and are waiting to be let in.
              if (can(user.role, Perm.adminUsers) &&
                  store.pendingUsers.isNotEmpty) ...[
                SectionHeader(
                  title: 'Access requests',
                  sub: 'Signups stay locked out until you approve them.',
                ),
                AppCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (final p in store.pendingUsers)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.name,
                                style: TextStyle(
                                  color: c.fg,
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${p.title} · ${p.email}\n'
                                'Asked for: ${roleLabel[p.requestedRole ?? Role.viewer]}',
                                style: TextStyle(
                                  color: c.muted,
                                  fontSize: 12,
                                  height: 1.45,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: FilledButton.icon(
                                      onPressed: () => store.approveSignup(
                                        p,
                                        p.requestedRole ?? Role.viewer,
                                      ),
                                      icon: const Icon(Icons.check, size: 16),
                                      label: const Text('Approve'),
                                      style: FilledButton.styleFrom(
                                        backgroundColor: c.brandSolid,
                                        foregroundColor: Colors.white,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: () => store.declineSignup(p),
                                      icon: Icon(
                                        Icons.close,
                                        size: 16,
                                        color: c.red700,
                                      ),
                                      label: Text(
                                        'Decline',
                                        style: TextStyle(color: c.red700),
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        side: BorderSide(color: c.line),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              SectionHeader(title: 'Tools'),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _Row(
                      icon: Icons.checklist_rounded,
                      label: 'To-Do',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const TodoScreen()),
                      ),
                    ),
                    _Row(
                      icon: Icons.forum_outlined,
                      label: 'Messages',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const MessagesScreen()),
                      ),
                    ),
                    _Row(
                      icon: Icons.notifications_none,
                      label: 'Alerts',
                      trailing:
                          '${Notifications.instance.pending(store).length}',
                      // Becomes the last row — and so loses its divider — when
                      // the assistant below it is hidden for this role.
                      last: !can(user.role, Perm.assistantUse),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const AlertsScreen()),
                      ),
                    ),
                    if (can(user.role, Perm.assistantUse))
                      _Row(
                        icon: Icons.auto_awesome,
                        label: 'Assistant',
                        trailing: 'Ask',
                        last: true,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const AiChatScreen()),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              SectionHeader(title: 'Records'),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    if (can(user.role, Perm.contractsView))
                      _Row(
                        icon: Icons.location_city_outlined,
                        label: 'Properties',
                        trailing: '${store.properties.length}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const PropertiesScreen(),
                          ),
                        ),
                      ),
                    if (can(user.role, Perm.contractsView))
                      _Row(
                        icon: Icons.apartment_outlined,
                        label: 'My Units',
                        trailing: '${store.units.length}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const UnitsScreen(),
                          ),
                        ),
                      ),
                    if (can(user.role, Perm.contractsView))
                      _Row(
                        icon: Icons.event_available_outlined,
                        label: 'Viewings',
                        trailing: '${store.visits.length}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const VisitsScreen(),
                          ),
                        ),
                      ),
                    if (can(user.role, Perm.maintenanceView))
                      _Row(
                        icon: Icons.build_outlined,
                        label: 'Maintenance',
                        trailing: '${store.maintenance.length}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const MaintenanceScreen(),
                          ),
                        ),
                      ),
                    if (can(user.role, Perm.contractsView))
                      _Row(
                        icon: Icons.description_outlined,
                        label: 'Contracts',
                        trailing: '${store.contracts.length}',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ContractsScreen(),
                          ),
                        ),
                      ),
                    if (can(user.role, Perm.tenantsView))
                      _Row(
                        icon: Icons.people_outline,
                        label: 'Tenants',
                        trailing: '${store.tenants.length}',
                        last: !can(user.role, Perm.adminUsers),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const TenantsScreen(),
                          ),
                        ),
                      ),
                    // Who has been in the app, as opposed to what they changed
                    // once inside — that stays in the audit log below.
                    if (can(user.role, Perm.adminUsers))
                      _Row(
                        icon: Icons.badge_outlined,
                        label: 'Employee access',
                        trailing: '${store.sessions.length}',
                        last: true,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const AccessLogScreen(),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              SectionHeader(
                title: 'Recent activity',
                sub: 'Every action, permanently recorded.',
              ),
              AppCard(
                child: Column(
                  children: [
                    for (final a in store.audit.take(6))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 11),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              margin: const EdgeInsets.only(top: 5, right: 10),
                              decoration: BoxDecoration(
                                color: c.faint,
                                shape: BoxShape.circle,
                              ),
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    a.summary,
                                    style: TextStyle(
                                      color: c.fgSoft,
                                      fontSize: 12.5,
                                      height: 1.35,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${a.actorName.split(' ').first} · '
                                    '${fmtDate(a.at)}',
                                    style: TextStyle(
                                      color: c.faint,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: () {
                    store.signOut();
                    // One employee's alerts must not linger on the handset for
                    // whoever signs in next.
                    Notifications.instance.clearAll();
                    // Straight to the sign-in screen: '/' now replays the
                    // opening title card, which belongs to app launch only.
                    Navigator.of(
                      context,
                    ).pushNamedAndRemoveUntil('/login', (_) => false);
                  },
                  icon: Icon(Icons.logout, size: 17, color: c.red700),
                  label: Text(
                    'Sign out',
                    style: TextStyle(
                      color: c.red700,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: c.line),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Center(
                child: Text(
                  'Aber Group PMS · internal system',
                  style: TextStyle(color: c.faint, fontSize: 11),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.onTap,
    this.trailing,
    this.last = false,
  });
  final IconData icon;
  final String label;
  final String? trailing;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        decoration: BoxDecoration(
          border: last ? null : Border(bottom: BorderSide(color: c.lineSoft)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 19, color: c.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: c.fg,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (trailing != null)
              Text(trailing!, style: TextStyle(color: c.muted, fontSize: 12.5)),
            Icon(Icons.chevron_right, size: 18, color: c.faint),
          ],
        ),
      ),
    );
  }
}

/// Holds the selected theme so the toggle in More can drive MaterialApp.
class ThemeController extends ChangeNotifier {
  ThemeController._();
  static final ThemeController instance = ThemeController._();

  static const _pref = 'theme_mode_v2'; // v2: default light/white

  // Light by default — the company runs the app light; dark stays available
  // behind the toggle rather than following the OS setting.
  ThemeMode _mode = ThemeMode.light;
  ThemeMode get mode => _mode;

  /// Reads the saved choice. Awaited in `main()` before the first frame so the
  /// app opens in the chosen theme rather than flashing light and correcting.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _mode = prefs.getString(_pref) == 'dark'
          ? ThemeMode.dark
          : ThemeMode.light;
      notifyListeners();
    } catch (_) {
      // No prefs plugin — the default stands.
    }
  }

  void set(ThemeMode m) {
    _mode = m;
    notifyListeners();
    _save(m);
  }

  Future<void> _save(ThemeMode m) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_pref, m == ThemeMode.dark ? 'dark' : 'light');
    } catch (_) {
      // In-memory only; the choice simply does not survive a restart.
    }
  }
}
