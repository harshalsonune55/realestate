import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:almanara_pms/data/rbac.dart';
import 'package:almanara_pms/data/store.dart';
import 'package:almanara_pms/main.dart';
import 'package:almanara_pms/models/models.dart';

void main() {
  // The store writes the session log through shared_preferences on sign-in.
  // Without a mock the plugin call stays pending past the end of the test and
  // the runner reports it as a failure after the fact.
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  testWidgets('login screen asks for email and password', (tester) async {
    await tester.pumpWidget(const AlManaraApp());

    // The app opens on the splash title card; let its animation run out so the
    // sign-in screen is the one under test.
    expect(find.text('ABER'), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 4));

    expect(find.text('Sign in'), findsWidgets);
    expect(find.text('Work email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.textContaining('Request access'), findsWidgets);
    // the account-picker tiles are gone
    expect(find.text('Yousef Al Hammadi'), findsNothing);
  });

  test('seed data matches the web portfolio: 6 buildings, 450 units', () {
    final store = Store.instance;
    expect(store.properties.length, 6);
    expect(store.units.length, 450);
    // Nine staff accounts, matching the web app's seed one-for-one.
    expect(store.users.length, 9);
  });

  test('occupancy sits in the expected band', () {
    final store = Store.instance;
    expect(store.occupancy, greaterThan(0.85));
    expect(store.occupancy, lessThanOrEqualTo(1.0));
  });

  group('permissions mirror the web app', () {
    test('only a manager or admin can decide approvals', () {
      expect(can(Role.manager, Perm.approvalsDecide), isTrue);
      expect(can(Role.admin, Perm.approvalsDecide), isTrue);
      expect(can(Role.accountant, Perm.approvalsDecide), isFalse);
      expect(can(Role.leasing, Perm.approvalsDecide), isFalse);
    });

    test('accounts banks cheques but cannot create contracts', () {
      expect(can(Role.accountant, Perm.chequesDeposit), isTrue);
      expect(can(Role.accountant, Perm.contractsCreate), isFalse);
    });

    test('leasing creates contracts but cannot bank cheques', () {
      expect(can(Role.leasing, Perm.contractsCreate), isTrue);
      expect(can(Role.leasing, Perm.chequesDeposit), isFalse);
    });

    test('the auditor can read everything and change nothing', () {
      expect(can(Role.viewer, Perm.auditView), isTrue);
      expect(can(Role.viewer, Perm.chequesDeposit), isFalse);
      expect(can(Role.viewer, Perm.approvalsDecide), isFalse);
      expect(can(Role.viewer, Perm.contractsCreate), isFalse);
    });

    test('only an administrator manages staff accounts', () {
      expect(can(Role.admin, Perm.adminUsers), isTrue);
      expect(can(Role.manager, Perm.adminUsers), isFalse);
    });
  });

  test('recording a deposit updates the cheque and writes an audit entry', () {
    final store = Store.instance;
    store.signIn(store.users.firstWhere((u) => u.role == Role.accountant));
    final cheque = store.cheques.firstWhere((c) => c.status == ChequeStatus.pending);
    final auditBefore = store.audit.length;

    store.recordDeposit(cheque, 'DEP-TEST-1');

    expect(cheque.status, ChequeStatus.deposited);
    expect(cheque.depositSlipNo, 'DEP-TEST-1');
    expect(store.audit.length, auditBefore + 1);
    expect(store.audit.first.summary, contains(cheque.chequeNo));
  });
}
