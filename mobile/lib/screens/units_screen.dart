import 'package:flutter/material.dart';
import '../data/photos.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'unit_detail_screen.dart';

/// How the unit list is narrowed. Occupied and reserved both read as "rented"
/// on the card, so they are one choice here too.
enum UnitFilter { all, vacant, rented, maintenance }

extension on UnitFilter {
  String get label => switch (this) {
    UnitFilter.all => 'All units',
    UnitFilter.vacant => 'Vacant only',
    UnitFilter.rented => 'Rented only',
    UnitFilter.maintenance => 'Under maintenance',
  };

  bool matches(Unit u) => switch (this) {
    UnitFilter.all => true,
    UnitFilter.vacant => u.status == UnitStatus.vacant,
    UnitFilter.rented =>
      u.status == UnitStatus.occupied || u.status == UnitStatus.reserved,
    UnitFilter.maintenance => u.status == UnitStatus.maintenance,
  };
}

/// My Units — a clean, card-based list of the portfolio's units, each with a
/// coloured header, size/type chips and a Vacant/Rented badge.
///
/// Given a [propertyId] it shows one building's units instead of the whole
/// portfolio, which is what tapping a property card opens.
class UnitsScreen extends StatefulWidget {
  const UnitsScreen({super.key, this.propertyId, this.title});

  /// Limits the list to one building. `null` shows everything.
  final String? propertyId;

  /// Heading override — the building's name, when scoped to one.
  final String? title;

  @override
  State<UnitsScreen> createState() => _UnitsScreenState();
}

class _UnitsScreenState extends State<UnitsScreen> {
  String _query = '';
  UnitFilter _filter = UnitFilter.all;

  static const _gradients = [
    [Color(0xFF2B3A4A), Color(0xFF5C7189)],
    [Color(0xFF3A3A3A), Color(0xFF6E6E6E)],
    [Color(0xFF23415C), Color(0xFF4E7BA6)],
    [Color(0xFF4A3B2A), Color(0xFF8A6A47)],
    [Color(0xFF2E4633), Color(0xFF5F8A6B)],
  ];

  Future<void> _pickFilter() async {
    final c = context.c;
    final chosen = await showModalBottomSheet<UnitFilter>(
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
            for (final f in UnitFilter.values)
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
    final inScope = store.units
        .where((u) => widget.propertyId == null || u.propertyId == widget.propertyId)
        .toList();

    final units = inScope.where((u) {
      if (!_filter.matches(u)) return false;
      if (_query.isEmpty) return true;
      final q = _query.toLowerCase();
      final prop = store.property(u.propertyId).name.toLowerCase();
      return u.unitNo.toLowerCase().contains(q) ||
          prop.contains(q) ||
          u.type.toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: c.canvas,
      // Pushed as a route, never a tab, so it carries its own way back.
      appBar: AppBar(
        backgroundColor: c.canvas,
        surfaceTintColor: c.canvas,
        elevation: 0,
        foregroundColor: c.fg,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          children: [
            Text(widget.title ?? 'My Units',
                style: TextStyle(
                    color: c.fg, fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(
                text: 'You have ',
                style: TextStyle(color: c.muted, fontSize: 14),
                children: [
                  TextSpan(
                      text: '${inScope.length} active units',
                      style: TextStyle(color: c.fg, fontWeight: FontWeight.w700)),
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
                      hintText: 'Search any unit',
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
                GestureDetector(
                  onTap: _pickFilter,
                  child: Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: _filter == UnitFilter.all ? c.surface : c.inverse,
                      shape: BoxShape.circle,
                      border: Border.all(color: c.line),
                    ),
                    child: Icon(Icons.tune,
                        size: 20,
                        color: _filter == UnitFilter.all ? c.fg : Colors.white),
                  ),
                ),
              ],
            ),
            if (_filter != UnitFilter.all) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: InputChip(
                  label: Text(_filter.label),
                  onDeleted: () => setState(() => _filter = UnitFilter.all),
                  backgroundColor: c.subtle,
                  side: BorderSide(color: c.line),
                  labelStyle: TextStyle(color: c.fg, fontSize: 12.5),
                ),
              ),
            ],
            const SizedBox(height: 20),
            if (units.isEmpty)
              const EmptyState(
                icon: Icons.door_front_door_outlined,
                title: 'No units match',
                sub: 'Try a different search, or clear the filter.',
              ),
            ...units.asMap().entries.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 22),
                  child: _UnitCard(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => UnitDetailScreen(unitId: e.value.id),
                      ),
                    ),
                    unit: e.value,
                    gradient: _gradients[e.key % _gradients.length],
                    // Scoped to one building, the heading above already names
                    // it — repeating it on every card just prints the same
                    // building over and over down the screen.
                    showProperty: widget.propertyId == null,
                  ),
                )),
          ],
        ),
      ),
    );
  }
}

class _UnitCard extends StatelessWidget {
  const _UnitCard({
    required this.unit,
    required this.gradient,
    required this.showProperty,
    required this.onTap,
  });

  final VoidCallback onTap;
  final Unit unit;
  final List<Color> gradient;

  /// False when the whole list is one building and the heading already says so.
  final bool showProperty;

  int get _beds {
    switch (unit.type) {
      case '3BR':
        return 3;
      case '2BR':
        return 2;
      case '1BR':
        return 1;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final property = Store.instance.property(unit.propertyId);
    final rented = unit.status == UnitStatus.occupied ||
        unit.status == UnitStatus.reserved;
    final m2 = (unit.sizeSqft * 0.0929).round();

    return GestureDetector(
      onTap: onTap,
      // Opaque so the gaps between the photo and the chips are tappable too —
      // a card that only responds on its text is a card that feels broken.
      behavior: HitTestBehavior.opaque,
      child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // photo header — a real interior, over the gradient it falls back to
        PropertyPhoto(
          url: Photos.interior(unit.id),
          gradient: gradient,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Text(
                  showProperty
                      ? '${property.name} · ${unit.unitNo}'
                      : 'Unit ${unit.unitNo}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: c.fg, fontSize: 19, fontWeight: FontWeight.w700)),
            ),
            _StatusPill(rented: rented),
          ],
        ),
        const SizedBox(height: 3),
        Text(
            showProperty
                ? '${property.area} · Floor ${unit.floor}'
                : 'Floor ${unit.floor}',
            style: TextStyle(color: c.muted, fontSize: 13.5)),
        const SizedBox(height: 10),
        Row(
          children: [
            _chip(c, '$m2 m²'),
            _dot(c),
            _chip(c, _beds == 0 ? 'Studio' : '$_beds Bedrooms'),
            _dot(c),
            _chip(c, unit.type),
          ],
        ),
      ],
      ),
    );
  }

  Widget _chip(AppColors c, String t) => Text(t,
      style: TextStyle(color: c.fgSoft, fontSize: 13.5, fontWeight: FontWeight.w600));

  Widget _dot(AppColors c) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Container(
            width: 3,
            height: 3,
            decoration: BoxDecoration(color: c.faint, shape: BoxShape.circle)),
      );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.rented});
  final bool rented;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: rented ? c.subtle : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(rented ? Icons.check_circle : Icons.circle_outlined,
              size: 14, color: rented ? c.fg : c.muted),
          const SizedBox(width: 5),
          Text(rented ? 'Rented' : 'Vacant',
              style: TextStyle(
                  color: c.fg, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
