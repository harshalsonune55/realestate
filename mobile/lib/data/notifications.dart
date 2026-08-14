import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'rbac.dart';
import 'store.dart';

/// One notifiable condition found in the store.
///
/// [key] identifies the *state*, not the moment — it folds in the count, so a
/// second overdue cheque produces a new key and a fresh notification while the
/// unchanged situation stays quiet.
@immutable
class AlertNotice {
  const AlertNotice({
    required this.id,
    required this.key,
    required this.title,
    required this.body,
    this.critical = false,
  });

  final int id;
  final String key, title, body;
  final bool critical;
}

/// Local notifications for the alerts the dashboard already surfaces.
///
/// Everything is computed on-device from [Store]; there is no push service and
/// no server involved, which matches how the rest of the demo app works. The
/// trade-off is that alerts can only be raised while the app is running —
/// see [sync], which is called on sign-in and whenever the app is resumed.
class Notifications {
  Notifications._();
  static final Notifications instance = Notifications._();

  static const _channelId = 'pms_alerts';
  static const _seenKey = 'notified_alert_keys_v1';

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _granted = false;

  /// Keys already delivered, so a resume does not re-raise the same alert.
  Set<String> _seen = {};

  bool get granted => _granted;

  /// True once the platform plugin has been reached. Stays false in widget
  /// tests and on any platform where the plugin is not registered — every
  /// public method below is a no-op in that case rather than an exception, so
  /// a missing notification channel can never take a screen down.
  bool _available = false;

  Future<void> init() async {
    if (_ready) return;
    _ready = true;

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    try {
      await _plugin.initialize(
        settings: const InitializationSettings(android: android, iOS: darwin),
      );
      _available = true;
    } catch (_) {
      // No plugin registrar (widget tests, unsupported platform).
      _available = false;
      return;
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      _seen = (prefs.getStringList(_seenKey) ?? const <String>[]).toSet();
    } catch (_) {
      _seen = {};
    }
  }

  /// Asks for the runtime permission Android 13+ requires. Safe to call more
  /// than once; the OS only shows the prompt the first time.
  Future<bool> requestPermission() async {
    await init();
    if (!_available) return false;
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (android != null) {
      _granted = await android.requestNotificationsPermission() ?? false;
      return _granted;
    }
    final ios = _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >();
    _granted =
        await ios?.requestPermissions(alert: true, badge: true, sound: true) ??
        false;
    return _granted;
  }

  /// Everything worth interrupting someone for, for the signed-in user.
  ///
  /// Scoped by role: an accountant is told about cheques, an approver about
  /// the queue waiting on them. Someone who cannot open the page is never
  /// notified about it.
  List<AlertNotice> pending(Store store) {
    final user = store.currentUser;
    if (user == null) return const [];

    final notices = <AlertNotice>[];

    if (can(user.role, Perm.chequesView)) {
      final overdue = store.cheques.where((c) => c.isOverdue).toList();
      if (overdue.isNotEmpty) {
        final worst = overdue.reduce(
          (a, b) => a.daysToDue < b.daysToDue ? a : b,
        );
        notices.add(
          AlertNotice(
            id: 101,
            key: 'overdue:${overdue.length}',
            title: overdue.length == 1
                ? 'A cheque is overdue'
                : '${overdue.length} cheques are overdue',
            body:
                'Cheque ${worst.chequeNo} is ${-worst.daysToDue} days past its '
                'due date. Bank it or record a bounce.',
            critical: true,
          ),
        );
      }

      final bounced = store.cheques
          .where((c) => c.status == ChequeStatus.bounced)
          .length;
      if (bounced > 0) {
        notices.add(
          AlertNotice(
            id: 102,
            key: 'bounced:$bounced',
            title: bounced == 1
                ? 'A cheque has bounced'
                : '$bounced cheques have bounced',
            body: 'Money is at risk. Open Cheques to start recovery.',
            critical: true,
          ),
        );
      }

      final dueSoon = store.cheques
          .where((c) => c.isDueSoon && !c.isOverdue)
          .length;
      if (dueSoon > 0) {
        notices.add(
          AlertNotice(
            id: 103,
            key: 'duesoon:$dueSoon',
            title: '$dueSoon cheque${dueSoon > 1 ? 's' : ''} due soon',
            body: 'Falling due within the next 14 days.',
          ),
        );
      }
    }

    if (can(user.role, Perm.approvalsDecide)) {
      final waiting = store.approvals
          .where((a) => a.status == ApprovalStatus.pending)
          .length;
      if (waiting > 0) {
        notices.add(
          AlertNotice(
            id: 104,
            key: 'approvals:$waiting',
            title: '$waiting approval${waiting > 1 ? 's' : ''} waiting on you',
            body: 'Nothing moves until these are decided.',
          ),
        );
      }
    }

    final overdueTasks = store
        .tasksFor(user.id)
        .where((t) => t.status == TaskStatus.overdue)
        .length;
    if (overdueTasks > 0) {
      notices.add(
        AlertNotice(
          id: 105,
          key: 'tasks:${user.id}:$overdueTasks',
          title: '$overdueTasks of your tasks ${overdueTasks > 1 ? 'are' : 'is'} overdue',
          body: 'Open My Tasks to clear them.',
          critical: true,
        ),
      );
    }

    return notices;
  }

  /// Raises anything new since the last check. Alerts whose state has not
  /// changed stay silent, so opening the app ten times does not produce ten
  /// identical notifications.
  Future<void> sync(Store store) async {
    await init();
    if (!_available || !_granted) return;

    final notices = pending(store);
    final live = notices.map((n) => n.key).toSet();

    for (final n in notices) {
      if (_seen.contains(n.key)) continue;
      await _show(n);
      _seen.add(n.key);
    }

    // Drop keys whose condition has cleared, so the alert can fire again if it
    // comes back — otherwise a resolved-then-recurring problem stays quiet.
    _seen = _seen.where(live.contains).toSet();

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_seenKey, _seen.toList());
    } catch (_) {
      // Dedupe record is best-effort; alerts still work without it.
    }
  }

  Future<void> _show(AlertNotice n) async {
    final android = AndroidNotificationDetails(
      _channelId,
      'Alerts',
      channelDescription:
          'Overdue cheques, bounced payments, approvals and overdue tasks.',
      importance: n.critical ? Importance.high : Importance.defaultImportance,
      priority: n.critical ? Priority.high : Priority.defaultPriority,
      styleInformation: BigTextStyleInformation(n.body),
    );
    await _plugin.show(
      id: n.id,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(
        android: android,
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  /// Clears delivered notifications and the dedupe record — used on sign-out so
  /// one employee's alerts do not linger for the next person on the handset.
  Future<void> clearAll() async {
    await init();
    _seen = {};
    if (!_available) return;
    await _plugin.cancelAll();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_seenKey);
    } catch (_) {
      // Nothing persisted to clear.
    }
  }
}
