import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../data/notifications.dart';
import '../data/store.dart';
import '../theme/app_theme.dart';
import '../widgets/auth_fields.dart';
import 'signup_screen.dart';

/// Email + password sign-in under the Aber Group mark, mirroring the web
/// app's `/login`. The dark brand panel becomes a compact header on a phone.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _reveal = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final err = Store.instance.signInWithEmail(_email.text, _password.text);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    if (mounted) Navigator.of(context).pushReplacementNamed('/home');

    // Asked for after sign-in rather than at launch: the prompt makes sense
    // once someone is looking at their own overdue cheques, and Android only
    // ever shows it once. Raising any alerts follows the grant.
    await Notifications.instance.requestPermission();
    await Notifications.instance.sync(Store.instance);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;

    // The header is pure black, so the clock and battery icons must be white
    // while this screen is up regardless of the app theme.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.canvas,
        body: ListView(
          padding: EdgeInsets.zero,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                24,
                MediaQuery.of(context).padding.top + 72,
                24,
                30,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Sign in',
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    'Your role decides exactly what you can see and do once you are in.',
                    style: TextStyle(
                      color: c.muted,
                      fontSize: 13.5,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 22),

                  if (_error != null) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(13),
                      decoration: BoxDecoration(
                        color: c.red50,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: c.red200),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: c.red700,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],

                  AuthLabel('Work email'),
                  AuthInput(
                    controller: _email,
                    hint: 'you@abergroup.ae',
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.username],
                  ),
                  const SizedBox(height: 16),

                  AuthLabel('Password'),
                  AuthInput(
                    controller: _password,
                    hint: '••••••••••',
                    obscure: !_reveal,
                    autofillHints: const [AutofillHints.password],
                    onSubmitted: (_) => _submit(),
                    suffix: IconButton(
                      onPressed: () => setState(() => _reveal = !_reveal),
                      icon: Icon(
                        _reveal
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 19,
                        color: c.faint,
                      ),
                      tooltip: _reveal ? 'Hide password' : 'Show password',
                    ),
                  ),
                  const SizedBox(height: 22),

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
                      child: const Text('Sign in'),
                    ),
                  ),
                  const SizedBox(height: 22),

                  Center(
                    child: TextButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const SignupScreen()),
                      ),
                      child: Text.rich(
                        TextSpan(
                          text: 'No account yet?  ',
                          style: TextStyle(color: c.muted, fontSize: 13.5),
                          children: [
                            TextSpan(
                              text: 'Request access',
                              style: TextStyle(
                                color: c.fg,
                                fontWeight: FontWeight.w600,
                                decoration: TextDecoration.underline,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
