import 'package:flutter/material.dart';
import '../data/store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class TenantsScreen extends StatefulWidget {
  const TenantsScreen({super.key});

  @override
  State<TenantsScreen> createState() => _TenantsScreenState();
}

class _TenantsScreenState extends State<TenantsScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final list = store.tenants.where((t) {
      if (_query.isEmpty) return true;
      final q = _query.toLowerCase();
      return t.name.toLowerCase().contains(q) ||
          t.phone.contains(q) ||
          t.nationality.toLowerCase().contains(q);
    }).toList()..sort((a, b) => a.name.compareTo(b.name));

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        title: const Text('Tenants'),
        backgroundColor: c.surface,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              style: TextStyle(color: c.fg, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Search name, phone or nationality',
                hintStyle: TextStyle(color: c.faint, fontSize: 13.5),
                prefixIcon: Icon(Icons.search, size: 19, color: c.faint),
                filled: true,
                fillColor: c.subtle,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 11),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(11),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
        ),
      ),
      body: list.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: EmptyState(
                title: 'No tenants match',
                icon: Icons.search_off,
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final t = list[i];
                final matches = store.contracts.where(
                  (x) => x.tenantId == t.id,
                );
                final unitNo = matches.isEmpty
                    ? null
                    : store.unit(matches.first.unitId).unitNo;

                return AppCard(
                  padding: const EdgeInsets.all(13),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: c.subtle,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          t.name.split(' ').take(2).map((p) => p[0]).join(),
                          style: TextStyle(
                            color: c.fgSoft,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              t.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: c.fg,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${t.nationality} · ${t.phone}'
                              '${unitNo != null ? ' · unit $unitNo' : ''}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: c.muted, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      if (t.kind == 'company')
                        StatusBadge('Company', tone: Tone.gold, dot: false),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
