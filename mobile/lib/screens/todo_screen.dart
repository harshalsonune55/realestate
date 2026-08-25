import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

/// To-Do — a day-based schedule of the signed-in employee's tasks and viewings,
/// grouped into Morning / Afternoon / Evening with tick-off circles.
class TodoScreen extends StatefulWidget {
  const TodoScreen({super.key});

  @override
  State<TodoScreen> createState() => _TodoScreenState();
}

class _TodoScreenState extends State<TodoScreen> {
  final Set<String> _done = {};
  late DateTime _selected = DateTime.now();
  String _query = '';

  static const _tagColors = {
    'Viewing': (Color(0xFFF3EDFB), Color(0xFF7C5CD6)),
    'High': (Color(0xFFFDECEC), Color(0xFFD24B4B)),
    'Follow-up': (Color(0xFFEAF7EE), Color(0xFF3E9B5B)),
    'Task': (Color(0xFFF1F3F5), Color(0xFF5F6368)),
  };

  List<_Item> _itemsFor(DateTime day) {
    final store = Store.instance;
    final uid = store.currentUser?.id ?? '';
    final items = <_Item>[];

    // scheduled viewings that day
    for (final v in store.visits) {
      if (v.status != VisitStatus.scheduled) continue;
      if (!_sameDay(v.startsAt, day)) continue;
      final unit = store.units
          .where((u) => u.id == v.unitId)
          .cast<Unit?>()
          .firstWhere((u) => true, orElse: () => null);
      items.add(_Item(
        id: 'v${v.id}',
        start: v.startsAt,
        end: v.startsAt.add(Duration(minutes: v.durationMins)),
        title: 'Viewing — ${v.visitorName}'
            '${unit != null ? ' · ${unit.unitNo}' : ''}',
        tag: 'Viewing',
      ));
    }

    // the employee's open tasks, given plausible slots through the day
    final tasks = store.tasks
        .where((t) => t.assignedTo == uid && t.status != TaskStatus.done)
        .take(6)
        .toList();
    for (var i = 0; i < tasks.length; i++) {
      final t = tasks[i];
      final start = DateTime(day.year, day.month, day.day, 9 + i * 2, 0);
      items.add(_Item(
        id: 't${t.id}',
        start: start,
        end: start.add(const Duration(minutes: 45)),
        title: t.title,
        tag: t.priority == 'high' ? 'High' : 'Task',
      ));
    }

    items.sort((a, b) => a.start.compareTo(b.start));
    if (_query.isEmpty) return items;
    final q = _query.toLowerCase();
    return items.where((i) => i.title.toLowerCase().contains(q)).toList();
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final today = DateTime.now();
    final monday = today.subtract(Duration(days: (today.weekday + 6) % 7));
    final week = List.generate(7, (i) => monday.add(Duration(days: i)));
    const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    final items = _itemsFor(_selected);
    final morning = items.where((i) => i.start.hour < 12).toList();
    final afternoon =
        items.where((i) => i.start.hour >= 12 && i.start.hour < 17).toList();
    final evening = items.where((i) => i.start.hour >= 17).toList();

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(title: const Text('To-Do'), backgroundColor: c.surface),
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            // search
            TextField(
              onChanged: (v) => setState(() => _query = v),
              style: TextStyle(color: c.fg, fontSize: 15),
              decoration: InputDecoration(
                hintText: 'Search…',
                hintStyle: TextStyle(color: c.faint, fontSize: 15),
                suffixIcon: Icon(Icons.search, size: 20, color: c.faint),
                filled: true,
                fillColor: c.surface,
                contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 18),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide(color: c.line),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide(color: c.lineStrong),
                ),
              ),
            ),
            const SizedBox(height: 18),
            // week day picker
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (var i = 0; i < 7; i++)
                  _DayPill(
                    name: dayNames[i],
                    day: week[i].day,
                    selected: _sameDay(week[i], _selected),
                    onTap: () => setState(() => _selected = week[i]),
                  ),
              ],
            ),
            const SizedBox(height: 22),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 40),
                child: Center(
                  child: Text('Nothing scheduled for this day.',
                      style: TextStyle(color: c.muted, fontSize: 14)),
                ),
              ),
            if (morning.isNotEmpty) ...[
              _SectionLabel(icon: Icons.wb_twilight, label: 'MORNING'),
              ...morning.map(_row),
              const SizedBox(height: 14),
            ],
            if (afternoon.isNotEmpty) ...[
              _SectionLabel(icon: Icons.wb_sunny_outlined, label: 'AFTERNOON'),
              ...afternoon.map(_row),
              const SizedBox(height: 14),
            ],
            if (evening.isNotEmpty) ...[
              _SectionLabel(icon: Icons.nightlight_outlined, label: 'EVENING'),
              ...evening.map(_row),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(_Item item) {
    final c = context.c;
    final done = _done.contains(item.id);
    final palette = _tagColors[item.tag];
    final tint = palette?.$1;
    final tagColor = palette?.$2 ?? c.muted;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GestureDetector(
        onTap: () => setState(() =>
            done ? _done.remove(item.id) : _done.add(item.id)),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: item.tag == 'Task' ? c.subtle : (tint ?? c.subtle),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // check circle
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: done ? Colors.black : Colors.transparent,
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: done ? Colors.black : c.lineStrong, width: 2),
                ),
                child: done
                    ? const Icon(Icons.check, size: 15, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${_t(item.start)} - ${_t(item.end)}',
                        style: TextStyle(color: c.muted, fontSize: 13.5)),
                    const SizedBox(height: 3),
                    Text(item.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: c.fg,
                            fontSize: 15.5,
                            fontWeight: FontWeight.w700,
                            decoration:
                                done ? TextDecoration.lineThrough : null)),
                  ],
                ),
              ),
              if (item.tag == 'Viewing' || item.tag == 'High' || item.tag == 'Follow-up') ...[
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(item.tag,
                      style: TextStyle(
                          color: tagColor,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _t(DateTime d) {
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour < 12 ? 'AM' : 'PM';
    return '${h.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')} $ampm';
  }
}

class _Item {
  _Item({
    required this.id,
    required this.start,
    required this.end,
    required this.title,
    required this.tag,
  });
  final String id, title, tag;
  final DateTime start, end;
}

class _DayPill extends StatelessWidget {
  const _DayPill({
    required this.name,
    required this.day,
    required this.selected,
    required this.onTap,
  });
  final String name;
  final int day;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF5B4CE0) : c.subtle,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          children: [
            Text(name,
                style: TextStyle(
                    color: selected ? Colors.white70 : c.muted,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 5),
            Text('$day',
                style: TextStyle(
                    color: selected ? Colors.white : c.fg,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 2),
      child: Row(
        children: [
          Icon(icon, size: 18, color: c.fgSoft),
          const SizedBox(width: 8),
          Text(label,
              style: TextStyle(
                  color: c.fgSoft,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5)),
        ],
      ),
    );
  }
}
