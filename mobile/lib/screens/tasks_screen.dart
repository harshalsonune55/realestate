import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final user = store.currentUser!;
        final mine = store.tasksFor(user.id);
        final overdue = mine
            .where((t) => t.status == TaskStatus.overdue)
            .toList();
        final rest = mine.where((t) => t.status != TaskStatus.overdue).toList();

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(
            title: const Text('My tasks'),
            backgroundColor: c.surface,
          ),
          body: mine.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: EmptyState(
                    title: 'Nothing assigned to you',
                    sub:
                        'New work appears here automatically as the system creates it.',
                    icon: Icons.inbox_outlined,
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                  children: [
                    if (overdue.isNotEmpty) ...[
                      SectionHeader(
                        title: 'Overdue',
                        sub:
                            '${overdue.length} item${overdue.length > 1 ? 's' : ''} past due.',
                      ),
                      for (final t in overdue)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _TaskCard(task: t),
                        ),
                      const SizedBox(height: 10),
                    ],
                    if (rest.isNotEmpty) ...[
                      SectionHeader(title: 'Upcoming'),
                      for (final t in rest)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _TaskCard(task: t),
                        ),
                    ],
                  ],
                ),
        );
      },
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task});
  final Task task;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final overdue = task.status == TaskStatus.overdue;
    final done = task.status == TaskStatus.done;
    final days = task.dueDate.difference(DateTime.now()).inDays;

    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => store.toggleTask(task),
            child: Container(
              width: 22,
              height: 22,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                color: done ? c.brandSolid : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: done ? c.brandSolid : c.lineStrong,
                  width: 1.5,
                ),
              ),
              child: done
                  ? const Icon(Icons.check, size: 15, color: Colors.white)
                  : null,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    decoration: done ? TextDecoration.lineThrough : null,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  task.detail,
                  style: TextStyle(color: c.muted, fontSize: 12, height: 1.35),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (overdue)
                      StatusBadge('Overdue', tone: Tone.bad)
                    else if (task.priority == 'high')
                      StatusBadge('High', tone: Tone.warn)
                    else
                      StatusBadge(relativeDays(days), tone: Tone.neutral),
                    const SizedBox(width: 7),
                    // Long badge text plus a long date exceeds a 375pt card, so
                    // the date yields rather than overflowing.
                    Flexible(
                      child: Text(
                        'Due ${fmtDate(task.dueDate)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: c.faint, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
