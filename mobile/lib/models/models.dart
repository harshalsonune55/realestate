// Domain model mirrored from the web app's `src/lib/types.ts`. Field names and
// enum values match exactly so the same seed data drives both applications.

enum Role { admin, manager, accountant, leasing, maintenance, viewer }

const roleLabel = <Role, String>{
  Role.admin: 'Administrator',
  Role.manager: 'Manager',
  Role.accountant: 'Accounts',
  Role.leasing: 'Leasing',
  Role.maintenance: 'Maintenance',
  Role.viewer: 'Auditor (read only)',
};

/// Signups land as [pending] and cannot sign in until an administrator
/// approves them; mirrors the web app's `UserStatus`.
enum UserStatus { pending, active, suspended }

class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.title,
    this.active = true,
    this.status = UserStatus.active,
    this.phone = '',
    this.requestedRole,
    // Absent on seeded demo accounts, which share the demo password.
    this.passwordHash,
    this.salt,
  });
  final String id, name, email, title, phone;
  final Role role;
  final bool active;
  final UserStatus status;
  final Role? requestedRole;
  final String? passwordHash, salt;

  String get initials {
    final parts = name.split(' ').where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0]).join();
  }

  /// Fields are final; account decisions replace the list entry instead of
  /// mutating it (the same pattern the seed uses for units).
  User copyWith({Role? role, bool? active, UserStatus? status}) => User(
    id: id,
    name: name,
    email: email,
    role: role ?? this.role,
    title: title,
    active: active ?? this.active,
    status: status ?? this.status,
    phone: phone,
    requestedRole: requestedRole,
    passwordHash: passwordHash,
    salt: salt,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role.name,
    'title': title,
    'active': active,
    'status': status.name,
    'phone': phone,
    'requestedRole': requestedRole?.name,
    'passwordHash': passwordHash,
    'salt': salt,
  };

  static User fromJson(Map<String, Object?> j) => User(
    id: j['id'] as String,
    name: j['name'] as String,
    email: j['email'] as String,
    role: Role.values.byName(j['role'] as String),
    title: j['title'] as String,
    active: j['active'] as bool,
    status: UserStatus.values.byName(j['status'] as String),
    phone: (j['phone'] as String?) ?? '',
    requestedRole: j['requestedRole'] == null
        ? null
        : Role.values.byName(j['requestedRole'] as String),
    passwordHash: j['passwordHash'] as String?,
    salt: j['salt'] as String?,
  );
}

class Property {
  const Property({
    required this.id,
    required this.name,
    required this.code,
    required this.area,
    required this.owner,
    required this.floors,
  });
  final String id, name, code, area, owner;
  final int floors;
}

enum UnitStatus { vacant, occupied, reserved, maintenance }

class Unit {
  const Unit({
    required this.id,
    required this.propertyId,
    required this.unitNo,
    required this.floor,
    required this.type,
    required this.sizeSqft,
    required this.marketRent,
    required this.status,
  });
  final String id, propertyId, unitNo, type;
  final int floor, sizeSqft;
  final num marketRent;
  final UnitStatus status;
}

class Tenant {
  const Tenant({
    required this.id,
    required this.name,
    required this.kind,
    required this.emiratesId,
    required this.nationality,
    required this.phone,
    required this.email,
  });
  final String id, name, kind, emiratesId, nationality, phone, email;
}

enum ContractStatus {
  draft,
  pendingApproval,
  active,
  expiring,
  renewed,
  terminated,
  rejected,
}

const contractStatusLabel = <ContractStatus, String>{
  ContractStatus.draft: 'Draft',
  ContractStatus.pendingApproval: 'Awaiting approval',
  ContractStatus.active: 'Active',
  ContractStatus.expiring: 'Expiring',
  ContractStatus.renewed: 'Renewed',
  ContractStatus.terminated: 'Terminated',
  ContractStatus.rejected: 'Rejected',
};

class Contract {
  const Contract({
    required this.id,
    required this.ref,
    required this.unitId,
    required this.tenantId,
    required this.startDate,
    required this.endDate,
    required this.annualRent,
    required this.chequeCount,
    required this.securityDeposit,
    required this.ejariNo,
    required this.status,
  });
  final String id, ref, unitId, tenantId, ejariNo;
  final DateTime startDate, endDate;
  final num annualRent, securityDeposit;
  final int chequeCount;
  final ContractStatus status;
}

enum ChequeStatus { pending, deposited, cleared, bounced, replaced, cancelled }

const chequeStatusLabel = <ChequeStatus, String>{
  ChequeStatus.pending: 'Pending',
  ChequeStatus.deposited: 'Deposited',
  ChequeStatus.cleared: 'Cleared',
  ChequeStatus.bounced: 'Bounced',
  ChequeStatus.replaced: 'Replaced',
  ChequeStatus.cancelled: 'Cancelled',
};

class Cheque {
  Cheque({
    required this.id,
    required this.contractId,
    required this.seq,
    required this.ofTotal,
    required this.chequeNo,
    required this.bank,
    required this.amount,
    required this.dueDate,
    required this.status,
    this.depositSlipNo,
    this.bounceReason,
  });
  final String id, contractId, chequeNo, bank;
  final int seq, ofTotal;
  final num amount;
  final DateTime dueDate;
  ChequeStatus status;
  String? depositSlipNo, bounceReason;

  /// Days until due; negative once overdue. Mirrors `daysFromToday` on the web.
  int get daysToDue {
    final now = DateTime.now();
    return DateTime(
      dueDate.year,
      dueDate.month,
      dueDate.day,
    ).difference(DateTime(now.year, now.month, now.day)).inDays;
  }

  bool get isOverdue => status == ChequeStatus.pending && daysToDue < 0;
  bool get isDueSoon =>
      status == ChequeStatus.pending && daysToDue >= 0 && daysToDue <= 14;
}

enum TaskStatus { open, inProgress, done, overdue }

class Task {
  Task({
    required this.id,
    required this.title,
    required this.detail,
    required this.assignedTo,
    required this.dueDate,
    required this.status,
    required this.priority,
  });
  final String id, title, detail, assignedTo, priority;
  final DateTime dueDate;
  TaskStatus status;
}

enum ApprovalStatus { pending, approved, rejected }

class Approval {
  Approval({
    required this.id,
    required this.ref,
    required this.type,
    required this.title,
    required this.summary,
    required this.requestedBy,
    required this.requestedAt,
    required this.status,
    this.amount,
  });
  final String id, ref, type, title, summary, requestedBy;
  final DateTime requestedAt;
  final num? amount;
  ApprovalStatus status;
}

class AuditEntry {
  const AuditEntry({
    required this.id,
    required this.at,
    required this.actorName,
    required this.summary,
    required this.entityId,
  });
  final String id, actorName, summary, entityId;
  final DateTime at;
}

/// Whether a [SessionEvent] records someone arriving or leaving.
enum SessionKind { signIn, signOut }

const sessionKindLabel = <SessionKind, String>{
  SessionKind.signIn: 'Signed in',
  SessionKind.signOut: 'Signed out',
};

/// One sign-in or sign-out by an employee.
///
/// Kept separate from [AuditEntry] because the audit log records what people
/// *did* to records, while this records access to the app itself — different
/// retention question, different audience, and it is the log an administrator
/// checks when asking "who was in the system on Tuesday".
class SessionEvent {
  const SessionEvent({
    required this.id,
    required this.userId,
    required this.userName,
    required this.role,
    required this.kind,
    required this.at,
  });

  final String id, userId, userName;
  final Role role;
  final SessionKind kind;
  final DateTime at;

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'userName': userName,
    'role': role.name,
    'kind': kind.name,
    'at': at.toIso8601String(),
  };

  static SessionEvent fromJson(Map<String, dynamic> j) => SessionEvent(
    id: j['id'] as String,
    userId: j['userId'] as String,
    userName: j['userName'] as String,
    role: Role.values.firstWhere(
      (r) => r.name == j['role'],
      orElse: () => Role.viewer,
    ),
    kind: SessionKind.values.firstWhere(
      (k) => k.name == j['kind'],
      orElse: () => SessionKind.signIn,
    ),
    at: DateTime.parse(j['at'] as String),
  );
}
