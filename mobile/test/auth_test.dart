import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:almanara_pms/data/signup_rules.dart';
import 'package:almanara_pms/data/store.dart';
import 'package:almanara_pms/models/models.dart';

void main() {
  // Store persistence writes through shared_preferences; give it an in-memory
  // backend so tests neither touch disk nor need a platform channel.
  SharedPreferences.setMockInitialValues({});

  group('signup rules', () {
    Map<String, String> problems({
      String name = 'Sara Khalifa',
      String email = 'sara@abergroup.ae',
      String phone = '+971 50 123 4567',
      String title = 'Leasing Executive',
      Role? role = Role.leasing,
      String password = 'Marina2026Bay',
      String? confirm,
      bool terms = true,
      List<String> taken = const [],
    }) =>
        signUpProblems(
          name: name,
          email: email,
          phone: phone,
          title: title,
          role: role,
          password: password,
          confirm: confirm ?? password,
          terms: terms,
          takenEmails: taken,
        );

    test('accepts a complete request', () => expect(problems(), isEmpty));

    test('requires first and last name',
        () => expect(problems(name: 'Sara'), contains('name')));

    test('rejects a malformed email',
        () => expect(problems(email: 'sara@abergroup'), contains('email')));

    test('rejects a weak password', () {
      expect(problems(password: 'marina2026', confirm: 'marina2026'),
          contains('password'));
    });

    test('rejects a password built from the email address', () {
      expect(problems(password: 'SaraSara2026', confirm: 'SaraSara2026'),
          contains('password'));
    });

    test('catches a mistyped confirmation',
        () => expect(problems(confirm: 'Marina2026Bat'), contains('confirm')));

    test('will not let anyone enrol themselves as administrator',
        () => expect(problems(role: Role.admin), contains('role')));

    test('blocks an already-registered address case-insensitively', () {
      expect(problems(taken: ['SARA@abergroup.ae']), contains('email'));
    });

    test('treats the phone as optional',
        () => expect(problems(phone: ''), isEmpty));
  });

  group('store auth', () {
    final store = Store.instance;

    test('demo accounts sign in with the shared demo password', () {
      // Roster and roles mirror the web app's seed, so ahmed is the admin and
      // fatima is a manager — the same as signing in on the website.
      expect(store.signInWithEmail('ahmed@almanara.ae', Store.demoPassword),
          isNull);
      expect(store.currentUser?.role, Role.admin);
      store.signOut();

      expect(store.signInWithEmail('fatima@almanara.ae', Store.demoPassword),
          isNull);
      expect(store.currentUser?.role, Role.manager);
      store.signOut();
    });

    test('a wrong password is rejected without leaking which part failed', () {
      expect(store.signInWithEmail('fatima@almanara.ae', 'nope'),
          'Email or password is not correct.');
      expect(store.signInWithEmail('ghost@almanara.ae', 'nope'),
          'Email or password is not correct.');
    });

    test('signup lands pending, cannot sign in, then works once approved', () {
      final u = store.signUp(
        name: 'Noura Al Falasi',
        email: 'noura@abergroup.ae',
        phone: '+971 50 111 2233',
        title: 'Leasing Executive',
        requestedRole: Role.leasing,
        password: 'Marina2026Bay',
      );

      // no id collision with the seeded U1–U6
      expect(store.users.where((x) => x.id == u.id).length, 1);
      expect(u.status, UserStatus.pending);

      expect(store.signInWithEmail('noura@abergroup.ae', 'Marina2026Bay'),
          contains('waiting for administrator approval'));

      // a review task was raised for the administrator
      expect(
          store.tasks.any((t) =>
              t.title.contains('Noura Al Falasi') &&
              t.assignedTo ==
                  store.users.firstWhere((x) => x.role == Role.admin).id),
          isTrue);

      store.approveSignup(u, Role.leasing);
      expect(store.signInWithEmail('noura@abergroup.ae', 'Marina2026Bay'),
          isNull);
      expect(store.currentUser?.role, Role.leasing);
      store.signOut();
    });

    test('a declined account is told it is disabled', () {
      final u = store.signUp(
        name: 'Tariq Mansour',
        email: 'tariq@abergroup.ae',
        phone: '',
        title: 'Broker',
        requestedRole: Role.viewer,
        password: 'Corniche2026X',
      );
      store.declineSignup(u);
      expect(store.signInWithEmail('tariq@abergroup.ae', 'Corniche2026X'),
          contains('disabled'));
    });
  });
}
