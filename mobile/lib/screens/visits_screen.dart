import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'book_visit_screen.dart';

/// Viewings — list of scheduled and past visits, with a Book action.
class VisitsScreen extends StatefulWidget {
  const VisitsScreen({super.key});

  @override
  State<VisitsScreen> createState() => _VisitsScreenState();
}

class _VisitsScreenState extends State<VisitsScreen> {
  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final list = [...store.visits]..sort((a, b) => b.startsAt.compareTo(a.startsAt));

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(title: const Text('Viewings'), backgroundColor: c.surface),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const BookVisitScreen()),
          );
          if (mounted) setState(() {});
        },
        backgroundColor: c.brandSolid,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Book viewing', style: TextStyle(color: Colors.white)),
      ),
      body: list.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: EmptyState(
                  title: 'No viewings booked yet', icon: Icons.event_available_outlined),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) => _VisitCard(v: list[i]),
            ),
    );
  }
}

class _VisitCard extends StatelessWidget {
  const _VisitCard({required this.v});
  final Visit v;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final unit = Store.instance.unit(v.unitId);
    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${v.ref} · ${v.visitorName}',
                    style: TextStyle(
                        color: c.fg, fontSize: 14, fontWeight: FontWeight.w700)),
              ),
              _VisitStatusChip(status: v.status),
            ],
          ),
          const SizedBox(height: 4),
          Text('Unit ${unit.unitNo} · ${v.visitorPhone}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.muted, fontSize: 12.5)),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.schedule, size: 14, color: c.faint),
              const SizedBox(width: 5),
              Text('${_dt(v.startsAt)} · ${v.durationMins} min',
                  style: TextStyle(color: c.fgSoft, fontSize: 12.5)),
            ],
          ),
        ],
      ),
    );
  }

  static String _dt(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final h = d.hour.toString().padLeft(2, '0');
    final m = d.minute.toString().padLeft(2, '0');
    return '${d.day} ${months[d.month - 1]} ${d.year}, $h:$m';
  }
}

class _VisitStatusChip extends StatelessWidget {
  const _VisitStatusChip({required this.status});
  final VisitStatus status;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    late final Color bg, fg;
    switch (status) {
      case VisitStatus.completed:
        bg = c.brand50; fg = c.brand600; break;
      case VisitStatus.cancelled:
      case VisitStatus.noShow:
        bg = c.red50; fg = c.red700; break;
      default:
        bg = c.subtle; fg = c.fgSoft;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(visitStatusLabel[status]!,
          style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}
