// Pure signup validation, mirrored from the web app's
// `src/lib/actions/account-rules.ts` so phone and desktop enforce identical
// rules. No imports from the store — testable in isolation.

import '../models/models.dart';

/// Roles a person may request for themselves. Administrator is excluded on
/// purpose: it hands out permissions, so it can only ever be granted by
/// someone who already holds it.
const signupRoles = [
  Role.leasing,
  Role.accountant,
  Role.maintenance,
  Role.manager,
  Role.viewer,
];

/// One line of plain English per requestable role.
const roleSummary = <Role, String>{
  Role.leasing: 'Prepares contracts, handles tenants and processes renewals.',
  Role.accountant:
      'Deposits cheques, records payments and reconciles the rent roll.',
  Role.maintenance: 'Raises and progresses work orders on units.',
  Role.manager: 'Approves contracts, renewals and spend across the portfolio.',
  Role.viewer: 'Reads everything, changes nothing.',
};

// Deliberately loose: the only thing worth rejecting is an address that
// cannot possibly be delivered to.
final _emailRe = RegExp(r'^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$');
final _phoneRe = RegExp(r'^\+?[\d\s()-]{7,20}$');

/// Blocking problems with a proposed password, empty when acceptable.
/// Mirrors `passwordProblems` in the web app's `src/lib/password.ts`.
List<String> passwordProblems(String password) => [
  if (password.length < 10) 'Use at least 10 characters.',
  if (!password.contains(RegExp(r'[a-z]'))) 'Include a lower-case letter.',
  if (!password.contains(RegExp(r'[A-Z]'))) 'Include an upper-case letter.',
  if (!password.contains(RegExp(r'[0-9]'))) 'Include a number.',
];

/// Blocking problems with a signup, keyed by field name. Empty when
/// acceptable. `takenEmails` is passed in so this stays a pure function.
Map<String, String> signUpProblems({
  required String name,
  required String email,
  required String phone,
  required String title,
  required Role? role,
  required String password,
  required String confirm,
  required bool terms,
  List<String> takenEmails = const [],
}) {
  final e = <String, String>{};
  final addr = email.trim().toLowerCase();

  if (name.trim().length < 3) {
    e['name'] = 'Enter your full name.';
  } else if (!name.trim().contains(' ')) {
    e['name'] = 'Enter your first and last name.';
  }

  if (addr.isEmpty) {
    e['email'] = 'Enter your work email address.';
  } else if (!_emailRe.hasMatch(addr)) {
    e['email'] = 'That does not look like an email address.';
  }

  if (phone.trim().isNotEmpty && !_phoneRe.hasMatch(phone.trim())) {
    e['phone'] = 'Enter a reachable phone number.';
  }
  if (title.trim().length < 2) e['title'] = 'Enter your job title.';
  if (role == null || !signupRoles.contains(role)) {
    e['role'] = 'Choose the role you need.';
  }

  final problems = passwordProblems(password);
  final local = addr.split('@').first;
  if (problems.isNotEmpty) {
    e['password'] = problems.join(' ');
  } else if (local.length > 2 && password.toLowerCase().contains(local)) {
    e['password'] = 'Do not put your email address in your password.';
  }

  if (confirm.isEmpty) {
    e['confirm'] = 'Type the password a second time.';
  } else if (confirm != password) {
    e['confirm'] = 'The two passwords do not match.';
  }

  if (!terms) {
    e['terms'] = 'Confirm you are an employee of Aber Group before continuing.';
  }

  // Checked last so a duplicate address is not reported alongside form typos.
  if (!e.containsKey('email') &&
      takenEmails.any((t) => t.toLowerCase() == addr)) {
    e['email'] = 'An account already exists for this address. Sign in instead.';
  }

  return e;
}
