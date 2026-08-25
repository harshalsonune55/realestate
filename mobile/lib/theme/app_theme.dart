import 'package:flutter/material.dart';

/// Design tokens ported verbatim from the web app's `globals.css`.
///
/// The website defines runtime `--c-*` variables per theme and maps them onto
/// utility names. Flutter has no cascade, so the same idea is expressed as two
/// [AppColors] instances resolved through an [InheritedWidget]-backed theme
/// extension. Token names match the CSS one-for-one so the two stay in step.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.canvas,
    required this.surface,
    required this.surface2,
    required this.subtle,
    required this.subtleHover,
    required this.line,
    required this.lineSoft,
    required this.lineStrong,
    required this.fg,
    required this.fgSoft,
    required this.muted,
    required this.faint,
    required this.inverse,
    required this.inverse2,
    required this.inverseLine,
    required this.inverseMuted,
    required this.brand50,
    required this.brand100,
    required this.brand200,
    required this.brand300,
    required this.brand400,
    required this.brand500,
    required this.brand600,
    required this.brand700,
    required this.brandSolid,
    required this.brandSolidHover,
    required this.gold50,
    required this.gold200,
    required this.gold500,
    required this.gold600,
    required this.gold700,
    required this.red50,
    required this.red200,
    required this.red500,
    required this.red600,
    required this.red700,
    required this.red800,
    required this.amber50,
    required this.amber200,
    required this.amber400,
    required this.amber500,
    required this.amber700,
    required this.amber800,
    required this.sky50,
    required this.sky200,
    required this.sky500,
    required this.sky700,
    required this.sky800,
  });

  final Color canvas, surface, surface2, subtle, subtleHover;
  final Color line, lineSoft, lineStrong;
  final Color fg, fgSoft, muted, faint;
  final Color inverse, inverse2, inverseLine, inverseMuted;
  final Color brand50,
      brand100,
      brand200,
      brand300,
      brand400,
      brand500,
      brand600,
      brand700;
  final Color brandSolid, brandSolidHover;
  final Color gold50, gold200, gold500, gold600, gold700;
  final Color red50, red200, red500, red600, red700, red800;
  final Color amber50, amber200, amber400, amber500, amber700, amber800;
  final Color sky50, sky200, sky500, sky700, sky800;

  static const light = AppColors(
    canvas: Color(0xFFFFFFFF),
    surface: Color(0xFFFFFFFF),
    surface2: Color(0xFFF8F9FA),
    subtle: Color(0xFFF1F3F4),
    subtleHover: Color(0xFFE8EAED),
    line: Color(0xFFDADCE0),
    lineSoft: Color(0xFFE8EAED),
    lineStrong: Color(0xFFBDC1C6),
    fg: Color(0xFF202124),
    fgSoft: Color(0xFF3C4043),
    muted: Color(0xFF5F6368),
    faint: Color(0xFF80868B),
    inverse: Color(0xFF202124),
    inverse2: Color(0xFF303134),
    inverseLine: Color(0x1FFFFFFF),
    inverseMuted: Color(0xFF9AA0A6),
    // brand — Google blue. #1A73E8 (step 600) is the primary button/link.
    brand50: Color(0xFFE8F0FE),
    brand100: Color(0xFFD2E3FC),
    brand200: Color(0xFFAECBFA),
    brand300: Color(0xFF8AB4F8),
    brand400: Color(0xFF669DF6),
    brand500: Color(0xFF4285F4),
    brand600: Color(0xFF1A73E8),
    brand700: Color(0xFF1967D2),
    brandSolid: Color(0xFF1A73E8),
    brandSolidHover: Color(0xFF1765CC),
    gold50: Color(0xFFFCEDF2),
    gold200: Color(0xFFF0B5C7),
    gold500: Color(0xFFCC3A63),
    gold600: Color(0xFFB02E53),
    gold700: Color(0xFF8E2543),
    red50: Color(0xFFFEF2F2),
    red200: Color(0xFFFECACA),
    red500: Color(0xFFEF4444),
    red600: Color(0xFFDC2626),
    red700: Color(0xFFB91C1C),
    red800: Color(0xFF991B1B),
    amber50: Color(0xFFFFFBEB),
    amber200: Color(0xFFFDE68A),
    amber400: Color(0xFFFBBF24),
    amber500: Color(0xFFF59E0B),
    amber700: Color(0xFFB45309),
    amber800: Color(0xFF92400E),
    sky50: Color(0xFFF0F9FF),
    sky200: Color(0xFFBAE6FD),
    sky500: Color(0xFF0EA5E9),
    sky700: Color(0xFF0369A1),
    sky800: Color(0xFF075985),
  );

  static const dark = AppColors(
    // Dark mode keeps the warm cast rather than going blue-black, so the two
    // themes read as the same product with the lights turned down.
    canvas: Color(0xFF14110C),
    surface: Color(0xFF1C1811),
    surface2: Color(0xFF241F16),
    subtle: Color(0xFF2B2519),
    subtleHover: Color(0xFF362F21),
    line: Color(0xFF322B1E),
    lineSoft: Color(0xFF262015),
    lineStrong: Color(0xFF4C4330),
    fg: Color(0xFFF7F1E4),
    fgSoft: Color(0xFFDED5C2),
    muted: Color(0xFFA89D87),
    faint: Color(0xFF8B8168),
    inverse: Color(0xFF1B1F14),
    inverse2: Color(0xFF262B1C),
    inverseLine: Color(0x14FFFFFF),
    inverseMuted: Color(0xFFB0B79A),
    brand50: Color(0xFF0D1B2E),
    brand100: Color(0xFF12233B),
    brand200: Color(0xFF17304F),
    brand300: Color(0xFF1F4272),
    brand400: Color(0xFF4285F4),
    brand500: Color(0xFF669DF6),
    brand600: Color(0xFF8AB4F8),
    brand700: Color(0xFFAECBFA),
    // Stays dark so white text on filled buttons keeps 4.5:1 contrast.
    brandSolid: Color(0xFF1A73E8),
    brandSolidHover: Color(0xFF1765CC),
    gold50: Color(0xFF2A1218),
    gold200: Color(0xFF55232F),
    gold500: Color(0xFFE86B8C),
    gold600: Color(0xFFEF88A3),
    gold700: Color(0xFFF6B3C4),
    red50: Color(0xFF2A1215),
    red200: Color(0xFF55222A),
    red500: Color(0xFFEF4444),
    red600: Color(0xFFDC2626),
    red700: Color(0xFFFCA5A5),
    red800: Color(0xFFFECACA),
    amber50: Color(0xFF2A1E08),
    amber200: Color(0xFF543C11),
    amber400: Color(0xFFFBBF24),
    amber500: Color(0xFFF59E0B),
    amber700: Color(0xFFFCD34D),
    amber800: Color(0xFFFDE68A),
    sky50: Color(0xFF0A1E2C),
    sky200: Color(0xFF134058),
    sky500: Color(0xFF0EA5E9),
    sky700: Color(0xFF7DD3FC),
    sky800: Color(0xFFBAE6FD),
  );

  /// Splash gradient. Fixed in both themes — the opening title card is brand
  /// furniture, not a themed surface, so it must not follow the toggle.
  ///
  /// Near-black, matching the pure-black panel the logo artwork sits on in the
  /// sign-in header, so launch and sign-in read as one continuous surface. The
  /// glow is only a few points lighter — enough to lift the centre, not enough
  /// to look olive.
  static const splashGlow = Color(0xFF14150F);
  static const splashGround = Color(0xFF000000);

  @override
  AppColors copyWith() => this;

  /// Tokens are discrete brand values; cross-fading them mid-animation would
  /// produce colours that are in neither palette, so the theme snaps instead.
  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) =>
      t < 0.5 ? this : (other as AppColors? ?? this);
}

/// Convenience accessor so widgets read `context.c.surface` rather than
/// reaching through `Theme.of(context).extension<AppColors>()!` every time.
extension AppColorsX on BuildContext {
  AppColors get c => Theme.of(this).extension<AppColors>()!;
}

class AppTheme {
  static ThemeData _base(AppColors c, Brightness brightness) {
    final textColor = c.fgSoft;
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      fontFamily: 'PlusJakartaSans',
      scaffoldBackgroundColor: c.canvas,
      canvasColor: c.canvas,
      colorScheme:
          ColorScheme.fromSeed(
            seedColor: c.brandSolid,
            brightness: brightness,
          ).copyWith(
            surface: c.surface,
            primary: c.brandSolid,
            onPrimary: Colors.white,
            error: c.red600,
          ),
      dividerColor: c.line,
      extensions: [c],
      // Plus Jakarta Sans — a clean, geometric face that gives the app a
      // premium, considered feel. Bundled so it renders offline from the very
      // first frame (the splash uses it too).
      textTheme: TextTheme(
        displaySmall: TextStyle(
          color: c.fg,
          fontSize: 26,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.5,
        ),
        titleLarge: TextStyle(
          color: c.fg,
          fontSize: 20,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.3,
        ),
        titleMedium: TextStyle(
          color: c.fg,
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: TextStyle(color: textColor, fontSize: 14),
        bodyMedium: TextStyle(color: textColor, fontSize: 13),
        bodySmall: TextStyle(color: c.muted, fontSize: 12),
        labelSmall: TextStyle(
          color: c.muted,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.6,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.surface,
        foregroundColor: c.fg,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: c.fg,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  static ThemeData get light => _base(AppColors.light, Brightness.light);
  static ThemeData get dark => _base(AppColors.dark, Brightness.dark);
}
