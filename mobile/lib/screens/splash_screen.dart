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
    duration: const Duration(milliseconds: 3400),
  );

  // Wordmark holds fully visible, then fades on exit — the entrance is carried
  // by the per-letter reveal below instead of a blanket fade.
  late final Animation<double> _exit = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween(1.0), weight: 80),
    TweenSequenceItem(
      tween: Tween(begin: 1.0, end: 0.0).chain(CurveTween(curve: Curves.easeIn)),
      weight: 20,
    ),
  ]).animate(_ctrl);

  /// Reveals a word one letter at a time — each rises and fades in on a small
  /// stagger, giving the logo-text a considered, premium entrance.
  Widget _animatedWord(
    String word, {
    required double size,
    required FontWeight weight,
    required Color color,
    double spacing = 6,
    double startAt = 0.12,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < word.length; i++)
          AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) {
              final begin = startAt + i * 0.07;
              final t = ((_ctrl.value - begin) / 0.34).clamp(0.0, 1.0);
              final e = Curves.easeOutCubic.transform(t);
              return Opacity(
                opacity: e,
                child: Transform.translate(
                  offset: Offset(0, (1 - e) * 22),
                  child: Padding(
                    padding: EdgeInsets.only(right: spacing),
                    child: Text(
                      word[i],
                      style: TextStyle(
                        fontFamily: 'PlusJakartaSans',
                        color: color,
                        fontSize: size,
                        fontWeight: weight,
                        height: 1,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }

  // Slow zoom on the Burj Khalifa backdrop, so the still image reads as alive.
  late final Animation<double> _zoom = Tween(begin: 1.12, end: 1.0)
      .chain(CurveTween(curve: Curves.easeOut))
      .animate(_ctrl);

  // Backdrop fades in a touch faster than the wordmark.
  late final Animation<double> _bgFade = Tween(begin: 0.0, end: 1.0)
      .chain(CurveTween(curve: const Interval(0, 0.4, curve: Curves.easeOut)))
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
    await Future.wait([
      _ctrl.forward(),
      Store.instance.restored.future,
      // Capped: a missing or unreachable backend must not hold the splash open.
      // The seeded data is already on screen behind it, and a later sync still
      // swaps it in.
      Store.instance.firstSync.timeout(
        const Duration(seconds: 6),
        onTimeout: () {},
      ),
    ]);
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
    return Scaffold(
      backgroundColor: Colors.black,
      body: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) => Stack(
          fit: StackFit.expand,
          children: [
            // The Aber tower at sunset — the loading backdrop, slowly zooming.
            Opacity(
              opacity: _bgFade.value,
              child: Transform.scale(
                scale: _zoom.value,
                child: Image.asset(
                  'assets/brand/aber_tower.jpg',
                  fit: BoxFit.cover,
                  alignment: Alignment.center,
                ),
              ),
            ),
            // Scrim so the wordmark and loader stay legible over the lights.
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x33000000),
                    Color(0x00000000),
                    Color(0xB3000000),
                  ],
                  stops: [0.0, 0.5, 1.0],
                ),
              ),
            ),
            // Brand wordmark, lower third.
            Align(
              alignment: const Alignment(0, 0.55),
              child: Opacity(
                opacity: _exit.value,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _animatedWord('ABER',
                        size: 52,
                        weight: FontWeight.w700,
                        color: Colors.white,
                        spacing: 6,
                        startAt: 0.14),
                    const SizedBox(height: 12),
                    _animatedWord('GROUP',
                        size: 15,
                        weight: FontWeight.w400,
                        color: Colors.white.withValues(alpha: 0.72),
                        spacing: 12,
                        startAt: 0.40),
                  ],
                ),
              ),
            ),
            // Status line under the wordmark. The same three phrases the web
            // loading screen rotates, so the two apps sound like one product
            // while they are both busy.
            Align(
              alignment: const Alignment(0, 0.78),
              child: Opacity(
                opacity: _exit.value,
                child: _LoadingPhrase(progress: _ctrl.value),
              ),
            ),
            // A slim, glowing progress hairline — understated and premium.
            Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 60),
                child: Opacity(
                  opacity: _bgFade.value,
                  child: SizedBox(
                    width: 120,
                    height: 2,
                    child: Stack(
                      children: [
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(99),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: Curves.easeInOut.transform(_ctrl.value),
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(99),
                              gradient: const LinearGradient(
                                colors: [Color(0xFF8AB4F8), Color(0xFFE8F0FE)],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF8AB4F8).withValues(alpha: 0.6),
                                  blurRadius: 8,
                                  spreadRadius: 0.5,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            // Cinematic open: the whole scene rises out of black.
            IgnorePointer(
              child: FadeTransition(
                opacity: Tween(begin: 1.0, end: 0.0)
                    .chain(CurveTween(curve: const Interval(0, 0.28, curve: Curves.easeOut)))
                    .animate(_ctrl),
                child: const ColoredBox(
                  color: Colors.black,
                  child: SizedBox.expand(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The rotating "what is happening" line.
///
/// Driven off the splash's own controller rather than a second timer: one
/// clock means the phrase can never still be changing after the screen has
/// gone, and the sequence is identical on every launch.
class _LoadingPhrase extends StatelessWidget {
  const _LoadingPhrase({required this.progress});

  /// 0 → 1 across the whole splash.
  final double progress;

  static const _phrases = [
    'Preparing your workspace',
    'Gathering the portfolio',
    'Almost there',
  ];

  @override
  Widget build(BuildContext context) {
    // Each phrase owns an equal slice; inside its slice it rises in, holds,
    // and rises out, so exactly one is ever on screen.
    final slice = 1 / _phrases.length;
    final index = (progress / slice).floor().clamp(0, _phrases.length - 1);
    final local = ((progress - index * slice) / slice).clamp(0.0, 1.0);

    final fade = local < 0.18
        ? Curves.easeOut.transform(local / 0.18)
        : local > 0.86
            ? 1 - Curves.easeIn.transform((local - 0.86) / 0.14)
            : 1.0;

    return Opacity(
      opacity: fade,
      child: Transform.translate(
        offset: Offset(0, (1 - fade) * 10),
        child: Text(
          _phrases[index],
          style: TextStyle(
            fontFamily: 'PlusJakartaSans',
            color: Colors.white.withValues(alpha: 0.7),
            fontSize: 12.5,
            height: 1,
          ),
        ),
      ),
    );
  }
}
