import 'package:flutter/material.dart';

import '../data/ai.dart';
import '../data/store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

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
    final saved = user == null
        ? <ChatMessage>[]
        : await Ai.instance.loadHistory(user.id);
    if (!mounted) return;
    setState(() => _history.addAll(saved));
    if (saved.isNotEmpty) _toBottom();
  }

  void _persist() {
    final user = Store.instance.currentUser;
    if (user != null) Ai.instance.saveHistory(user.id, _history);
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
          if (_history.isNotEmpty)
            IconButton(
              tooltip: 'Clear conversation',
              icon: const Icon(Icons.delete_outline, size: 20),
              onPressed: () {
                final user = Store.instance.currentUser;
                if (user != null) Ai.instance.clearHistory(user.id);
                setState(() {
                  _history.clear();
                  _error = null;
                });
              },
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
        child: SelectableText(
          message.text,
          style: TextStyle(
            color: mine ? Colors.white : c.fgSoft,
            fontSize: 13.5,
            height: 1.5,
          ),
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
