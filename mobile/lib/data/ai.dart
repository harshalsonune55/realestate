import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api_config.dart';
import 'pms_api.dart';
import 'ai_key.dart';
import 'rbac.dart';
import 'store.dart';

@immutable
class ChatMessage {
  const ChatMessage({required this.role, required this.text});
  final String role; // 'user' | 'assistant'
  final String text;

  Map<String, dynamic> toJson() => {'role': role, 'text': text};

  static ChatMessage fromJson(Map<String, dynamic> j) =>
      ChatMessage(role: j['role'] as String, text: j['text'] as String);
}

/// Client for Groq's chat completions, which speak the OpenAI shape.
///
/// Note the spelling: Groq (groq.com, keys begin `gsk_`) is an inference host
/// running open models such as Llama. It is a different company from xAI's
/// Grok (keys begin `xai-`). Swapping providers is a matter of changing
/// [endpoint] and [defaultModel] — the request and response shape is identical.
///
/// SECURITY NOTE: the key lives on the handset, which means anyone holding the
/// APK can extract it and spend the account's credits. This is acceptable for
/// an internal demo build and is *not* how it should ship — the request
/// belongs behind the Next.js backend so the key never leaves the server. See
/// the note in the chat screen's header.
class Ai {
  Ai._();
  static final Ai instance = Ai._();

  static const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  /// The key every build ships with, from the git-ignored [kAiApiKey].
  ///
  /// A `--dart-define=AI_API_KEY=…` at build time still wins, which is how a
  /// CI build supplies its own without touching the file.
  static const _defined = String.fromEnvironment('AI_API_KEY');

  static const _modelPref = 'ai_model_v1';

  /// Groq retired `llama-3.3-70b-versatile`, and every request against it now
  /// comes back 404 — which reads in the app as "the assistant is broken"
  /// rather than as a model that no longer exists.
  static const defaultModel = 'openai/gpt-oss-120b';

  /// Ids that used to be the default and no longer resolve. A phone that has
  /// already stored one in preferences would otherwise keep using it forever,
  /// because the stored value wins over the default.
  static const _retired = {'llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'};

  String? _model;

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_modelPref);
      // Drop a stored id that has since been retired, so the upgrade heals
      // itself instead of needing the app's data cleared.
      _model = (stored != null && _retired.contains(stored)) ? null : stored;
      if (_model == null && stored != null) {
        await prefs.remove(_modelPref);
      }
    } catch (_) {
      // No prefs plugin (widget tests) — the default model still applies.
    }
  }

  String get key => _defined.isNotEmpty ? _defined : kAiApiKey;

  bool get configured => key.isNotEmpty;

  String get model => (_model?.isNotEmpty ?? false) ? _model! : defaultModel;

  Future<void> setModel(String value) async {
    _model = value.trim();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_modelPref, _model!);
    } catch (_) {
      // In-memory only; the choice simply does not survive a restart.
    }
  }

  /* ------------------------------------------------------ chat persistence

     Kept per user id: a shared handset must not show one employee's
     conversation to the next person who signs in. Cleared on sign-out for the
     same reason. */

  static String _historyKey(String userId) => 'ai_history_v1_$userId';

  /// Caps what is written back, so a long-running thread cannot grow the prefs
  /// blob without bound.
  static const maxStoredTurns = 60;

  Future<List<ChatMessage>> loadHistory(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_historyKey(userId));
      if (raw == null) return [];
      return raw
          .map((s) => ChatMessage.fromJson(jsonDecode(s) as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveHistory(String userId, List<ChatMessage> history) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final trimmed = history.length > maxStoredTurns
          ? history.sublist(history.length - maxStoredTurns)
          : history;
      await prefs.setStringList(
        _historyKey(userId),
        trimmed.map((m) => jsonEncode(m.toJson())).toList(),
      );
    } catch (_) {
      // Best-effort; the thread simply does not survive a restart.
    }
  }

  Future<void> clearHistory(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_historyKey(userId));
    } catch (_) {
      // Nothing stored to clear.
    }
  }

  /// Builds the briefing the model answers from.
  ///
  /// Scoped to what the signed-in role may see, for the same reason the search
  /// on the web app is: an assistant that will happily recite tenant contact
  /// details to a viewer is a permission hole with a chat box in front of it.
  String systemPrompt(Store store) {
    final user = store.currentUser!;
    final b = StringBuffer()
      ..writeln(
        'You are the assistant inside Aber Group\'s property management app '
        '(Al Manara PMS). Answer questions about this company\'s portfolio, '
        'staff and processes using only the briefing below. If something is '
        'not in the briefing, say you do not have that information rather '
        'than guessing. Amounts are in AED. Keep answers short and concrete.',
      )
      ..writeln()
      ..writeln('## Who you are talking to')
      ..writeln('Name: ${user.name}')
      ..writeln('Title: ${user.title}')
      ..writeln('Role: ${roleLabel[user.role]}')
      ..writeln('Email: ${user.email}')
      ..writeln(
        'This person may only be told what their role permits. '
        'Do not reveal anything excluded from the briefing.',
      )
      ..writeln()
      ..writeln('## Portfolio')
      ..writeln('Properties: ${store.properties.length}')
      ..writeln(
        'Units: ${store.units.length} '
        '(${store.occupiedCount} occupied, '
        '${(store.occupancy * 100).toStringAsFixed(1)}% occupancy)',
      );

    for (final p in store.properties) {
      final units = store.units.where((u) => u.propertyId == p.id).toList();
      final occ = units.where((u) => u.status == UnitStatus.occupied).length;
      b.writeln(
        '- ${p.name} (${p.code}), ${p.area}: '
        '$occ/${units.length} units occupied',
      );
    }

    if (can(user.role, Perm.contractsView)) {
      b
        ..writeln()
        ..writeln('## Contracts')
        ..writeln('Total: ${store.contracts.length}')
        ..writeln(
          'Annualised rent roll: AED '
          '${store.annualisedRent.toStringAsFixed(0)}',
        )
        ..writeln(
          'Expiring: '
          '${store.contracts.where((x) => x.status == ContractStatus.expiring).length}',
        );
    }

    if (can(user.role, Perm.chequesView)) {
      final overdue = store.cheques.where((x) => x.isOverdue).length;
      final bounced = store.cheques
          .where((x) => x.status == ChequeStatus.bounced)
          .length;
      b
        ..writeln()
        ..writeln('## Cheques')
        ..writeln('Total held: ${store.cheques.length}')
        ..writeln('Overdue: $overdue')
        ..writeln('Bounced: $bounced')
        ..writeln('Collected: AED ${store.collected.toStringAsFixed(0)}')
        ..writeln('At risk: AED ${store.atRisk.toStringAsFixed(0)}');
    }

    if (can(user.role, Perm.tenantsView)) {
      b
        ..writeln()
        ..writeln('## Tenants')
        ..writeln('Count: ${store.tenants.length}');
      // Names only. Phone numbers, Emirates IDs and passport numbers are
      // deliberately withheld — the chat box is not an export route for PII.
      for (final t in store.tenants.take(40)) {
        b.writeln('- ${t.name}');
      }
    }

    b
      ..writeln()
      ..writeln('## Employees')
      ..writeln(
        'These are the staff accounts. Never disclose passwords or hashes.',
      );
    for (final u in store.users.where((u) => u.status == UserStatus.active)) {
      b.writeln('- ${u.name} — ${u.title} (${roleLabel[u.role]})');
    }

    if (can(user.role, Perm.adminUsers)) {
      // Cross-employee workload — the view an HR or line-management question
      // needs. Gated on adminUsers because a per-person productivity
      // breakdown is management information, not open to every colleague.
      b
        ..writeln()
        ..writeln('## Employee workload')
        ..writeln('Task counts per employee across the whole team.');
      for (final u in store.users.where((u) => u.status == UserStatus.active)) {
        final mine = store.tasks.where((t) => t.assignedTo == u.id);
        final done = mine.where((t) => t.status == TaskStatus.done).length;
        final overdue =
            mine.where((t) => t.status == TaskStatus.overdue).length;
        final open = mine.where((t) => t.status != TaskStatus.done).length;
        final acted = store.audit.where((a) => a.actorName == u.name).length;
        b.writeln(
          '- ${u.name} (${roleLabel[u.role]}): $open open, $overdue overdue, '
          '$done completed, $acted recorded actions',
        );
      }

      final completed = store.tasks
          .where((t) => t.status == TaskStatus.done)
          .take(20);
      if (completed.isNotEmpty) {
        b
          ..writeln()
          ..writeln('## Recently completed work');
        for (final t in completed) {
          final who = store.users.where((u) => u.id == t.assignedTo).firstOrNull;
          b.writeln('- ${who?.name ?? 'Unassigned'}: ${t.title}');
        }
      }

      final recent = store.sessions.take(10);
      if (recent.isNotEmpty) {
        b
          ..writeln()
          ..writeln('## Recent employee access');
        for (final s in recent) {
          b.writeln(
            '- ${s.userName} ${sessionKindLabel[s.kind]!.toLowerCase()} '
            'at ${s.at.toIso8601String()}',
          );
        }
      }
    }

    final mine = store.tasksFor(user.id);
    if (mine.isNotEmpty) {
      b
        ..writeln()
        ..writeln('## This person\'s open tasks');
      for (final t in mine.take(10)) {
        b.writeln('- ${t.title} (${t.status.name}) — ${t.detail}');
      }
    }

    return b.toString();
  }

  /// Sends the conversation and returns the reply text.
  ///
  /// Throws [AiException] with a readable message on any non-200, so the chat
  /// screen can show something better than a raw status code.
  Future<String> send({
    required Store store,
    required List<ChatMessage> history,
  }) async {
    /* The PMS backend answers first when there is one. Its briefing is built
       from the real repository — the whole database, gated by the caller's
       role — whereas the fallback below can only describe the demo store this
       device generated for itself. Same assistant as the web, same answers. */
    final user = store.currentUser;
    if (ApiConfig.configured && user != null) {
      try {
        final reply = await PmsApi.ask(
          userId: user.id,
          messages: [
            for (final m in history) {'role': m.role, 'content': m.text},
          ],
        );
        if (reply != null && reply.text.isNotEmpty) return reply.text;
      } on AssistantApiException catch (e) {
        // A deliberate refusal is the answer. Only a transport failure earns
        // the on-device fallback; retrying a 403 locally would hand the user
        // an assistant their role is not allowed.
        if (e.refused) throw AiException(e.message);
      } catch (_) {
        // Unreachable backend — fall through and answer from the device.
      }
    }

    if (!configured) {
      throw const AiException(
        'This build shipped without an API key. Fill in '
        'lib/data/ai_key.dart and rebuild.',
      );
    }

    final body = jsonEncode({
      'model': model,
      'temperature': 0.2,
      'messages': [
        {'role': 'system', 'content': systemPrompt(store)},
        for (final m in history) {'role': m.role, 'content': m.text},
      ],
    });

    late final http.Response res;
    try {
      res = await http
          .post(
            Uri.parse(endpoint),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $key',
            },
            body: body,
          )
          .timeout(const Duration(seconds: 60));
    } catch (e) {
      throw AiException('Could not reach the assistant: $e');
    }

    if (res.statusCode == 401 || res.statusCode == 403) {
      throw const AiException(
        'The API key was rejected — it may have been revoked or rotated.',
      );
    }
    if (res.statusCode == 404) {
      throw AiException(
        'Model "$model" was not found. Pick another in Assistant settings.',
      );
    }
    if (res.statusCode != 200) {
      throw AiException('Assistant error ${res.statusCode}: ${res.body}');
    }

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    final choices = json['choices'] as List<dynamic>?;
    if (choices == null || choices.isEmpty) {
      throw const AiException('The assistant returned an empty reply.');
    }
    final message = choices.first as Map<String, dynamic>;
    final content =
        ((message['message'] as Map<String, dynamic>?)?['content'] as String?)
            ?.trim() ??
        '';
    // Reasoning models put their working-out in a separate field and can come
    // back with empty content. Returning '' here painted a blank bubble that
    // looked like the app had silently failed; say so instead.
    if (content.isEmpty) {
      throw const AiException('The assistant returned an empty reply.');
    }
    return content;
  }
}

class AiException implements Exception {
  const AiException(this.message);
  final String message;
  @override
  String toString() => message;
}
