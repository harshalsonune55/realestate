import 'package:flutter/material.dart';

import '../data/ai.dart';
import '../data/conversations.dart';
import '../data/store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import '../widgets/markdown_text.dart';

/// Chat with Grok about the company, briefed from the store and scoped to the
/// signed-in employee's role.
class AiChatScreen extends StatefulWidget {
  const AiChatScreen({super.key});

  @override
  State<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends State<AiChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _history = <ChatMessage>[];
  bool _sending = false;
  String? _error;

  /// Saved chats, newest first, and which one is open.
  List<Conversation> _chats = [];
  String? _activeId;

  static const _starters = [
    'What needs my attention today?',
    'How is occupancy across the portfolio?',
    'Which cheques are overdue?',
    'Who works here and what do they do?',
  ];

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    await Ai.instance.load();
    final user = Store.instance.currentUser;
    if (user == null) return;

    final chats = await Conversations.load(user.id);

    // A build before this one kept a single unnamed thread. Carry it in as the
    // first conversation rather than dropping it on upgrade.
    final legacy = await Ai.instance.loadHistory(user.id);
    if (chats.isEmpty && legacy.isNotEmpty) {
      chats.add(Conversation(
        id: Conversations.newId(),
        title: Conversations.titleFrom(legacy.first.text),
        messages: legacy,
        updatedAt: DateTime.now(),
      ));
      await Conversations.save(user.id, chats);
      await Ai.instance.clearHistory(user.id);
    }

    if (!mounted) return;
    setState(() {
      _chats = chats;
      _activeId = chats.isEmpty ? null : chats.first.id;
      _history
        ..clear()
        ..addAll(chats.isEmpty ? const <ChatMessage>[] : chats.first.messages);
    });
    if (_history.isNotEmpty) _toBottom();
  }

  /// Writes the open thread back into its conversation, creating one on the
  /// first message so a chat is never lost for want of a name.
  void _persist() {
    final user = Store.instance.currentUser;
    if (user == null || _history.isEmpty) return;

    final id = _activeId ?? Conversations.newId();
    final existing = _chats.indexWhere((c) => c.id == id);
    final title = existing >= 0
        ? _chats[existing].title
        : Conversations.titleFrom(_history.first.text);

    final chat = Conversation(
      id: id,
      title: title,
      messages: List.of(_history),
      updatedAt: DateTime.now(),
    );

    _activeId = id;
    if (existing >= 0) {
      _chats[existing] = chat;
    } else {
      _chats.insert(0, chat);
    }
    _chats.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    Conversations.save(user.id, _chats);
  }

  void _openChat(Conversation chat) {
    setState(() {
      _activeId = chat.id;
      _history
        ..clear()
        ..addAll(chat.messages);
      _error = null;
    });
    _toBottom();
  }

  void _newChat() {
    setState(() {
      _activeId = null;
      _history.clear();
      _error = null;
    });
  }

  Future<void> _deleteChat(Conversation chat) async {
    final user = Store.instance.currentUser;
    setState(() {
      _chats.removeWhere((c) => c.id == chat.id);
      if (chat.id == _activeId) {
        // Land on the next most recent rather than on nothing.
        _activeId = _chats.isEmpty ? null : _chats.first.id;
        _history
          ..clear()
          ..addAll(_chats.isEmpty ? const <ChatMessage>[] : _chats.first.messages);
      }
    });
    if (user != null) await Conversations.save(user.id, _chats);
  }

  Future<void> _renameChat(Conversation chat) async {
    final controller = TextEditingController(text: chat.title);
    final c = context.c;
    final name = await showDialog<String>(
      context: context,
      builder: (dialog) => AlertDialog(
        backgroundColor: c.surface,
        title: Text('Rename chat', style: TextStyle(color: c.fg, fontSize: 17)),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: TextStyle(color: c.fg),
          decoration: const InputDecoration(hintText: 'Chat name'),
          onSubmitted: (v) => Navigator.of(dialog).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    final clean = name?.trim() ?? '';
    // An empty box means "leave it alone", not "call this chat nothing".
    if (clean.isEmpty) return;

    final user = Store.instance.currentUser;
    setState(() {
      final i = _chats.indexWhere((x) => x.id == chat.id);
      if (i >= 0) _chats[i].title = clean.length > 60 ? clean.substring(0, 60) : clean;
    });
    if (user != null) await Conversations.save(user.id, _chats);
  }

  /// The saved-chat list, as a sheet — a phone has no room for a rail.
  Future<void> _showHistory() async {
    final c = context.c;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: c.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheet) => StatefulBuilder(
        builder: (sheet2, setSheet) => SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.7,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 10),
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: c.line,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    children: [
                      Text('Saved chats',
                          style: TextStyle(
                              color: c.fg,
                              fontSize: 17,
                              fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () {
                          Navigator.of(sheet).pop();
                          _newChat();
                        },
                        icon: const Icon(Icons.add, size: 17),
                        label: const Text('New'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                if (_chats.isEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 26),
                    child: Text(
                      'Chats you have are saved here. They stay on this phone.',
                      style: TextStyle(color: c.faint, fontSize: 13),
                    ),
                  )
                else
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: _chats.length,
                      itemBuilder: (_, i) {
                        final chat = _chats[i];
                        return ListTile(
                          selected: chat.id == _activeId,
                          selectedTileColor: c.subtle,
                          title: Text(
                            chat.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: c.fg,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: Text(
                            '${chat.messages.length} messages · '
                            '${Conversations.when(chat.updatedAt)}',
                            style: TextStyle(color: c.faint, fontSize: 11.5),
                          ),
                          onTap: () {
                            Navigator.of(sheet).pop();
                            _openChat(chat);
                          },
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Rename',
                                icon: Icon(Icons.edit_outlined,
                                    size: 18, color: c.muted),
                                onPressed: () async {
                                  Navigator.of(sheet).pop();
                                  await _renameChat(chat);
                                },
                              ),
                              IconButton(
                                tooltip: 'Delete',
                                icon: Icon(Icons.delete_outline,
                                    size: 18, color: c.muted),
                                onPressed: () async {
                                  await _deleteChat(chat);
                                  setSheet(() {});
                                },
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _history.add(ChatMessage(role: 'user', text: text));
      _input.clear();
      _sending = true;
      _error = null;
    });
    _toBottom();

    try {
      final reply = await Ai.instance.send(
        store: Store.instance,
        history: _history,
      );
      if (!mounted) return;
      setState(() => _history.add(ChatMessage(role: 'assistant', text: reply)));
      _persist();
    } on AiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      // The question is kept even when the answer failed, so a retry after a
      // dropped connection does not mean retyping it.
      _persist();
    } finally {
      if (mounted) setState(() => _sending = false);
      _toBottom();
    }
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final ready = Ai.instance.configured;

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        title: const Text('Assistant'),
        backgroundColor: c.surface,
        actions: [
          IconButton(
            tooltip: 'Saved chats',
            icon: const Icon(Icons.history, size: 20),
            onPressed: _showHistory,
          ),
          if (_history.isNotEmpty)
            IconButton(
              tooltip: 'New chat',
              icon: const Icon(Icons.add_comment_outlined, size: 19),
              onPressed: _newChat,
            ),
          IconButton(
            tooltip: 'Assistant settings',
            icon: const Icon(Icons.tune, size: 20),
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AiSettingsScreen()),
              );
              if (mounted) setState(() {});
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _history.isEmpty
                ? _Intro(ready: ready, onPick: _send)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    itemCount: _history.length,
                    itemBuilder: (_, i) => _Bubble(message: _history[i]),
                  ),
          ),

          if (_sending)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 13,
                    height: 13,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: c.brand500,
                    ),
                  ),
                  const SizedBox(width: 9),
                  Text(
                    'Thinking…',
                    style: TextStyle(color: c.muted, fontSize: 12),
                  ),
                ],
              ),
            ),

          if (_error != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: c.red50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.red200),
              ),
              child: Text(
                _error!,
                style: TextStyle(color: c.red700, fontSize: 12.5, height: 1.4),
              ),
            ),

          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: BoxDecoration(
                color: c.surface,
                border: Border(top: BorderSide(color: c.line)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      style: TextStyle(color: c.fg, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: ready
                            ? 'Ask about the portfolio…'
                            : 'Add an API key to start',
                        hintStyle: TextStyle(color: c.faint, fontSize: 14),
                        filled: true,
                        fillColor: c.subtle,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 11,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(22),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Material(
                    color: _sending ? c.lineStrong : c.brandSolid,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _sending ? null : () => _send(),
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.arrow_upward,
                          color: Colors.white,
                          size: 19,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.ready, required this.onPick});
  final bool ready;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 30, 20, 20),
      children: [
        Center(
          child: Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: c.brand50,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.auto_awesome, color: c.brand600, size: 25),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Ask about the company',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: c.fg,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 7),
        Text(
          'The assistant is briefed on the portfolio, contracts, cheques and '
          'staff — limited to what your role is allowed to see.',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.muted, fontSize: 13, height: 1.5),
        ),
        const SizedBox(height: 22),
        if (!ready)
          AppCard(
            child: Column(
              children: [
                Icon(Icons.key_outlined, color: c.amber700, size: 20),
                const SizedBox(height: 8),
                Text(
                  'This build has no API key',
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'The key ships with the app rather than being entered here. '
                  'Fill in lib/data/ai_key.dart and rebuild.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.muted, fontSize: 12.5, height: 1.5),
                ),
              ],
            ),
          )
        else
          for (final s in _AiChatScreenState._starters)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                onTap: () => onPick(s),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        s,
                        style: TextStyle(color: c.fgSoft, fontSize: 13.5),
                      ),
                    ),
                    Icon(Icons.north_east, size: 15, color: c.faint),
                  ],
                ),
              ),
            ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final mine = message.role == 'user';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.82,
        ),
        decoration: BoxDecoration(
          color: mine ? c.brandSolid : c.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: mine ? null : Border.all(color: c.line),
        ),
        // The reply is rendered; what the person typed is not — their own
        // asterisks are theirs and should come back as they wrote them.
        child: mine
            ? SelectableText(
                message.text,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13.5,
                  height: 1.5,
                ),
              )
            : MarkdownText(
                text: message.text,
                color: c.fgSoft,
                strongColor: c.fg,
              ),
      ),
    );
  }
}

/// Where the Grok key and model are entered.
class AiSettingsScreen extends StatefulWidget {
  const AiSettingsScreen({super.key});

  @override
  State<AiSettingsScreen> createState() => _AiSettingsScreenState();
}

class _AiSettingsScreenState extends State<AiSettingsScreen> {
  final _model = TextEditingController();
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    Ai.instance.load().then((_) {
      if (!mounted) return;
      setState(() => _model.text = Ai.instance.model);
    });
  }

  @override
  void dispose() {
    _model.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        title: const Text('Assistant settings'),
        backgroundColor: c.surface,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          AppCard(
            child: Row(
              children: [
                Icon(
                  Ai.instance.configured
                      ? Icons.check_circle_outline
                      : Icons.error_outline,
                  size: 19,
                  color: Ai.instance.configured ? c.brand600 : c.amber700,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    Ai.instance.configured
                        ? 'The assistant is ready. The key ships with the app, '
                              'so there is nothing to set up per device.'
                        : 'This build shipped without a key. Fill in '
                              'lib/data/ai_key.dart and rebuild.',
                    style: TextStyle(
                      color: c.fgSoft,
                      fontSize: 12.5,
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          Text(
            'Model',
            style: TextStyle(
              color: c.fg,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 7),
          TextField(
            controller: _model,
            style: TextStyle(color: c.fg, fontSize: 13.5),
            decoration: InputDecoration(
              hintText: Ai.defaultModel,
              filled: true,
              fillColor: c.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: c.line),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'A model Groq currently serves — llama-3.3-70b-versatile is a '
            'good default. A retired name comes back as a 404.',
            style: TextStyle(color: c.faint, fontSize: 11.5, height: 1.45),
          ),
          const SizedBox(height: 22),

          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: () async {
                await Ai.instance.setModel(_model.text);
                if (!mounted) return;
                setState(() => _saved = true);
              },
              style: FilledButton.styleFrom(
                backgroundColor: c.brandSolid,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Save'),
            ),
          ),
          if (_saved)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'Saved on this device.',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.brand600, fontSize: 12.5),
              ),
            ),
        ],
      ),
    );
  }
}
