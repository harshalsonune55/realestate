import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'api_config.dart';

/// Pulls the portfolio from the PMS backend.
///
/// The app used to generate its own copy from a fixed seed. That was fine while
/// both sides ran the same generator untouched, but the moment anything changed
/// on the server — a cheque cleared, a contract approved — the two drifted and
/// the same figure read differently in each place. The server is the record;
/// this makes the phone read it rather than invent its own.
///
/// Returns null when no backend is configured or it cannot be reached, so the
/// caller keeps the generated data and the app still opens on a plane.
class PortfolioSync {
  const PortfolioSync._();

  static Future<PortfolioSnapshot?> fetch() async {
    if (!ApiConfig.configured) return null;
    try {
      final res = await http
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/portfolio'),
            headers: {'Authorization': 'Bearer ${ApiConfig.token}'},
          )
          .timeout(const Duration(seconds: 25));
      if (res.statusCode != 200) return null;
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      if (j['ok'] != true) return null;
      return PortfolioSnapshot._(j);
    } catch (_) {
      // Offline, wrong IP, server down — all the same answer to the caller.
      return null;
    }
  }
}

/// One server payload, parsed into the app's own model types.
///
/// Every list is parsed defensively: one malformed record drops itself rather
/// than taking the whole sync down and leaving the app with nothing.
class PortfolioSnapshot {
  PortfolioSnapshot._(Map<String, dynamic> j)
      : users = _list(j['users'], _user),
        properties = _list(j['properties'], _property),
        units = _list(j['units'], _unit),
        tenants = _list(j['tenants'], _tenant),
        contracts = _list(j['contracts'], _contract),
        cheques = _list(j['cheques'], _cheque),
        payments = _list(j['payments'], _payment),
        tasks = _list(j['tasks'], _task),
        approvals = _list(j['approvals'], _approval),
        maintenance = _list(j['maintenance'], _maintenance),
        visits = _list(j['visits'], _visit);

  final List<User> users;
  final List<Property> properties;
  final List<Unit> units;
  final List<Tenant> tenants;
  final List<Contract> contracts;
  final List<Cheque> cheques;
  final List<Payment> payments;
  final List<Task> tasks;
  final List<Approval> approvals;
  final List<MaintenanceRequest> maintenance;
  final List<Visit> visits;

  /// A payload with no units is not a portfolio — treat it as a failed sync
  /// rather than wiping the app's data with an empty one.
  bool get usable => units.isNotEmpty && properties.isNotEmpty;

  static List<T> _list<T>(dynamic raw, T? Function(Map<String, dynamic>) parse) {
    if (raw is! List) return <T>[];
    final out = <T>[];
    for (final row in raw) {
      if (row is! Map<String, dynamic>) continue;
      try {
        final v = parse(row);
        if (v != null) out.add(v);
      } catch (_) {
        // Skip the row, keep the rest.
      }
    }
    return out;
  }

  static String _s(dynamic v) => v == null ? '' : v.toString();
  static num _n(dynamic v) => v is num ? v : num.tryParse(_s(v)) ?? 0;
  static int _i(dynamic v) => _n(v).round();
  static DateTime _d(dynamic v) =>
      DateTime.tryParse(_s(v))?.toLocal() ?? DateTime.now();

  /// Server enum spellings that do not match the app's by name alone.
  ///
  /// Most line up once underscores are dropped — `in_progress` meets
  /// `inProgress`. These two do not, and relying on the fallback to land on
  /// the right value by luck is exactly the kind of thing that silently
  /// mislabels a record the day somebody reorders an enum.
  static const _aliases = <String, String>{
    'new': 'newrequest', // maintenance
    'noshow': 'noshow', // visits, already aligned; kept for the record
  };

  /// Maps a server enum string onto one of the app's, by name.
  static T _enum<T>(List<T> values, dynamic raw, T fallback) {
    var key = _s(raw).replaceAll('_', '').toLowerCase();
    key = _aliases[key] ?? key;
    for (final v in values) {
      final name = v.toString().split('.').last.toLowerCase();
      if (name == key) return v;
    }
    return fallback;
  }

  static User? _user(Map<String, dynamic> j) {
    if (j['active'] == false) return null; // suspended and pending accounts
    return User(
      id: _s(j['id']),
      name: _s(j['name']),
      email: _s(j['email']),
      role: _enum(Role.values, j['role'], Role.viewer),
      title: _s(j['title']),
    );
  }

  static Property _property(Map<String, dynamic> j) => Property(
        id: _s(j['id']),
        name: _s(j['name']),
        code: _s(j['code']),
        area: _s(j['area']),
        owner: _s(j['owner']),
        floors: _i(j['floors']),
      );

  static Unit _unit(Map<String, dynamic> j) => Unit(
        id: _s(j['id']),
        propertyId: _s(j['propertyId']),
        unitNo: _s(j['unitNo']),
        floor: _i(j['floor']),
        type: _s(j['type']),
        sizeSqft: _i(j['sizeSqft']),
        marketRent: _n(j['marketRent']),
        status: _enum(UnitStatus.values, j['status'], UnitStatus.vacant),
      );

  static Tenant _tenant(Map<String, dynamic> j) => Tenant(
        id: _s(j['id']),
        name: _s(j['name']),
        kind: _s(j['kind']),
        emiratesId: _s(j['emiratesId']),
        nationality: _s(j['nationality']),
        phone: _s(j['phone']),
        email: _s(j['email']),
      );

  static Contract _contract(Map<String, dynamic> j) => Contract(
        id: _s(j['id']),
        ref: _s(j['ref']),
        unitId: _s(j['unitId']),
        tenantId: _s(j['tenantId']),
        startDate: _d(j['startDate']),
        endDate: _d(j['endDate']),
        annualRent: _n(j['annualRent']),
        chequeCount: _i(j['chequeCount']),
        securityDeposit: _n(j['securityDeposit']),
        ejariNo: _s(j['ejariNo']),
        status: _enum(ContractStatus.values, j['status'], ContractStatus.active),
      );

  static Cheque _cheque(Map<String, dynamic> j) => Cheque(
        id: _s(j['id']),
        contractId: _s(j['contractId']),
        seq: _i(j['seq']),
        ofTotal: _i(j['ofTotal']),
        chequeNo: _s(j['chequeNo']),
        bank: _s(j['bank']),
        amount: _n(j['amount']),
        dueDate: _d(j['dueDate']),
        status: _enum(ChequeStatus.values, j['status'], ChequeStatus.pending),
        bounceReason: j['bounceReason'] as String?,
        depositSlipNo: j['depositSlipNo'] as String?,
      );

  static Payment _payment(Map<String, dynamic> j) => Payment(
        id: _s(j['id']),
        contractId: _s(j['contractId']),
        amount: _n(j['amount']),
        category: _s(j['category']),
        receivedAt: _d(j['receivedAt']),
      );

  static Task _task(Map<String, dynamic> j) => Task(
        id: _s(j['id']),
        title: _s(j['title']),
        detail: _s(j['detail']),
        assignedTo: _s(j['assignedTo']),
        dueDate: _d(j['dueDate']),
        status: _enum(TaskStatus.values, j['status'], TaskStatus.open),
        priority: _s(j['priority']),
      );

  static Approval _approval(Map<String, dynamic> j) => Approval(
        id: _s(j['id']),
        ref: _s(j['ref']),
        type: _s(j['type']),
        title: _s(j['title']),
        summary: _s(j['summary']),
        requestedBy: _s(j['requestedBy']),
        requestedAt: _d(j['requestedAt']),
        amount: j['amount'] == null ? null : _n(j['amount']),
        status: _enum(ApprovalStatus.values, j['status'], ApprovalStatus.pending),
      );

  static MaintenanceRequest _maintenance(Map<String, dynamic> j) =>
      MaintenanceRequest(
        id: _s(j['id']),
        ref: _s(j['ref']),
        unitId: _s(j['unitId']),
        category: _s(j['category']),
        priority: _s(j['priority']),
        description: _s(j['description']),
        status: _enum(
          MaintenanceStatus.values,
          j['status'],
          MaintenanceStatus.newRequest,
        ),
        reportedAt: _d(j['reportedAt']),
        vendor: _s(j['vendor']),
        quoteAmount: _n(j['quoteAmount']).toDouble(),
        slaDueAt: _d(j['slaDueAt']),
      );

  static Visit _visit(Map<String, dynamic> j) => Visit(
        id: _s(j['id']),
        ref: _s(j['ref']),
        unitId: _s(j['unitId']),
        visitorName: _s(j['visitorName']),
        visitorPhone: _s(j['visitorPhone']),
        visitorEmail: _s(j['visitorEmail']),
        startsAt: _d(j['startsAt']),
        durationMins: _i(j['durationMins']),
        notes: _s(j['notes']),
        status: _enum(VisitStatus.values, j['status'], VisitStatus.scheduled),
      );
}
