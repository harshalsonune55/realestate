import 'package:flutter/material.dart';
import '../data/store.dart';
import '../theme/app_theme.dart';

/// New Messages — Agents / Customers tabs with a clean chat list, matching the
/// reference. Previews are seeded from the roster and tenant list.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  int _tab = 0; // 0 = agents, 1 = customers

  static const _agentLines = [
    "Hey! I've got good news about the unit…",
    "I'll take care of the paperwork today.",
    "Sorry, about the price we agreed…",
    "Can you free up a slot for the viewing?",
    "Have a great day! Talk soon.",
    "The inspection is scheduled for Monday.",
  ];
  static const _customerLines = [
    "Is the apartment still available?",
    "Could we reschedule the viewing?",
    "Thank you for your help earlier!",
    "What's included in the service charge?",
    "I'd like to renew my contract.",
  ];
  static const _times = [
    '12:30', '11:40', '11:03', '09:08', '08:41', '08:12', '07:55'
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    final agents = store.users
        .where((u) => u.active)
        .toList()
        .asMap()
        .entries
        .map((e) => _Msg(
              name: e.value.name,
              preview: _agentLines[e.key % _agentLines.length],
              time: _times[e.key % _times.length],
            ))
        .toList();
    final customers = store.tenants
        .take(8)
        .toList()
        .asMap()
        .entries
        .map((e) => _Msg(
              name: e.value.name,
              preview: _customerLines[e.key % _customerLines.length],
              time: _times[e.key % _times.length],
            ))
        .toList();

    final list = _tab == 0 ? agents : customers;

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(title: const Text('Messages'), backgroundColor: c.surface),
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: Text('New Messages',
                  style: TextStyle(
                      color: c.fg, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            ),
            const SizedBox(height: 14),
            // segmented tabs
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  color: c.subtle,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    _tabButton('Agents', agents.length, 0, c),
                    _tabButton('Customers', customers.length, 1, c),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                itemCount: list.length + 1,
                separatorBuilder: (_, _) => Divider(height: 1, color: c.lineSoft),
                itemBuilder: (context, i) {
                  if (i == list.length) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 22),
                      child: Center(
                        child: Text("You've reached the end of the list.",
                            style: TextStyle(color: c.faint, fontSize: 12.5)),
                      ),
                    );
                  }
                  return _MessageRow(msg: list[i]);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabButton(String label, int count, int index, AppColors c) {
    final active = _tab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tab = index),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: active ? Colors.black : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(label,
                  style: TextStyle(
                      color: active ? Colors.white : c.fgSoft,
                      fontSize: 14,
                      fontWeight: FontWeight.w600)),
              const SizedBox(width: 7),
              Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? Colors.white24 : c.line,
                  shape: BoxShape.circle,
                ),
                child: Text('$count',
                    style: TextStyle(
                        color: active ? Colors.white : c.fgSoft,
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Msg {
  const _Msg({required this.name, required this.preview, required this.time});
  final String name, preview, time;
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({required this.msg});
  final _Msg msg;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final initials = msg.name
        .split(' ')
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: c.subtle, shape: BoxShape.circle),
            child: Text(initials,
                style: TextStyle(
                    color: c.fgSoft, fontSize: 14, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(msg.name,
                    style: TextStyle(
                        color: c.fg, fontSize: 15, fontWeight: FontWeight.w700)),
                const SizedBox(height: 3),
                Text(msg.preview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.muted, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(msg.time, style: TextStyle(color: c.faint, fontSize: 12.5)),
        ],
      ),
    );
  }
}
