import 'package:flutter/material.dart';
import '../data/signup_rules.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/auth_fields.dart';

/// Access-request form mirroring the web app's `/signup`: the account is
/// created disabled and an administrator decides the role it actually gets.
class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _title = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  Role? _role;
  bool _terms = false;
  bool _reveal = false;
  Map<String, String> _errors = {};

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _title, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final store = Store.instance;
    final errors = signUpProblems(
      name: _name.text,
      email: _email.text,
      phone: _phone.text,
      title: _title.text,
      role: _role,
      password: _password.text,
      confirm: _confirm.text,
      terms: _terms,
      takenEmails: [for (final u in store.users) u.email],
    );
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;

    final user = store.signUp(
      name: _name.text,
      email: _email.text,
      phone: _phone.text,
      title: _title.text,
      requestedRole: _role!,
      password: _password.text,
    );
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => _SubmittedScreen(email: user.email)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final rules = passwordProblems(_password.text);

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        title: const Text('Request access'),
        backgroundColor: c.surface,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 34),
        children: [
          Text(
            'Create your account',
            style: TextStyle(
              color: c.fg,
              fontSize: 24,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            'Tell us who you are and what you do. An administrator reviews '
            'every request before the account is switched on.',
            style: TextStyle(color: c.muted, fontSize: 13.5, height: 1.45),
          ),
          const SizedBox(height: 22),

          AuthLabel('Full name'),
          AuthInput(controller: _name, hint: 'Sara Khalifa'),
          _FieldError(_errors['name']),
          const SizedBox(height: 16),

          AuthLabel('Work email'),
          AuthInput(
            controller: _email,
            hint: 'sara@abergroup.ae',
            keyboardType: TextInputType.emailAddress,
          ),
          _FieldError(_errors['email']),
          const SizedBox(height: 16),

          AuthLabel('Job title'),
          AuthInput(controller: _title, hint: 'Leasing Executive'),
          _FieldError(_errors['title']),
          const SizedBox(height: 16),

          AuthLabel('Phone (optional)'),
          AuthInput(
            controller: _phone,
            hint: '+971 50 000 0000',
            keyboardType: TextInputType.phone,
          ),
          _FieldError(_errors['phone']),
          const SizedBox(height: 20),

          AuthLabel('Access you need'),
          ...signupRoles.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RoleTile(
                role: r,
                selected: _role == r,
                onTap: () => setState(() => _role = r),
              ),
            ),
          ),
          _FieldError(_errors['role']),
          const SizedBox(height: 14),

          AuthLabel('Password'),
          AuthInput(
            controller: _password,
            hint: 'At least 10 characters',
            obscure: !_reveal,
            onSubmitted: (_) {},
            suffix: IconButton(
              onPressed: () => setState(() => _reveal = !_reveal),
              icon: Icon(
                _reveal
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 19,
                color: c.faint,
              ),
            ),
          ),
          if (_password.text.isNotEmpty && rules.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                rules.join(' '),
                style: TextStyle(color: c.amber800, fontSize: 12, height: 1.4),
              ),
            ),
          _FieldError(_errors['password']),
          const SizedBox(height: 16),

          AuthLabel('Confirm password'),
          AuthInput(
            controller: _confirm,
            hint: 'Type it again',
            obscure: !_reveal,
          ),
          _FieldError(_errors['confirm']),
          const SizedBox(height: 18),

          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _terms = !_terms),
            child: Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: c.subtle,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: Checkbox(
                      value: _terms,
                      onChanged: (v) => setState(() => _terms = v ?? false),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'I am an employee or authorised contractor of Aber Group, '
                      'and I understand every action I take in this system is '
                      'recorded against my name.',
                      style: TextStyle(
                        color: c.fgSoft,
                        fontSize: 12.5,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          _FieldError(_errors['terms']),
          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            height: 54,
            child: FilledButton(
              onPressed: _submit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0B1220),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(27),
                ),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              child: const Text('Request access'),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleTile extends StatelessWidget {
  const _RoleTile({
    required this.role,
    required this.selected,
    required this.onTap,
  });
  final Role role;
  final bool selected;
  final VoidCallback onTap;

  static const _icon = <Role, IconData>{
    Role.leasing: Icons.description_outlined,
    Role.accountant: Icons.account_balance_wallet_outlined,
    Role.maintenance: Icons.build_outlined,
    Role.manager: Icons.verified_user_outlined,
    Role.viewer: Icons.visibility_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: selected ? c.subtle : c.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? c.fg : c.line,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(_icon[role], size: 19, color: selected ? c.fg : c.muted),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      roleLabel[role]!,
                      style: TextStyle(
                        color: c.fg,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      roleSummary[role]!,
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                Icon(Icons.check_circle, size: 19, color: c.brand600),
            ],
          ),
        ),
      ),
    );
  }
}

class _FieldError extends StatelessWidget {
  const _FieldError(this.message);
  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        message!,
        style: TextStyle(
          color: context.c.red700,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
          height: 1.4,
        ),
      ),
    );
  }
}

/// Confirmation screen after the request is filed.
class _SubmittedScreen extends StatelessWidget {
  const _SubmittedScreen({required this.email});
  final String email;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final admin = Store.instance.users
        .where((u) => u.role == Role.admin && u.active)
        .firstOrNull;

    return Scaffold(
      backgroundColor: c.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 40, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: c.brand50,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check, size: 28, color: c.brand600),
              ),
              const SizedBox(height: 22),
              Text(
                'Request received',
                style: TextStyle(
                  color: c.fg,
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Your account is created but switched off until an '
                'administrator approves it. Nothing in the system is visible '
                'to you until then.',
                style: TextStyle(color: c.muted, fontSize: 14, height: 1.5),
              ),
              const SizedBox(height: 22),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: c.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'SIGN-IN NAME',
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      email,
                      style: TextStyle(
                        color: c.fg,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'REVIEWED BY',
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      admin?.name ?? 'The system administrator',
                      style: TextStyle(
                        color: c.fg,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: () =>
                      Navigator.of(context).popUntil((r) => r.isFirst),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF0B1220),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(27),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  child: const Text('Back to sign in'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
