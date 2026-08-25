/// PMS backend connection for the mobile app.
///
/// The phone must never call Odoo directly — it posts to this backend, which
/// saves to Postgres and mirrors to the Odoo calendar (mobile → backend →
/// Postgres → Odoo). Point [baseUrl] at a reachable PMS server:
///   • Android emulator → http://10.0.2.2:3000
///   • real device on the same Wi-Fi → `http://<machine-LAN-IP>:3000`
/// Leave [baseUrl] empty to keep the app fully offline (bookings stay local).
class ApiConfig {
  /// The deployed PMS on AWS, reachable from any network rather than only
  /// from the office Wi-Fi. It was a laptop's LAN address, which meant the app
  /// only worked while that machine was awake, running `npm start`, and had
  /// not been handed a different DHCP lease.
  ///
  /// `/pms` is a path, not a host: nginx on that box already gives :80 to
  /// Odoo, and every other port is closed at the security group, so the app is
  /// mounted under a prefix and built with a matching basePath.
  static const baseUrl = 'http://16.170.201.73/pms';

  /// Shared bearer token — must match PMS_API_TOKEN on the server. Demo only;
  /// a token in a shipped binary is extractable, so use a real auth flow before
  /// any public release.
  static const token = 'almanara-mobile-demo-token';

  static bool get configured => baseUrl.isNotEmpty && token.isNotEmpty;
}
