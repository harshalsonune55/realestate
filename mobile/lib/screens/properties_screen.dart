import 'package:flutter/material.dart';

import '../data/photos.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'units_screen.dart';

/// How a property is being filtered. The portfolio question people actually
/// ask is "where are the empty units?", so that is what the filter answers.
enum PropertyFilter { all, hasVacancy, fullyLet }

extension on PropertyFilter {
  String get label => switch (this) {
    PropertyFilter.all => 'All buildings',
    PropertyFilter.hasVacancy => 'Has vacancy',
    PropertyFilter.fullyLet => 'Fully let',
  };
}

/// My Properties — the buildings behind the units, in the same card language
/// as [UnitsScreen]: a full-bleed header, the name and area, and the numbers
/// that decide whether this building needs attention today.
///
/// Tapping a card opens that building's units rather than a dead-end detail
/// page: the next question after "which building" is always "which unit".
class PropertiesScreen extends StatefulWidget {
  const PropertiesScreen({super.key});

  @override
  State<PropertiesScreen> createState() => _PropertiesScreenState();
}

class _PropertiesScreenState extends State<PropertiesScreen> {
  String _query = '';
  PropertyFilter _filter = PropertyFilter.all;

  static const _gradients = [
    [Color(0xFF23415C), Color(0xFF4E7BA6)],
    [Color(0xFF2B3A4A), Color(0xFF5C7189)],
    [Color(0xFF4A3B2A), Color(0xFF8A6A47)],
    [Color(0xFF2E4633), Color(0xFF5F8A6B)],
    [Color(0xFF3A3A3A), Color(0xFF6E6E6E)],
  ];

  Future<void> _pickFilter() async {
    final c = context.c;
    final chosen = await showModalBottomSheet<PropertyFilter>(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: c.line,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const SizedBox(height: 14),
            for (final f in PropertyFilter.values)
              ListTile(
                title: Text(
                  f.label,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 15,
                    fontWeight: f == _filter ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                trailing: f == _filter
                    ? Icon(Icons.check, size: 19, color: c.brandSolid)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(f),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (chosen != null && mounted) setState(() => _filter = chosen);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    final rows = store.properties.map((p) => _Portfolio.of(p, store)).where((r) {
      final q = _query.trim().toLowerCase();
      final matches = q.isEmpty ||
          r.property.name.toLowerCase().contains(q) ||
          r.property.area.toLowerCase().contains(q) ||
          r.property.code.toLowerCase().contains(q) ||
          r.property.owner.toLowerCase().contains(q);
      if (!matches) return false;
      return switch (_filter) {
        PropertyFilter.all => true,
        PropertyFilter.hasVacancy => r.vacant > 0,
        PropertyFilter.fullyLet => r.vacant == 0 && r.total > 0,
      };
    }).toList();

    final areas = store.properties.map((p) => p.area).toSet().length;

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        backgroundColor: c.canvas,
        surfaceTintColor: c.canvas,
        elevation: 0,
        foregroundColor: c.fg,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        children: [
          Text(
            'My Properties',
            style: TextStyle(
              color: c.fg,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              text: 'You have ',
              style: TextStyle(color: c.muted, fontSize: 14),
              children: [
                TextSpan(
                  text: '${store.properties.length} buildings',
                  style: TextStyle(color: c.fg, fontWeight: FontWeight.w700),
                ),
                TextSpan(text: ' across $areas ${areas == 1 ? 'area' : 'areas'}'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  style: TextStyle(color: c.fg, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Search any building',
                    hintStyle: TextStyle(color: c.faint, fontSize: 14),
                    prefixIcon: Icon(Icons.search, size: 20, color: c.faint),
                    filled: true,
                    fillColor: c.surface,
                    contentPadding: const EdgeInsets.symmetric(vertical: 15),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(color: c.line),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(color: c.lineStrong),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // The filter is a real control, not decoration: it narrows the
              // list and says so on the chip below.
              GestureDetector(
                onTap: _pickFilter,
                child: Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: _filter == PropertyFilter.all ? c.surface : c.inverse,
                    shape: BoxShape.circle,
                    border: Border.all(color: c.line),
                  ),
                  child: Icon(
                    Icons.tune,
                    size: 20,
                    color: _filter == PropertyFilter.all ? c.fg : Colors.white,
                  ),
                ),
              ),
            ],
          ),
          if (_filter != PropertyFilter.all) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: InputChip(
                label: Text(_filter.label),
                onDeleted: () => setState(() => _filter = PropertyFilter.all),
                backgroundColor: c.subtle,
                side: BorderSide(color: c.line),
                labelStyle: TextStyle(color: c.fg, fontSize: 12.5),
              ),
            ),
          ],
          const SizedBox(height: 20),
          if (rows.isEmpty)
            const EmptyState(
              icon: Icons.apartment_outlined,
              title: 'No buildings match',
              sub: 'Try a different search, or clear the filter.',
            )
          else
            ...rows.asMap().entries.map(
              (e) => Padding(
                padding: const EdgeInsets.only(bottom: 22),
                child: _PropertyCard(
                  row: e.value,
                  gradient: _gradients[e.key % _gradients.length],
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => UnitsScreen(
                        propertyId: e.value.property.id,
                        title: e.value.property.name,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One building plus the counts the card prints. Derived, never stored: the
/// units are the record, this is only how they add up.
class _Portfolio {
  const _Portfolio({
    required this.property,
    required this.total,
    required this.occupied,
    required this.vacant,
    required this.maintenance,
  });

  final Property property;
  final int total, occupied, vacant, maintenance;

  double get letRatio => total == 0 ? 0 : occupied / total;

  static _Portfolio of(Property p, Store store) {
    final units = store.units.where((u) => u.propertyId == p.id);
    return _Portfolio(
      property: p,
      total: units.length,
      occupied: units.where((u) => u.status == UnitStatus.occupied).length,
      vacant: units.where((u) => u.status == UnitStatus.vacant).length,
      maintenance: units.where((u) => u.status == UnitStatus.maintenance).length,
    );
  }
}

class _PropertyCard extends StatelessWidget {
  const _PropertyCard({
    required this.row,
    required this.gradient,
    required this.onTap,
  });

  final _Portfolio row;
  final List<Color> gradient;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final p = row.property;
    final pct = (row.letRatio * 100).round();

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // photo header — a real exterior, over the gradient it falls back to
          PropertyPhoto(
            url: Photos.building(p.id),
            gradient: gradient,
            // Occupancy sits on the image, where a listing app puts the
            // price: it is the first thing anyone looks for.
            overlay: Positioned(
              left: 14,
              bottom: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 11,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$pct% let',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _VacancyPill(vacant: row.vacant),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            '${p.area} · ${p.floors} floors · ${p.code}',
            style: TextStyle(color: c.muted, fontSize: 13.5),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _stat(c, '${row.total} units'),
              _dot(c),
              _stat(c, '${row.occupied} rented'),
              _dot(c),
              _stat(
                c,
                row.maintenance > 0
                    ? '${row.maintenance} in works'
                    : '${row.vacant} vacant',
              ),
            ],
          ),
          const SizedBox(height: 10),
          ProgressBar(value: row.letRatio),
        ],
      ),
    );
  }

  Widget _stat(AppColors c, String t) => Text(
    t,
    style: TextStyle(
      color: c.fgSoft,
      fontSize: 13.5,
      fontWeight: FontWeight.w600,
    ),
  );

  Widget _dot(AppColors c) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 8),
    child: Container(
      width: 3,
      height: 3,
      decoration: BoxDecoration(color: c.faint, shape: BoxShape.circle),
    ),
  );
}

class _VacancyPill extends StatelessWidget {
  const _VacancyPill({required this.vacant});
  final int vacant;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final full = vacant == 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: full ? c.subtle : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            full ? Icons.check_circle : Icons.circle_outlined,
            size: 14,
            color: full ? c.fg : c.muted,
          ),
          const SizedBox(width: 5),
          Text(
            full ? 'Fully let' : '$vacant vacant',
            style: TextStyle(
              color: c.fg,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
