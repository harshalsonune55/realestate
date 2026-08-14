import 'package:flutter/material.dart';
import 'data/notifications.dart';
import 'data/store.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'screens/more_screen.dart';
import 'screens/splash_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Restored before the first frame so the app opens in the saved theme rather
  // than flashing light and correcting itself a moment later.
  await ThemeController.instance.load();
  runApp(const AlManaraApp());
}

class AlManaraApp extends StatefulWidget {
  const AlManaraApp({super.key});

  @override
  State<AlManaraApp> createState() => _AlManaraAppState();
}

class _AlManaraAppState extends State<AlManaraApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Notifications.instance.init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Alerts are computed on-device, so the only moments they can be raised are
  /// sign-in and app resume. Re-checking here means a cheque that fell overdue
  /// while the app sat in the background is reported the moment it comes back.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        Store.instance.currentUser != null) {
      Notifications.instance.sync(Store.instance);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ThemeController.instance,
      builder: (context, _) {
        return MaterialApp(
          title: 'Aber Group PMS',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: ThemeController.instance.mode,
          initialRoute: '/',
          routes: {
            '/': (_) => const SplashScreen(next: '/login'),
            '/login': (_) => const LoginScreen(),
            '/home': (_) => const HomeShell(),
          },
        );
      },
    );
  }
}
