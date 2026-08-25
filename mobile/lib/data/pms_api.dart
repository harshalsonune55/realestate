import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_config.dart';

class VisitBookingResult {
  const VisitBookingResult({
    required this.ok,
    this.error,
    this.ref,
    this.odooEventId,
    this.synced = false,
    this.message,
  });
  final bool ok;
  final String? error;
  final String? ref;
  final int? odooEventId;
  final bool synced;
  final String? message;
}

class AssistantReply {
  const AssistantReply({required this.text, this.model});
  final String text;
  final String? model;
}

class PmsApi {
  /// Asks the PMS backend's assistant.
  ///
  /// The briefing is built on the server from the real repository, so the app
  /// gets the same answers the web does — the phone's own store is seeded demo
  /// data and could never see the live database. Routing through here also
  /// keeps the model key on the server and applies the caller's role to what
  /// the briefing contains, rather than trusting the device on either count.
  ///
  /// Returns null when no backend is configured, so the caller can decide
  /// whether to fall back to the on-device path.
  static Future<AssistantReply?> ask({
    required String userId,
    required List<Map<String, String>> messages,
  }) async {
    if (!ApiConfig.configured) return null;

    final res = await http
        .post(
          Uri.parse('${ApiConfig.baseUrl}/api/assistant'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${ApiConfig.token}',
            // Names the employee this request acts for. The server resolves it
            // and uses that account's live role, so a stale local copy of the
            // role cannot widen what comes back.
            'X-PMS-User': userId,
          },
          body: jsonEncode({'messages': messages}),
        )
        .timeout(const Duration(seconds: 90));

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode != 200) {
      throw AssistantApiException(
        (json['error'] as String?) ?? 'The assistant could not answer that.',
        // A refusal is the server's answer, not a transport problem — falling
        // back to the on-device assistant would quietly undo the role check.
        refused: res.statusCode == 401 || res.statusCode == 403,
      );
    }
    return AssistantReply(
      text: ((json['reply'] as String?) ?? '').trim(),
      model: json['model'] as String?,
    );
  }

  /// Books a viewing through the PMS backend, which mirrors it to Odoo.
  static Future<VisitBookingResult> bookVisit({
    required String unitId,
    required String visitorName,
    required String visitorPhone,
    required String visitorEmail,
    required DateTime startsAt, // Gulf wall-clock
    required int durationMins,
    String notes = '',
    String? bookedBy,
  }) async {
    if (!ApiConfig.configured) {
      return const VisitBookingResult(
        ok: false,
        error: 'No PMS backend is configured, so this booking cannot reach Odoo.',
      );
    }

    final date =
        '${startsAt.year.toString().padLeft(4, '0')}-${startsAt.month.toString().padLeft(2, '0')}-${startsAt.day.toString().padLeft(2, '0')}';
    final time =
        '${startsAt.hour.toString().padLeft(2, '0')}:${startsAt.minute.toString().padLeft(2, '0')}';

    try {
      final res = await http
          .post(
            Uri.parse('${ApiConfig.baseUrl}/api/visits'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ${ApiConfig.token}',
            },
            body: jsonEncode({
              'unitId': unitId,
              'visitorName': visitorName,
              'visitorPhone': visitorPhone,
              'visitorEmail': visitorEmail,
              'date': date,
              'time': time,
              'durationMins': durationMins,
              'notes': notes,
              if (bookedBy != null) 'bookedBy': bookedBy,
            }),
          )
          .timeout(const Duration(seconds: 20));

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode >= 200 && res.statusCode < 300 && body['ok'] == true) {
        return VisitBookingResult(
          ok: true,
          ref: (body['visit']?['ref']) as String?,
          odooEventId: body['odooEventId'] as int?,
          synced: body['synced'] == true,
          message: body['message'] as String?,
        );
      }
      return VisitBookingResult(
        ok: false,
        error: (body['error'] as String?) ?? 'The server rejected the booking.',
      );
    } catch (e) {
      return VisitBookingResult(
        ok: false,
        error: 'Could not reach the PMS server: $e',
      );
    }
  }
}

class AssistantApiException implements Exception {
  const AssistantApiException(this.message, {this.refused = false});
  final String message;

  /// True when the server declined on purpose (not signed in, or the role is
  /// not allowed). Callers must surface these rather than retry locally.
  final bool refused;

  @override
  String toString() => message;
}
