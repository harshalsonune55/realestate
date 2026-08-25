import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'ai.dart';

/// Saved assistant chats, on the device.
///
/// Mirrors the web app's model so the two behave the same way: a list of named
/// conversations, newest first, that you can reopen, rename and delete. What it
/// deliberately does not do is sync — a transcript is a convenience for one
/// person on one device, and putting every answer the assistant ever gave about
/// tenants and staff on the server carries a retention question the audit log
/// already answers properly.
///
/// Keyed by user id because a shared phone signs several people in, and the
/// previous single-thread store handed the next person the last one's chat.
class Conversation {
  Conversation({
    required this.id,
    required this.title,
    required this.messages,
    required this.updatedAt,
  });

  final String id;
  String title;
  List<ChatMessage> messages;
  DateTime updatedAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'updatedAt': updatedAt.toIso8601String(),
        'messages': messages.map((m) => m.toJson()).toList(),
      };

  static Conversation? fromJson(Map<String, dynamic> j) {
    try {
      return Conversation(
        id: j['id'] as String,
        title: j['title'] as String,
        updatedAt: DateTime.parse(j['updatedAt'] as String),
        messages: (j['messages'] as List<dynamic>)
            .map((m) => ChatMessage.fromJson(m as Map<String, dynamic>))
            .toList(),
      );
    } catch (_) {
      // Written by an older build, or hand-edited. Dropping one malformed
      // conversation is better than losing the whole list to a parse error.
      return null;
    }
  }
}

class Conversations {
  Conversations._();

  /// Kept small on purpose — preferences are not a database.
  static const _maxChats = 30;

  static String _key(String userId) => 'pms.assistant.chats.$userId';

  /// The first thing the person asked, trimmed to fit a list row.
  static String titleFrom(String text) {
    final line = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (line.isEmpty) return 'New chat';
    return line.length > 42 ? '${line.substring(0, 42).trimRight()}…' : line;
  }

  static String newId() =>
      'c${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}';

  static Future<List<Conversation>> load(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_key(userId));
      if (raw == null) return [];
      final out = raw
          .map((s) => Conversation.fromJson(
              jsonDecode(s) as Map<String, dynamic>))
          .whereType<Conversation>()
          .toList()
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      return out;
    } catch (_) {
      return [];
    }
  }

  static Future<void> save(String userId, List<Conversation> chats) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sorted = [...chats]
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      await prefs.setStringList(
        _key(userId),
        sorted
            .take(_maxChats)
            .map((c) => jsonEncode(c.toJson()))
            .toList(),
      );
    } catch (_) {
      // Best effort: the chat on screen still works, it just will not survive
      // a restart.
    }
  }

  /// "Just now", "3h ago", "12 Aug" — the list row's timestamp.
  static String when(DateTime at) {
    final mins = DateTime.now().difference(at).inMinutes;
    if (mins < 1) return 'Just now';
    if (mins < 60) return '${mins}m ago';
    final hrs = mins ~/ 60;
    if (hrs < 24) return '${hrs}h ago';
    final days = hrs ~/ 24;
    if (days < 7) return '${days}d ago';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${at.day} ${months[at.month - 1]}';
  }
}
