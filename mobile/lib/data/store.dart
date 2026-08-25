import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';
import 'portfolio_sync.dart';
import 'signup_rules.dart';

/// In-memory store seeded deterministically, mirroring `src/lib/seed.ts`.
///
/// The web app persists to JSON on the server; on the phone the demo data is
/// generated locally from a fixed seed so every install shows the same
/// portfolio and the two can be demonstrated side by side.
class Store extends ChangeNotifier {
  Store._() {
    // Seeded first so the app has something to draw before the network answers
    // — and so it still works with no backend at all. The server's copy
    // replaces it as soon as it arrives.
    _seed();
    // Accounts first: a restored session may point at an account created on a
    // previous launch, which only exists once the accounts are back.
    _restoreAccounts().whenComplete(_restoreCurrentUser);
    _restoreSessions();
    _restoreAvatars();
    firstSync = syncFromServer();
  }

  /// The first sync attempt, so the splash can hold for it rather than letting
  /// the dashboard paint seeded figures and then visibly swap them.
  late final Future<void> firstSync;

  /// True once the server's portfolio has replaced the generated one.
  bool syncedFromServer = false;

  /// When that happened, for the "last updated" line.
  DateTime? lastSyncedAt;

  /// Replaces the generated demo portfolio with the backend's.
  ///
  /// This is what stops the phone and the website disagreeing. Both used to
  /// run the same generator from the same seed, which matched only until
  /// either side changed anything; now the server holds the record and the
  /// phone reads it.
  ///
  /// A failed or empty fetch is a no-op: the app keeps the data it already has
  /// rather than blanking every screen because the Wi-Fi dropped.
  Future<void> syncFromServer() async {
    final snap = await PortfolioSync.fetch();
    if (snap == null || !snap.usable) return;

    // The signed-in identity is held by id, so it survives the swap as long as
    // the server still lists that account.
    final currentId = currentUser?.id;

    properties
      ..clear()
      ..addAll(snap.properties);
    units
      ..clear()
      ..addAll(snap.units);
    tenants
      ..clear()
      ..addAll(snap.tenants);
    contracts
      ..clear()
      ..addAll(snap.contracts);
    cheques
      ..clear()
      ..addAll(snap.cheques);
    payments
      ..clear()
      ..addAll(snap.payments);
    tasks
      ..clear()
      ..addAll(snap.tasks);
    approvals
      ..clear()
      ..addAll(snap.approvals);
    maintenance
      ..clear()
      ..addAll(snap.maintenance);
    if (snap.visits.isNotEmpty) {
      visits
        ..clear()
        ..addAll(snap.visits);
    }

    // Accounts created on this device are kept: they exist only here until
    // somebody approves them, and dropping them would lose a pending signup.
    final serverIds = snap.users.map((u) => u.id).toSet();
    final localOnly = users.where((u) => !serverIds.contains(u.id)).toList();
    users
      ..clear()
      ..addAll(snap.users)
      ..addAll(localOnly);

    if (currentId != null && !users.any((u) => u.id == currentId)) {
      // The account no longer exists on the server — sign out rather than
      // leave the app running as somebody the record does not know.
      currentUser = null;
    }

    syncedFromServer = true;
    lastSyncedAt = DateTime.now();
    notifyListeners();
  }
  static final Store instance = Store._();

  final List<User> users = [];
  final List<Property> properties = [];
  final List<Unit> units = [];
  final List<Tenant> tenants = [];
  final List<Contract> contracts = [];
  final List<Cheque> cheques = [];
  /// Money received. Empty until the first sync — the generated demo data has
  /// no payment records, only cheques.
  final List<Payment> payments = [];
  final List<Task> tasks = [];
  final List<Approval> approvals = [];
  final List<MaintenanceRequest> maintenance = [];
  final List<Visit> visits = [];
  final List<AuditEntry> audit = [];

  User? currentUser;

  /// Sign-in / sign-out history, newest first. Survives restarts so an
  /// administrator can see who has been in the app, not just who is in it now.
  final List<SessionEvent> sessions = [];

  /// Completes once the persisted session has been read back, so the app can
  /// decide between the sign-in screen and the dashboard without flashing one
  /// before the other.
  final restored = Completer<void>();

  static const _sessionKey = 'current_user_v1';

  void signIn(User u) {
    currentUser = u;
    _recordSession(u, SessionKind.signIn);
    _persistCurrentUser(u.id);
    notifyListeners();
  }

  void signOut() {
    final u = currentUser;
    if (u != null) _recordSession(u, SessionKind.signOut);
    currentUser = null;
    _persistCurrentUser(null);
    notifyListeners();
  }

  Future<void> _persistCurrentUser(String? id) async {
    final prefs = await _prefs();
    if (prefs == null) return;
    if (id == null) {
      await prefs.remove(_sessionKey);
    } else {
      await prefs.setString(_sessionKey, id);
    }
  }

  /// Restores the signed-in user from the last run.
  ///
  /// Runs after [_restoreAccounts] so an account created on a previous launch
  /// can be the one restored; a user who has since been suspended or deleted
  /// falls through to the sign-in screen rather than being let back in.
  Future<void> _restoreCurrentUser() async {
    try {
      final prefs = await _prefs();
      final id = prefs?.getString(_sessionKey);
      if (id != null) {
        final match = users.where((u) => u.id == id).firstOrNull;
        if (match != null &&
            match.active &&
            match.status == UserStatus.active) {
          currentUser = match;
          notifyListeners();
        }
      }
    } finally {
      if (!restored.isCompleted) restored.complete();
    }
  }

  /// The most recent sign-in before the current one, or null on first use.
  /// Shown on the profile page so people can spot access they do not recognise.
  SessionEvent? previousSignIn(String userId) {
    final mine = sessions
        .where((s) => s.userId == userId && s.kind == SessionKind.signIn)
        .toList();
    return mine.length < 2 ? null : mine[1];
  }

  List<SessionEvent> sessionsFor(String userId) =>
      sessions.where((s) => s.userId == userId).toList();

  void _recordSession(User u, SessionKind kind) {
    sessions.insert(
      0,
      SessionEvent(
        id: 'S${DateTime.now().microsecondsSinceEpoch}',
        userId: u.id,
        userName: u.name,
        role: u.role,
        kind: kind,
        at: DateTime.now(),
      ),
    );
    // Unbounded growth would eventually bloat the prefs blob; a few hundred
    // events is far more history than a demo handset needs.
    if (sessions.length > 200) sessions.removeRange(200, sessions.length);
    _persistSessions();
  }

  // ------------------------------------------------------- profile pictures
  /// Avatars as base64 PNG/JPEG, keyed by user id.
  ///
  /// Stored inline rather than as file paths because the picker hands back a
  /// path into a cache directory the OS is free to purge; copying the bytes in
  /// is what makes the picture survive a restart. The picker is capped at
  /// 512px so a blob stays well inside what prefs can hold comfortably.
  final Map<String, String> avatars = {};

  static const _avatarsKey = 'avatars_v1';

  String? avatarFor(String userId) => avatars[userId];

  Future<void> setAvatar(String userId, String base64Image) async {
    avatars[userId] = base64Image;
    notifyListeners();
    await _persistAvatars();
  }

  Future<void> clearAvatar(String userId) async {
    avatars.remove(userId);
    notifyListeners();
    await _persistAvatars();
  }

  Future<void> _persistAvatars() async {
    final prefs = await _prefs();
    if (prefs == null) return;
    await prefs.setString(_avatarsKey, jsonEncode(avatars));
  }

  Future<void> _restoreAvatars() async {
    final prefs = await _prefs();
    if (prefs == null) return;
    final raw = prefs.getString(_avatarsKey);
    if (raw == null) return;
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    avatars
      ..clear()
      ..addAll(decoded.map((k, v) => MapEntry(k, v as String)));
    notifyListeners();
  }

  static const _sessionsKey = 'session_log_v1';

  Future<void> _persistSessions() async {
    final prefs = await _prefs();
    if (prefs == null) return;
    await prefs.setStringList(
      _sessionsKey,
      sessions.map((s) => jsonEncode(s.toJson())).toList(),
    );
  }

  Future<void> _restoreSessions() async {
    final prefs = await _prefs();
    if (prefs == null) return;
    final raw = prefs.getStringList(_sessionsKey) ?? const <String>[];
    sessions
      ..clear()
      ..addAll(
        raw.map(
          (s) => SessionEvent.fromJson(jsonDecode(s) as Map<String, dynamic>),
        ),
      );
    notifyListeners();
  }

  // ------------------------------------------------------------------- auth
  /// Seeded demo accounts share one password; production signups set their
  /// own. Matches the web app's Postgres seed exactly — `db/seed.ts` — so one
  /// set of credentials opens either the website or the phone.
  static const demoPassword = 'AlManara2026';

  static String _hash(String password, String salt) =>
      sha256.convert(utf8.encode('$salt:$password')).toString();

  static String _newSalt(Random rnd) => List.generate(
    16,
    (_) => rnd.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();

  /// Signs in by email + password. Returns an error message, or null on
  /// success. The message never distinguishes a wrong address from a wrong
  /// password, so the form cannot be used to discover who is registered.
  String? signInWithEmail(String email, String password) {
    final addr = email.trim().toLowerCase();
    if (addr.isEmpty || password.isEmpty) {
      return 'Enter your email address and password.';
    }

    User? match;
    for (final u in users) {
      if (u.email.toLowerCase() == addr) match = u;
    }

    final ok =
        match != null &&
        (match.passwordHash == null
            ? password == demoPassword
            : match.passwordHash == _hash(password, match.salt!));
    if (!ok) return 'Email or password is not correct.';

    if (match.status == UserStatus.pending) {
      return 'Your account is still waiting for administrator approval.';
    }
    if (match.status == UserStatus.suspended || !match.active) {
      return 'This account has been disabled. Contact your administrator.';
    }

    signIn(match);
    return null;
  }

  /// Registers a pending account and raises a review task for the
  /// administrator. Validation happens in [signUpProblems] before this runs.

  /// Books a viewing after re-checking the rules the form enforces. Returns an
  /// error message, or null on success. Local only — the mobile app has no
  /// backend, so this does not reach the Odoo calendar (that is the web path).
  static const visitEarliestHour = 8;
  static const visitLatestHour = 21;
  static const visitDurations = [15, 30, 45, 60, 90];

  /// Validates a booking against the same rules the web enforces. Returns an
  /// error message, or null when the booking is acceptable. Does not add it.
  String? validateVisit({
    required String unitId,
    required String visitorName,
    required String visitorPhone,
    required String visitorEmail,
    required DateTime startsAt,
    required int durationMins,
  }) {
    if (unitId.isEmpty) return 'Choose the unit for the viewing.';
    if (visitorName.trim().length < 3) return 'Enter the visitor\'s full name.';
    final phone = visitorPhone.replaceAll(RegExp(r'[\s()-]'), '');
    if (!RegExp(r'^\+9715\d{8}$').hasMatch(phone)) {
      return 'Mobile must be a UAE number, e.g. +971501234567.';
    }
    if (visitorEmail.trim().isNotEmpty &&
        !RegExp(r'^[^@\s]+@[^@\s]+\.[a-z]{2,}$', caseSensitive: false)
            .hasMatch(visitorEmail.trim())) {
      return 'Enter a valid email address, or leave it blank.';
    }
    final now = DateTime.now();
    if (startsAt.isBefore(now)) return 'The viewing time has already passed.';
    if (startsAt.isAfter(now.add(const Duration(days: 120)))) {
      return 'Bookings can be at most 120 days ahead.';
    }
    if (startsAt.hour < visitEarliestHour ||
        startsAt.hour >= visitLatestHour) {
      return 'Choose a time within office hours ($visitEarliestHour:00–$visitLatestHour:00).';
    }
    if (!visitDurations.contains(durationMins)) return 'Choose a valid duration.';

    // No double-booking the same unit.
    final end = startsAt.add(Duration(minutes: durationMins));
    final clash = visits.any((v) {
      if (v.unitId != unitId || v.status == VisitStatus.cancelled) return false;
      final vEnd = v.startsAt.add(Duration(minutes: v.durationMins));
      return startsAt.isBefore(vEnd) && v.startsAt.isBefore(end);
    });
    if (clash) return 'That unit already has a viewing overlapping this time.';
    return null;
  }

  /// Local-only booking: validates, then adds to the on-device list. Used when
  /// the PMS backend is unreachable so the booking is not lost.
  String? bookVisit({
    required String unitId,
    required String visitorName,
    required String visitorPhone,
    required String visitorEmail,
    required DateTime startsAt,
    required int durationMins,
    String notes = '',
  }) {
    final err = validateVisit(
      unitId: unitId, visitorName: visitorName, visitorPhone: visitorPhone,
      visitorEmail: visitorEmail, startsAt: startsAt, durationMins: durationMins,
    );
    if (err != null) return err;
    recordBookedVisit(
      ref: 'VW-${3000 + visits.length + 1}',
      unitId: unitId,
      visitorName: visitorName,
      visitorPhone: visitorPhone.replaceAll(RegExp(r'[\s()-]'), ''),
      visitorEmail: visitorEmail,
      startsAt: startsAt,
      durationMins: durationMins,
      notes: notes,
    );
    return null;
  }


  /// Appends a visit already booked and confirmed by the backend, so the mobile
  /// list reflects it. No validation — the server is the source of truth here.
  void recordBookedVisit({
    required String ref,
    required String unitId,
    required String visitorName,
    required String visitorPhone,
    required String visitorEmail,
    required DateTime startsAt,
    required int durationMins,
    String notes = '',
  }) {
    visits.add(
      Visit(
        id: 'VW${visits.length + 1}',
        ref: ref,
        unitId: unitId,
        visitorName: visitorName.trim(),
        visitorPhone: visitorPhone.trim(),
        visitorEmail: visitorEmail.trim(),
        startsAt: startsAt,
        durationMins: durationMins,
        status: VisitStatus.scheduled,
        notes: notes.trim(),
      ),
    );
    notifyListeners();
  }

  User signUp({
    required String name,
    required String email,
    required String phone,
    required String title,
    required Role requestedRole,
    required String password,
  }) {
    final rnd = Random.secure();
    final salt = _newSalt(rnd);
    final maxId = users
        .map((u) => int.tryParse(u.id.replaceFirst('U', '')) ?? 0)
        .fold(0, max);
    final user = User(
      id: 'U${maxId + 1}',
      name: name.trim(),
      email: email.trim().toLowerCase(),
      // effective role stays the lowest until an admin decides
      role: Role.viewer,
      requestedRole: requestedRole,
      title: title.trim(),
      phone: phone.trim(),
      active: false,
      status: UserStatus.pending,
      passwordHash: _hash(password, salt),
      salt: salt,
    );
    users.add(user);

    final admin = users
        .where((u) => u.role == Role.admin && u.active)
        .firstOrNull;
    if (admin != null) {
      tasks.insert(
        0,
        Task(
          id: 'TK-SU-${user.id}',
          title: 'Review access request — ${user.name}',
          detail:
              '${user.name} (${user.title}) requested ${roleLabel[requestedRole]} access.',
          assignedTo: admin.id,
          dueDate: DateTime.now().add(const Duration(days: 1)),
          status: TaskStatus.open,
          priority: 'high',
        ),
      );
    }
    _logAudit(
      user.name,
      'Requested ${roleLabel[requestedRole]} access as ${user.title}',
    );
    _persistAccounts();
    notifyListeners();
    return user;
  }

  List<User> get pendingUsers =>
      users.where((u) => u.status == UserStatus.pending).toList();

  void approveSignup(User u, Role role) {
    _replaceUser(
      u,
      u.copyWith(role: role, active: true, status: UserStatus.active),
    );
    _closeSignupTask(u);
    _logAudit(
      currentUser?.name ?? 'System',
      'Approved ${u.name} as ${roleLabel[role]}',
    );
    _persistAccounts();
    notifyListeners();
  }

  void declineSignup(User u) {
    _replaceUser(u, u.copyWith(active: false, status: UserStatus.suspended));
    _closeSignupTask(u);
    _logAudit(currentUser?.name ?? 'System', 'Declined access for ${u.name}');
    _persistAccounts();
    notifyListeners();
  }

  void _replaceUser(User from, User to) {
    final i = users.indexWhere((x) => x.id == from.id);
    if (i >= 0) users[i] = to;
  }

  void _closeSignupTask(User u) {
    for (final t in tasks.where((t) => t.id == 'TK-SU-${u.id}')) {
      t.status = TaskStatus.done;
    }
  }

  void _logAudit(String actor, String summary) {
    audit.insert(
      0,
      AuditEntry(
        id: 'A${audit.length + 1}',
        at: DateTime.now(),
        actorName: actor,
        summary: summary,
        entityId: 'user',
      ),
    );
  }

  // The seed regenerates on every launch, but accounts people created must
  // survive a restart — otherwise a signup evaporates with the process.
  static const _accountsKey = 'signup_accounts_v1';

  /// Shared preferences, or null when the platform plugin is unavailable.
  ///
  /// Widget tests run without the plugin registrar, and a demo store must not
  /// fail a sign-in because storage is missing — persistence is a convenience
  /// here, not a correctness requirement. Everything degrades to in-memory.
  static Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }

  Future<void> _persistAccounts() async {
    final prefs = await _prefs();
    if (prefs == null) return;
    final created = users.where((u) => u.passwordHash != null).toList();
    await prefs.setString(
      _accountsKey,
      jsonEncode([for (final u in created) u.toJson()]),
    );
  }

  Future<void> _restoreAccounts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_accountsKey);
      if (raw == null) return;
      for (final j in jsonDecode(raw) as List) {
        final u = User.fromJson((j as Map).cast<String, Object?>());
        if (!users.any((x) => x.email.toLowerCase() == u.email.toLowerCase())) {
          users.add(u);
        }
      }
      notifyListeners();
    } catch (_) {
      // Corrupt or legacy payload: the demo seed still works without it.
    }
  }

  // ------------------------------------------------------------------ lookups
  Unit unit(String id) => units.firstWhere((u) => u.id == id);
  Tenant tenant(String id) => tenants.firstWhere((t) => t.id == id);
  Contract contract(String id) => contracts.firstWhere((c) => c.id == id);
  Property property(String id) => properties.firstWhere((p) => p.id == id);
  User user(String id) => users.firstWhere((u) => u.id == id);

  Contract contractForCheque(Cheque c) => contract(c.contractId);
  Unit unitForCheque(Cheque c) => unit(contractForCheque(c).unitId);
  Tenant tenantForCheque(Cheque c) => tenant(contractForCheque(c).tenantId);

  // --------------------------------------------------------------------- KPIs
  int get occupiedCount =>
      units.where((u) => u.status == UnitStatus.occupied).length;
  double get occupancy => units.isEmpty ? 0 : occupiedCount / units.length;

  num get annualisedRent => contracts
      .where(
        (c) =>
            c.status == ContractStatus.active ||
            c.status == ContractStatus.expiring,
      )
      .fold<num>(0, (sum, c) => sum + c.annualRent);

  /// Rent banked over the last twelve months.
  ///
  /// Deliberately the same definition the website's KPI uses — payments by the
  /// date they were received — rather than a sum of cleared cheques. The two
  /// are close but never equal, and having each side define "collected" its own
  /// way is precisely what made the same label show two different numbers.
  ///
  /// Falls back to cleared cheques only when there are no payment records at
  /// all, which is the case for the generated data before the first sync.
  num get collected {
    if (payments.isEmpty) {
      return cheques
          .where((c) => c.status == ChequeStatus.cleared)
          .fold<num>(0, (sum, c) => sum + c.amount);
    }
    final yearAgo = DateTime.now().subtract(const Duration(days: 365));
    return payments
        .where((p) => p.category == 'rent' && p.receivedAt.isAfter(yearAgo))
        .fold<num>(0, (sum, p) => sum + p.amount);
  }

  /// Cheques on tenancies that are actually running.
  ///
  /// The money figures all scope to these. Paper attached to a cancelled or
  /// finished contract is not money anybody is still waiting for, and counting
  /// it inflated every total the app showed against the website's.
  Iterable<Cheque> get _liveCheques {
    final live = contracts
        .where((c) =>
            c.status == ContractStatus.active ||
            c.status == ContractStatus.expiring)
        .map((c) => c.id)
        .toSet();
    return cheques.where((c) => live.contains(c.contractId));
  }

  /// Rent owed and not yet in the bank.
  ///
  /// Matches the website's KPI exactly: pending or bounced, on a live tenancy.
  /// The app previously counted `deposited` as outstanding and ignored
  /// `bounced`, which is a different question with a different answer.
  num get outstanding => _liveCheques
      .where(
        (c) =>
            c.status == ChequeStatus.pending ||
            c.status == ChequeStatus.bounced,
      )
      .fold<num>(0, (sum, c) => sum + c.amount);

  /// Money that has already gone wrong: past its date, or bounced.
  /// Same definition and same scope as the website's.
  num get atRisk => _liveCheques
      .where((c) => c.isOverdue || c.status == ChequeStatus.bounced)
      .fold<num>(0, (sum, c) => sum + c.amount);

  int get expiring90 =>
      contracts.where((c) => c.status == ContractStatus.expiring).length;
  int get pendingApprovals =>
      approvals.where((a) => a.status == ApprovalStatus.pending).length;

  List<Cheque> get dueSoon {
    final list = cheques.where((c) => c.isOverdue || c.isDueSoon).toList()
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    return list;
  }

  List<Task> tasksFor(String userId) {
    final list =
        tasks
            .where((t) => t.assignedTo == userId && t.status != TaskStatus.done)
            .toList()
          ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    return list;
  }

  /// Twelve-month collection forecast from cheques already held.
  List<({String label, num due, int count})> forecast() {
    final now = DateTime.now();
    return List.generate(12, (i) {
      final m = DateTime(now.year, now.month + i);
      final inMonth = cheques.where(
        (c) =>
            c.dueDate.year == m.year &&
            c.dueDate.month == m.month &&
            c.status != ChequeStatus.cancelled,
      );
      return (
        label: _monthInitial(m.month),
        due: inMonth.fold<num>(0, (s, c) => s + c.amount),
        count: inMonth.length,
      );
    });
  }

  static String _monthInitial(int m) =>
      const ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m - 1];

  // ------------------------------------------------------------------ actions
  /// Records a deposit. Mirrors the server action on the web app: the cheque
  /// moves to `deposited`, the slip number is stored, the originating task is
  /// closed, and an audit entry is written.
  void recordDeposit(Cheque cheque, String slipNo) {
    cheque.status = ChequeStatus.deposited;
    cheque.depositSlipNo = slipNo;
    for (final t in tasks.where((t) => t.detail.contains(cheque.chequeNo))) {
      t.status = TaskStatus.done;
    }
    audit.insert(
      0,
      AuditEntry(
        id: 'A${audit.length + 1}',
        at: DateTime.now(),
        actorName: currentUser?.name ?? 'System',
        summary: 'Deposited cheque ${cheque.chequeNo} (slip $slipNo)',
        entityId: cheque.id,
      ),
    );
    notifyListeners();
  }

  void decideApproval(Approval a, bool approved) {
    a.status = approved ? ApprovalStatus.approved : ApprovalStatus.rejected;
    audit.insert(
      0,
      AuditEntry(
        id: 'A${audit.length + 1}',
        at: DateTime.now(),
        actorName: currentUser?.name ?? 'System',
        summary: '${approved ? 'Approved' : 'Rejected'} ${a.ref} — ${a.title}',
        entityId: a.id,
      ),
    );
    notifyListeners();
  }

  void toggleTask(Task t) {
    t.status = t.status == TaskStatus.done ? TaskStatus.open : TaskStatus.done;
    notifyListeners();
  }

  // --------------------------------------------------------------------- seed
  void _seed() {
    final rnd = Random(20260801); // fixed seed → identical demo data every run

    // Identical roster, ids and roles to the web app's `src/lib/seed.ts`, so a
    // single set of credentials works in both places and a person keeps the
    // same identity whichever one they open.
    users.addAll(const [
      User(
        id: 'U1',
        name: 'Ahmed Al Mansoori',
        email: 'ahmed@almanara.ae',
        role: Role.admin,
        title: 'Systems Administrator',
      ),
      User(
        id: 'U2',
        name: 'Fatima Al Zaabi',
        email: 'fatima@almanara.ae',
        role: Role.manager,
        title: 'General Manager',
      ),
      User(
        id: 'U3',
        name: 'Rashid Al Hosani',
        email: 'rashid@almanara.ae',
        role: Role.manager,
        title: 'Operations Manager',
      ),
      User(
        id: 'U4',
        name: 'Priya Nair',
        email: 'priya@almanara.ae',
        role: Role.accountant,
        title: 'Senior Accountant',
      ),
      User(
        id: 'U5',
        name: 'Omar Haddad',
        email: 'omar@almanara.ae',
        role: Role.accountant,
        title: 'Accounts Officer',
      ),
      User(
        id: 'U6',
        name: 'Sara Khalifa',
        email: 'sara@almanara.ae',
        role: Role.leasing,
        title: 'Leasing Executive',
      ),
      User(
        id: 'U7',
        name: 'Yousef Ibrahim',
        email: 'yousef@almanara.ae',
        role: Role.leasing,
        title: 'Leasing Executive',
      ),
      User(
        id: 'U8',
        name: 'Mohammed Riaz',
        email: 'riaz@almanara.ae',
        role: Role.maintenance,
        title: 'Maintenance Supervisor',
      ),
      User(
        id: 'U9',
        name: 'Layla Ahmed',
        email: 'layla@almanara.ae',
        role: Role.viewer,
        title: 'Internal Auditor',
      ),
    ]);

    const specs = [
      ('Al Manara Tower', 'AMT', 'Al Reem Island', 24, 96),
      ('Marina Heights Residence', 'MHR', 'Al Raha Beach', 21, 84),
      ('Golden Sands Building', 'GSB', 'Al Khalidiyah', 18, 72),
      ('Pearl Court', 'PRC', 'Mussafah', 15, 60),
      ('Corniche Plaza', 'CNP', 'Corniche Road', 20, 78),
      ('Yas Gardens Villas', 'YGV', 'Yas Island', 2, 60),
    ];
    const types = ['Studio', '1BR', '2BR', '3BR'];

    for (var pi = 0; pi < specs.length; pi++) {
      final (name, code, area, floors, unitCount) = specs[pi];
      properties.add(
        Property(
          id: 'P${pi + 1}',
          name: name,
          code: code,
          area: area,
          owner: 'Al Manara Holdings LLC',
          floors: floors,
        ),
      );
      final perFloor = (unitCount / floors).ceil();
      for (var i = 0; i < unitCount; i++) {
        final floor = min(floors, (i ~/ perFloor) + 1);
        final type = types[rnd.nextInt(types.length)];
        units.add(
          Unit(
            id: 'P${pi + 1}-U${i + 1}',
            propertyId: 'P${pi + 1}',
            unitNo: '$floor${((i % perFloor) + 1).toString().padLeft(2, '0')}',
            floor: floor,
            type: type,
            sizeSqft: 480 + rnd.nextInt(1600),
            marketRent: (38000 + rnd.nextInt(90000)) ~/ 1000 * 1000,
            status: UnitStatus.vacant,
          ),
        );
      }
    }

    // ~92% occupancy, matching the web seed's target.
    final shuffled = [...units]..shuffle(rnd);
    final leased = shuffled.take((units.length * 0.92).round()).toList();

    const firstNames = [
      'Omar',
      'Layla',
      'Rashid',
      'Noura',
      'Karim',
      'Hala',
      'Tariq',
      'Mariam',
      'Sami',
      'Dana',
      'Faisal',
      'Reem',
      'Jamal',
      'Salma',
      'Bilal',
      'Huda',
    ];
    const lastNames = [
      'Al Suwaidi',
      'Haddad',
      'Khan',
      'Al Marzooqi',
      'Farouk',
      'Nasser',
      'Al Blooshi',
      'Siddiqui',
      'Mansour',
      'Al Ameri',
    ];
    const banks = ['Emirates NBD', 'ADCB', 'FAB', 'Mashreq', 'ADIB', 'RAKBANK'];
    const nats = [
      'UAE',
      'India',
      'Egypt',
      'Jordan',
      'Philippines',
      'Pakistan',
      'UK',
    ];

    final today = DateTime.now();
    var chequeSeq = 100000;

    for (var i = 0; i < leased.length; i++) {
      final u = leased[i];
      final idx = units.indexOf(u);
      units[idx] = Unit(
        id: u.id,
        propertyId: u.propertyId,
        unitNo: u.unitNo,
        floor: u.floor,
        type: u.type,
        sizeSqft: u.sizeSqft,
        marketRent: u.marketRent,
        status: UnitStatus.occupied,
      );

      final tenantId = 'T${i + 1}';
      tenants.add(
        Tenant(
          id: tenantId,
          name:
              '${firstNames[rnd.nextInt(firstNames.length)]} ${lastNames[rnd.nextInt(lastNames.length)]}',
          kind: rnd.nextInt(10) == 0 ? 'company' : 'individual',
          emiratesId:
              '784-${1975 + rnd.nextInt(30)}-${1000000 + rnd.nextInt(8999999)}-${rnd.nextInt(10)}',
          nationality: nats[rnd.nextInt(nats.length)],
          phone: '+9715${rnd.nextInt(10)}${(1000000 + rnd.nextInt(8999999))}',
          email: 'tenant$i@example.ae',
        ),
      );

      // Stagger start dates through the year so expiries are spread out.
      final start = DateTime(
        today.year,
        today.month,
        1,
      ).subtract(Duration(days: rnd.nextInt(360)));
      final end = DateTime(start.year + 1, start.month, start.day);
      final daysToEnd = end.difference(today).inDays;
      final rent =
          (u.marketRent * (0.92 + rnd.nextDouble() * 0.16)) ~/ 1000 * 1000;
      final count = [1, 2, 4, 6, 12][rnd.nextInt(5)];

      final contractId = 'C${i + 1}';
      contracts.add(
        Contract(
          id: contractId,
          ref: 'AM-${start.year}-${(i + 1).toString().padLeft(4, '0')}',
          unitId: u.id,
          tenantId: tenantId,
          startDate: start,
          endDate: end,
          annualRent: rent,
          chequeCount: count,
          securityDeposit: (rent * 0.05) ~/ 100 * 100,
          ejariNo: '${10000000 + rnd.nextInt(89999999)}',
          status: daysToEnd <= 90
              ? ContractStatus.expiring
              : ContractStatus.active,
        ),
      );

      final per = rent ~/ count;
      for (var k = 0; k < count; k++) {
        final due = DateTime(
          start.year,
          start.month + (12 ~/ count) * k,
          start.day,
        );
        final diff = due.difference(today).inDays;
        ChequeStatus status;
        if (diff < -20) {
          status = rnd.nextInt(14) == 0
              ? ChequeStatus.bounced
              : ChequeStatus.cleared;
        } else if (diff < -2) {
          status = rnd.nextInt(6) == 0
              ? ChequeStatus.pending
              : ChequeStatus.deposited;
        } else {
          status = ChequeStatus.pending;
        }
        cheques.add(
          Cheque(
            id: '$contractId-CH${k + 1}',
            contractId: contractId,
            seq: k + 1,
            ofTotal: count,
            chequeNo: '${chequeSeq++}',
            bank: banks[rnd.nextInt(banks.length)],
            amount: per,
            dueDate: due,
            status: status,
            bounceReason: status == ChequeStatus.bounced
                ? 'Insufficient funds'
                : null,
          ),
        );
      }
    }

    // Tasks generated by the same rules the web app applies.
    var taskNo = 1;
    for (final c in cheques.where((c) => c.isOverdue || c.isDueSoon).take(14)) {
      final u = unitForCheque(c);
      tasks.add(
        Task(
          id: 'TK${taskNo++}',
          title: c.isOverdue
              ? 'Overdue cheque — bank immediately'
              : 'Bank cheque ${c.chequeNo}',
          detail: 'Unit ${u.unitNo} · cheque ${c.chequeNo} · ${c.bank}',
          // Banking is accounts work: U4 Priya and U5 Omar are the accountants.
          assignedTo: c.isOverdue ? 'U4' : (taskNo.isEven ? 'U4' : 'U5'),
          dueDate: c.dueDate,
          status: c.isOverdue ? TaskStatus.overdue : TaskStatus.open,
          priority: c.isOverdue ? 'high' : 'medium',
        ),
      );
    }
    for (final c
        in contracts
            .where((c) => c.status == ContractStatus.expiring)
            .take(6)) {
      tasks.add(
        Task(
          id: 'TK${taskNo++}',
          title: 'Start renewal for ${c.ref}',
          detail:
              'Unit ${unit(c.unitId).unitNo} expires ${c.endDate.day}/${c.endDate.month}',
          // Renewals are leasing work: U6 Sara.
          assignedTo: 'U6',
          dueDate: c.endDate.subtract(const Duration(days: 60)),
          status: TaskStatus.open,
          priority: 'medium',
        ),
      );
    }

    final pendingContracts = contracts.take(3).toList();
    for (var i = 0; i < pendingContracts.length; i++) {
      final c = pendingContracts[i];
      approvals.add(
        Approval(
          id: 'AP${i + 1}',
          ref: 'APR-${1000 + i}',
          type: i == 0
              ? 'new_contract'
              : (i == 1 ? 'maintenance_spend' : 'rent_change'),
          title: i == 0
              ? 'New tenancy — unit ${unit(c.unitId).unitNo}'
              : i == 1
              ? 'Maintenance spend — AC compressor'
              : 'Rent increase above cap — ${c.ref}',
          summary: i == 0
              ? 'Contract ${c.ref} is ready to activate and needs manager sign-off.'
              : i == 1
              ? 'Quotation attached from Gulf Cooling LLC for unit ${unit(c.unitId).unitNo}.'
              : 'Proposed increase of 7.2% exceeds the 5% cap; justification provided.',
          // Maintenance spend comes from U8 Riaz; the rest from leasing (U6).
          requestedBy: i == 1 ? 'U8' : 'U6',
          requestedAt: today.subtract(Duration(days: i + 1)),
          status: ApprovalStatus.pending,
          amount: i == 0
              ? c.annualRent
              : (i == 1 ? 3400 : c.annualRent * 1.072),
        ),
      );
    }

    for (var i = 0; i < 8; i++) {
      final c = cheques[rnd.nextInt(cheques.length)];
      audit.add(
        AuditEntry(
          id: 'AU${i + 1}',
          at: today.subtract(Duration(hours: i * 5 + 1)),
          actorName: users[rnd.nextInt(users.length)].name,
          summary: 'Recorded deposit for cheque ${c.chequeNo}',
          entityId: c.id,
        ),
      );
    }

    // maintenance work orders — a spread of statuses so the list is realistic.
    const cats = ['Plumbing', 'Electrical', 'HVAC', 'Carpentry', 'Appliance', 'General'];
    const vendors = ['CoolAir Tech LLC', 'FixIt Maintenance', 'Emirates Facilities', 'BluePlumb Services'];
    const prios = ['emergency', 'high', 'medium', 'low'];
    const mStatuses = [
      MaintenanceStatus.newRequest,
      MaintenanceStatus.assigned,
      MaintenanceStatus.inProgress,
      MaintenanceStatus.awaitingApproval,
      MaintenanceStatus.completed,
      MaintenanceStatus.closed,
    ];
    final supervisor = users.firstWhere((u) => u.role == Role.maintenance,
        orElse: () => users.first);
    for (var i = 0; i < 16; i++) {
      final u = units[rnd.nextInt(units.length)];
      final st = mStatuses[i % mStatuses.length];
      final prio = prios[rnd.nextInt(prios.length)];
      final quote = st == MaintenanceStatus.awaitingApproval
          ? (5000 + rnd.nextInt(20) * 1000).toDouble()
          : (150 + rnd.nextInt(40) * 25).toDouble();
      maintenance.add(
        MaintenanceRequest(
          id: 'M${i + 1}',
          ref: 'WO-${1200 + i + 1}',
          unitId: u.id,
          category: cats[rnd.nextInt(cats.length)],
          priority: prio,
          description: 'Reported issue in unit ${u.unitNo}. Access arranged with the tenant.',
          status: st,
          reportedAt: today.subtract(Duration(days: i, hours: i * 2)),
          vendor: vendors[rnd.nextInt(vendors.length)],
          quoteAmount: quote,
          slaDueAt: today.add(Duration(days: prio == 'emergency' ? 1 : prio == 'high' ? 2 : 5)),
          assignedToName: st == MaintenanceStatus.newRequest ? null : supervisor.name,
        ),
      );
    }

    // viewings — a few upcoming and past, on vacant units.
    final vacant = units.where((u) => u.status == UnitStatus.vacant).toList();
    const visitorNames = [
      'Khalid Rahman', 'Aisha Noor', 'Daniel Cruz', 'Fatima Sayed', 'Omar Yusuf'
    ];
    for (var i = 0; i < 5 && i < vacant.length; i++) {
      final u = vacant[i];
      final day = today.add(Duration(days: i - 1)); // one in the past, rest upcoming
      final startsAt = DateTime(day.year, day.month, day.day, 10 + i, 0);
      visits.add(
        Visit(
          id: 'VW${i + 1}',
          ref: 'VW-${3000 + i + 1}',
          unitId: u.id,
          visitorName: visitorNames[i % visitorNames.length],
          visitorPhone: '+9715${(20000000 + i * 111111)}',
          visitorEmail: '',
          startsAt: startsAt,
          durationMins: 30,
          status: i == 0 ? VisitStatus.completed : VisitStatus.scheduled,
          notes: '',
        ),
      );
    }
  }
}
