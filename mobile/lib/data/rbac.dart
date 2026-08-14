import '../models/models.dart';

/// Permission set mirrored from the web app's `src/lib/rbac.ts`.
/// Kept identical so a role sees the same things on phone and desktop.
enum Perm {
  dashboardView,
  propertiesView,
  tenantsView,
  contractsView,
  contractsCreate,
  chequesView,
  chequesDeposit,
  chequesBounce,
  paymentsView,
  renewalsView,
  renewalsProcess,
  maintenanceView,
  maintenanceManage,
  approvalsView,
  approvalsDecide,
  tasksView,
  reportsView,
  auditView,
  adminUsers,
}

const _all = Perm.values;

final Map<Role, Set<Perm>> rolePerms = {
  Role.admin: _all.toSet(),
  Role.manager: _all.where((p) => p != Perm.adminUsers).toSet(),
  Role.accountant: {
    Perm.dashboardView,
    Perm.propertiesView,
    Perm.tenantsView,
    Perm.contractsView,
    Perm.chequesView,
    Perm.chequesDeposit,
    Perm.chequesBounce,
    Perm.paymentsView,
    Perm.renewalsView,
    Perm.approvalsView,
    Perm.tasksView,
    Perm.reportsView,
    Perm.auditView,
  },
  Role.leasing: {
    Perm.dashboardView,
    Perm.propertiesView,
    Perm.tenantsView,
    Perm.contractsView,
    Perm.contractsCreate,
    Perm.chequesView,
    Perm.paymentsView,
    Perm.renewalsView,
    Perm.renewalsProcess,
    Perm.maintenanceView,
    Perm.approvalsView,
    Perm.tasksView,
  },
  Role.maintenance: {
    Perm.dashboardView,
    Perm.propertiesView,
    Perm.tenantsView,
    Perm.maintenanceView,
    Perm.maintenanceManage,
    Perm.tasksView,
  },
  Role.viewer: {
    Perm.dashboardView,
    Perm.propertiesView,
    Perm.tenantsView,
    Perm.contractsView,
    Perm.chequesView,
    Perm.paymentsView,
    Perm.renewalsView,
    Perm.maintenanceView,
    Perm.approvalsView,
    Perm.reportsView,
    Perm.auditView,
    Perm.tasksView,
  },
};

bool can(Role role, Perm perm) => rolePerms[role]!.contains(perm);

/// Actions that always need a second pair of eyes. Mirrors REQUIRES_APPROVAL.
const requiresApproval = <String, String>{
  'new_contract':
      'New tenancy contracts must be approved by a manager before activation.',
  'renewal':
      'Renewals must be approved by a manager before the new term starts.',
  'rent_change': 'Any change to agreed rent requires manager approval.',
  'contract_termination': 'Early termination requires manager approval.',
  'cheque_hold':
      'Holding a cheque past its due date requires manager approval.',
  'cheque_replacement':
      'Replacing a bounced or cancelled cheque requires manager approval.',
  'maintenance_spend':
      'Maintenance spend above AED 1,000 requires manager approval.',
  'refund': 'Deposit refunds require manager approval.',
};
