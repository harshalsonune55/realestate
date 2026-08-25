import 'package:flutter/material.dart';
import '../data/store.dart';
import '../data/pms_api.dart';
import '../data/api_config.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

/// Book a viewing — the mobile equivalent of the web /visits/new form.
class BookVisitScreen extends StatefulWidget {
  const BookVisitScreen({super.key});

  @override
  State<BookVisitScreen> createState() => _BookVisitScreenState();
}

class _BookVisitScreenState extends State<BookVisitScreen> {
  String? _unitId;
  final _name = TextEditingController();
  final _phone = TextEditingController(text: '+9715');
  final _email = TextEditingController();
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _time = const TimeOfDay(hour: 10, minute: 0);
  int _duration = 30;
  String? _error;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: now,
      lastDate: now.add(const Duration(days: 120)),
    );
    if (d != null) setState(() => _date = d);
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: _time);
    if (t != null) setState(() => _time = t);
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final startsAt =
        DateTime(_date.year, _date.month, _date.day, _time.hour, _time.minute);

    // Local checks first, so the visitor gets instant feedback on the obvious
    // mistakes without a round-trip.
    final local = Store.instance.validateVisit(
      unitId: _unitId ?? '',
      visitorName: _name.text,
      visitorPhone: _phone.text,
      visitorEmail: _email.text,
      startsAt: startsAt,
      durationMins: _duration,
    );
    if (local != null) {
      setState(() { _saving = false; _error = local; });
      return;
    }

    // Book through the PMS backend so it reaches Postgres and the Odoo calendar.
    final result = await PmsApi.bookVisit(
      unitId: _unitId!,
      visitorName: _name.text,
      visitorPhone: _phone.text,
      visitorEmail: _email.text,
      startsAt: startsAt,
      durationMins: _duration,
      bookedBy: Store.instance.currentUser?.id,
    );
    if (!mounted) return;

    if (!result.ok) {
      // Offline / server unreachable: keep the booking locally so it is not
      // lost, and tell the user it has not reached Odoo.
      if (ApiConfig.configured && (result.error?.contains('reach the PMS') ?? false)) {
        Store.instance.bookVisit(
          unitId: _unitId!, visitorName: _name.text, visitorPhone: _phone.text,
          visitorEmail: _email.text, startsAt: startsAt, durationMins: _duration,
        );
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Saved on the device — offline, so it has not reached Odoo yet.'),
        ));
        return;
      }
      setState(() { _saving = false; _error = result.error; });
      return;
    }

    // Booked on the server + mirrored to Odoo. Reflect it in the local list.
    Store.instance.recordBookedVisit(
      ref: result.ref ?? 'VW-????', unitId: _unitId!, visitorName: _name.text,
      visitorPhone: _phone.text, visitorEmail: _email.text,
      startsAt: startsAt, durationMins: _duration,
    );
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(result.synced
          ? 'Booked · ${result.ref} · Odoo calendar event #${result.odooEventId}'
          : (result.message ?? 'Booked.')),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final units = store.units
        .where((u) => u.status == UnitStatus.vacant)
        .toList()
      ..sort((a, b) => a.unitNo.compareTo(b.unitNo));

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(title: const Text('Book viewing'), backgroundColor: c.surface),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _label('Unit', c),
          DropdownButtonFormField<String>(
            initialValue: _unitId,
            isExpanded: true,
            decoration: _dec(c, 'Choose a vacant unit'),
            items: units
                .map((u) => DropdownMenuItem(
                      value: u.id,
                      child: Text(
                          '${u.unitNo} · ${store.property(u.propertyId).name}',
                          overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _unitId = v),
          ),
          const SizedBox(height: 16),
          _label('Visitor name', c),
          TextField(controller: _name, decoration: _dec(c, 'Full name')),
          const SizedBox(height: 16),
          _label('Mobile number', c),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: _dec(c, '+971501234567'),
          ),
          const SizedBox(height: 16),
          _label('Email (optional)', c),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: _dec(c, 'name@example.com'),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('Date', c),
                    _tapField(c, _fmtDate(_date), _pickDate, Icons.calendar_today),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _label('Time', c),
                    _tapField(c, _time.format(context), _pickTime, Icons.schedule),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _label('Duration', c),
          Wrap(
            spacing: 8,
            children: Store.visitDurations.map((d) {
              final sel = _duration == d;
              return ChoiceChip(
                label: Text('$d min'),
                selected: sel,
                onSelected: (_) => setState(() => _duration = d),
                selectedColor: c.brand50,
                labelStyle: TextStyle(
                    color: sel ? c.brand600 : c.fgSoft,
                    fontWeight: FontWeight.w600,
                    fontSize: 12.5),
              );
            }).toList(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: c.red50,
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: c.red200),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline, size: 18, color: c.red700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_error!,
                        style: TextStyle(color: c.red800, fontSize: 13)),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
          SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: _saving ? null : _submit,
              style: FilledButton.styleFrom(backgroundColor: c.brandSolid),
              child: Text(_saving ? 'Booking…' : 'Book viewing',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String t, AppColors c) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(t,
            style: TextStyle(
                color: c.fgSoft, fontSize: 13, fontWeight: FontWeight.w600)),
      );

  InputDecoration _dec(AppColors c, String hint) => InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: c.faint, fontSize: 13.5),
        filled: true,
        fillColor: c.subtle,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: BorderSide.none,
        ),
      );

  Widget _tapField(AppColors c, String value, VoidCallback onTap, IconData icon) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: c.subtle,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Row(
            children: [
              Expanded(
                  child: Text(value,
                      style: TextStyle(color: c.fg, fontSize: 14))),
              Icon(icon, size: 17, color: c.faint),
            ],
          ),
        ),
      );

  static String _fmtDate(DateTime d) =>
      '${d.day}/${d.month}/${d.year}';
}
