import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:almanara_pms/data/store.dart';
import 'package:almanara_pms/models/models.dart';
import 'package:almanara_pms/screens/approvals_screen.dart';
import 'package:almanara_pms/screens/cheque_detail_screen.dart';
import 'package:almanara_pms/screens/cheques_screen.dart';
import 'package:almanara_pms/screens/contracts_screen.dart';
import 'package:almanara_pms/screens/dashboard_screen.dart';
import 'package:almanara_pms/screens/deposit_wizard.dart';
import 'package:almanara_pms/screens/login_screen.dart';
import 'package:almanara_pms/screens/more_screen.dart';
import 'package:almanara_pms/screens/signup_screen.dart';
import 'package:almanara_pms/screens/tasks_screen.dart';
import 'package:almanara_pms/screens/tenants_screen.dart';
import 'package:almanara_pms/theme/app_theme.dart';

/// Every screen is pumped at real handset sizes in both themes. Flutter turns a
/// RenderFlex overflow into a test failure, so this catches the classic mobile
/// regression — a row that fits the design width but not the narrowest phone.
void main() {
  // The store writes the session log through shared_preferences on sign-in.
  // Without a mock the plugin call stays pending past the end of the test and
  // the runner reports it as a failure after the fact.
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  // iPhone SE is the tightest mainstream target; Pixel 7 a common mid-size.
  const sizes = <String, Size>{
    'iPhone SE (375x667)': Size(375, 667),
    'iPhone 14 (390x844)': Size(390, 844),
    'Pixel 7 (412x915)': Size(412, 915),
  };

  Future<void> pump(WidgetTester tester, Widget screen, Size size, Brightness b) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: b == Brightness.dark ? AppTheme.dark : AppTheme.light,
      home: screen,
    ));
    await tester.pump(const Duration(milliseconds: 350));
  }

  setUp(() {
    final store = Store.instance;
    store.signIn(store.users.firstWhere((u) => u.role == Role.manager));
  });

  final screens = <String, Widget Function()>{
    'login': () => const LoginScreen(),
    'signup': () => const SignupScreen(),
    'dashboard': () => const DashboardScreen(),
    'cheques': () => const ChequesScreen(),
    'tasks': () => const TasksScreen(),
    'approvals': () => const ApprovalsScreen(),
    'contracts': () => const ContractsScreen(),
    'tenants': () => const TenantsScreen(),
    'more': () => const MoreScreen(),
  };

  for (final entry in sizes.entries) {
    group(entry.key, () {
      for (final brightness in [Brightness.light, Brightness.dark]) {
        final themeName = brightness == Brightness.light ? 'light' : 'dark';
        for (final screen in screens.entries) {
          testWidgets('${screen.key} lays out ($themeName)', (tester) async {
            await pump(tester, screen.value(), entry.value, brightness);
            expect(tester.takeException(), isNull);
          });
        }
      }
    });
  }

  testWidgets('cheque detail and the deposit wizard lay out', (tester) async {
    final store = Store.instance;
    store.signIn(store.users.firstWhere((u) => u.role == Role.accountant));
    final cheque = store.cheques.firstWhere((c) => c.status == ChequeStatus.pending);

    await pump(tester, ChequeDetailScreen(chequeId: cheque.id),
        const Size(375, 667), Brightness.light);
    expect(tester.takeException(), isNull);

    await pump(tester, DepositWizard(chequeId: cheque.id),
        const Size(375, 667), Brightness.light);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the wizard blocks step one until every check is ticked', (tester) async {
    final store = Store.instance;
    store.signIn(store.users.firstWhere((u) => u.role == Role.accountant));
    final cheque = store.cheques.firstWhere((c) => c.status == ChequeStatus.pending);

    await pump(tester, DepositWizard(chequeId: cheque.id),
        const Size(390, 844), Brightness.light);

    // Three unticked confirmations are required before continuing.
    expect(find.textContaining('3 items still required'), findsOneWidget);

    await tester.tap(find.text('Continue'));
    await tester.pump();

    // Attempting to continue escalates the panel rather than advancing.
    expect(find.textContaining('cannot continue'), findsOneWidget);
    expect(find.text('Verify the physical cheque'), findsOneWidget);
  });
}
