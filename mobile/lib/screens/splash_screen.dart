import 'package:flutter/material.dart';

import '../data/store.dart';
import '../theme/app_theme.dart';

/// Opening title card: the Aber Group wordmark on the fixed dark chrome,
/// fading up and back out before the app proper appears.
///
/// The dark ground is [AppColors.inverse] — the same surface the sidebar uses
/// on the web — so the first frame is already part of the design system rather
/// than a stock white flash.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.next});

  /// Route pushed once the animation finishes.
  final String next;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  // The wordmark fades up, holds while the rule sweeps under it, then fades
  // out — so the exit is deliberate rather than an abrupt cut to the app.
  late final Animation<double> _fade = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeOut)),
      weight: 32,
    ),
    TweenSequenceItem(tween: ConstantTween(1.0), weight: 46),
    TweenSequenceItem(
      tween: Tween(begin: 1.0, end: 0.0).chain(CurveTween(curve: Curves.easeIn)),
      weight: 22,
    ),
  ]).animate(_ctrl);

  /// A few pixels of rise under the fade. Small on purpose: a big translate
  /// reads as a slide, a small one reads as the letters settling.
  late final Animation<double> _rise = Tween(begin: 14.0, end: 0.0)
      .chain(CurveTween(curve: const Interval(0, 0.34, curve: Curves.easeOutCubic)))
      .animate(_ctrl);

  late final Animation<double> _letter = Tween(begin: 8.0, end: 3.0)
      .chain(CurveTween(curve: const Interval(0, 0.55, curve: Curves.easeOutCubic)))
      .animate(_ctrl);

  late final Animation<double> _rule = Tween(begin: 0.0, end: 1.0)
      .chain(CurveTween(curve: const Interval(0.22, 0.62, curve: Curves.easeOutCubic)))
      .animate(_ctrl);

  @override
  void initState() {
    super.initState();
    _go();
  }

  /// Waits for both the animation and the restored session before routing, so
  /// someone who is already signed in lands on the dashboard instead of being
  /// asked for their password again.
  Future<void> _go() async {
    await Future.wait([_ctrl.forward(), Store.instance.restored.future]);
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed(
      Store.instance.currentUser != null ? '/home' : widget.next,
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Always the dark chrome, in either theme — this is brand furniture, not
    // a themed surface.
    const colors = AppColors.light;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -0.25),
            radius: 1.1,
            colors: [AppColors.splashGlow, AppColors.splashGround],
          ),
        ),
        child: Center(
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) => Opacity(
              opacity: _fade.value,
              child: Transform.translate(
                offset: Offset(0, _rise.value),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'ABER',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 54,
                        fontWeight: FontWeight.w800,
                        letterSpacing: _letter.value,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: 14),
                    // Hairline that draws itself outward from the centre.
                    SizedBox(
                      width: 190,
                      height: 1,
                      child: Align(
                        alignment: Alignment.center,
                        child: FractionallySizedBox(
                          widthFactor: _rule.value,
                          child: Container(color: colors.brand400),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'GROUP',
                      style: TextStyle(
                        color: colors.brand300,
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 11,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: 30),
                    Text(
                      'Property Management',
                      style: TextStyle(
                        color: colors.inverseMuted,
                        fontSize: 12,
                        letterSpacing: 2.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
