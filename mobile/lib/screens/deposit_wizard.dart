import 'package:flutter/material.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// The four-step banking procedure, ported from the web app's DepositWizard.
///
/// The rules in [_problems] are the same ones enforced in
/// `src/lib/actions/cheque-rules.ts`: physical verification, no future-dated
/// deposit, a 14-day back-dating limit that escalates to a manager, and a typed
/// confirmation of the cheque number. Steps unlock in order.
class DepositWizard extends StatefulWidget {
  const DepositWizard({super.key, required this.chequeId});
  final String chequeId;

  @override
  State<DepositWizard> createState() => _DepositWizardState();
}

const _companyAccounts = [
  'Al Manara Holdings — ENBD ****4471',
  'Al Manara Holdings — ADCB ****9012',
  'Al Manara Escrow — FAB ****3388',
];
const _methods = ['Bank counter', 'Cheque deposit machine', 'Bank collection'];

class _DepositWizardState extends State<DepositWizard> {
  int _index = 0;
  final _attempted = <int, bool>{};

  // step 1 — physical verification
  bool _retrieved = false, _detailsMatch = false, _dateMatch = false;
  // step 2 — the bank record
  String? _account, _method;
  String _slipNo = '';
  DateTime _depositDate = DateTime.now();
  // step 3 — typed confirmation
  String _typedNo = '';

  Cheque get _cheque =>
      Store.instance.cheques.firstWhere((c) => c.id == widget.chequeId);

  int get _daysBackdated {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day)
        .difference(
          DateTime(_depositDate.year, _depositDate.month, _depositDate.day),
        )
        .inDays;
  }

  /// Blocking problems per step. An empty list means the step may be left.
  List<List<String>> _problems() {
    final s = [<String>[], <String>[], <String>[], <String>[]];

    if (!_retrieved) {
      s[0].add('Confirm the original cheque has been taken out of the safe.');
    }
    if (!_detailsMatch) {
      s[0].add('Confirm the cheque number, bank and amount match the record.');
    }
    if (!_dateMatch) {
      s[0].add('Confirm the date written on the cheque matches the due date.');
    }

    if (_account == null) {
      s[1].add('Select the company account the cheque is going into.');
    }
    if (_method == null) s[1].add('Select how the cheque was deposited.');
    if (_slipNo.trim().length < 3) {
      s[1].add('Enter the bank deposit slip / reference number.');
    }
    if (_daysBackdated < 0) s[1].add('Deposit date cannot be in the future.');
    if (_daysBackdated > 14) {
      s[1].add(
        'Deposit date is more than 14 days ago — ask a manager to record this instead.',
      );
    }

    if (_typedNo.trim() != _cheque.chequeNo) {
      s[2].add(
        'Type the cheque number ${_cheque.chequeNo} exactly to confirm.',
      );
    }

    return s;
  }

  static const _titles = [
    'Verify the physical cheque',
    'Record the bank deposit',
    'Cross-check',
    'Review and record',
  ];
  static const _hints = [
    'Have the cheque in your hand before you start.',
    'Enter exactly what the bank gave you.',
    'One last check that this is the right cheque.',
    'Confirm the details, then record the deposit.',
  ];

  void _next() {
    setState(() => _attempted[_index] = true);
    final problems = _problems();
    if (problems[_index].isNotEmpty) return;
    if (_index == 3) return _submit();
    setState(() => _index++);
  }

  void _submit() {
    Store.instance.recordDeposit(_cheque, _slipNo.trim());
    Navigator.of(context)
      ..pop()
      ..pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Cheque ${_cheque.chequeNo} recorded as deposited'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;
    final cheque = _cheque;
    final unit = store.unitForCheque(cheque);
    final problems = _problems();
    final current = problems[_index];
    final clean = current.isEmpty;
    final attempted = _attempted[_index] ?? false;

    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        backgroundColor: c.surface,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Bank a cheque',
              style: TextStyle(
                color: c.fg,
                fontSize: 15.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              'Step ${_index + 1} of 4',
              style: TextStyle(
                color: c.muted,
                fontSize: 11.5,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Cancel', style: TextStyle(color: c.muted)),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: Row(
            children: [
              for (var i = 0; i < 4; i++)
                Expanded(
                  child: Container(
                    height: 3,
                    margin: EdgeInsets.only(right: i == 3 ? 0 : 2),
                    color: problems[i].isEmpty
                        ? c.brand500
                        : i == _index
                        ? c.brand200
                        : c.subtleHover,
                  ),
                ),
            ],
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Text(
            _titles[_index],
            style: TextStyle(
              color: c.fg,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 3),
          Text(_hints[_index], style: TextStyle(color: c.muted, fontSize: 13)),
          const SizedBox(height: 16),

          // context strip so the employee always knows which cheque this is
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: c.subtle,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Row(
              children: [
                Icon(Icons.receipt_long_outlined, size: 17, color: c.muted),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    'Cheque ${cheque.chequeNo} · ${cheque.bank} · unit ${unit.unitNo}',
                    style: TextStyle(color: c.fgSoft, fontSize: 12.5),
                  ),
                ),
                Text(
                  aed(cheque.amount),
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          ..._stepBody(context),

          const SizedBox(height: 18),
          _RequirementPanel(problems: current, attempted: attempted),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: c.surface,
          border: Border(top: BorderSide(color: c.line)),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              if (_index > 0) ...[
                SizedBox(
                  height: 48,
                  child: OutlinedButton(
                    onPressed: () => setState(() => _index--),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: c.line),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text('Back', style: TextStyle(color: c.fg)),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: PrimaryButton(
                  label: _index == 3 ? 'Record deposit' : 'Continue',
                  icon: _index == 3 ? Icons.check : Icons.arrow_forward,
                  onPressed: (clean || !attempted) ? _next : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _stepBody(BuildContext context) {
    final c = context.c;
    final cheque = _cheque;

    switch (_index) {
      case 0:
        return [
          _CheckRow(
            checked: _retrieved,
            title: 'Cheque retrieved from the safe',
            detail: 'You are holding the original paper cheque.',
            onChanged: (v) => setState(() => _retrieved = v),
          ),
          const SizedBox(height: 8),
          _CheckRow(
            checked: _detailsMatch,
            title: 'Number, bank and amount match',
            detail:
                '${cheque.chequeNo} · ${cheque.bank} · ${aed(cheque.amount)}',
            onChanged: (v) => setState(() => _detailsMatch = v),
          ),
          const SizedBox(height: 8),
          _CheckRow(
            checked: _dateMatch,
            title: 'Written date matches the due date',
            detail: fmtDate(cheque.dueDate),
            onChanged: (v) => setState(() => _dateMatch = v),
          ),
        ];

      case 1:
        return [
          _Label('Company account'),
          for (final a in _companyAccounts)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: _RadioRow(
                label: a,
                selected: _account == a,
                onTap: () => setState(() => _account = a),
              ),
            ),
          const SizedBox(height: 14),
          _Label('How was it deposited?'),
          for (final m in _methods)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: _RadioRow(
                label: m,
                selected: _method == m,
                onTap: () => setState(() => _method = m),
              ),
            ),
          const SizedBox(height: 14),
          _Label('Deposit slip / reference number'),
          TextField(
            onChanged: (v) => setState(() => _slipNo = v),
            style: TextStyle(color: c.fg, fontSize: 14),
            decoration: _inputDecoration(context, 'e.g. DEP-884213'),
          ),
          const SizedBox(height: 14),
          _Label('Deposit date'),
          InkWell(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _depositDate,
                firstDate: DateTime.now().subtract(const Duration(days: 60)),
                lastDate: DateTime.now().add(const Duration(days: 7)),
              );
              if (picked != null) setState(() => _depositDate = picked);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: c.line),
              ),
              child: Row(
                children: [
                  Icon(Icons.calendar_today_outlined, size: 16, color: c.muted),
                  const SizedBox(width: 10),
                  Text(
                    fmtDate(_depositDate),
                    style: TextStyle(color: c.fg, fontSize: 14),
                  ),
                  const Spacer(),
                  Text(
                    _daysBackdated == 0
                        ? 'today'
                        : relativeDays(-_daysBackdated),
                    style: TextStyle(
                      color: _daysBackdated > 14 ? c.red700 : c.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ];

      case 2:
        return [
          Text(
            'Type the cheque number to confirm you are recording the right one. '
            'This is the cheapest guard against acting on the wrong record.',
            style: TextStyle(color: c.fgSoft, fontSize: 13.5, height: 1.5),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: c.subtle,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  cheque.chequeNo,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 3,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            onChanged: (v) => setState(() => _typedNo = v),
            keyboardType: TextInputType.number,
            style: TextStyle(
              color: c.fg,
              fontSize: 17,
              letterSpacing: 2,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
            textAlign: TextAlign.center,
            decoration: _inputDecoration(context, 'Type it here'),
          ),
        ];

      default:
        return [
          AppCard(
            child: Column(
              children: [
                KeyValueRow('Cheque', cheque.chequeNo, strong: true),
                Divider(height: 1, color: c.lineSoft),
                KeyValueRow('Amount', aed(cheque.amount), strong: true),
                Divider(height: 1, color: c.lineSoft),
                KeyValueRow('Into account', _account ?? '—'),
                Divider(height: 1, color: c.lineSoft),
                KeyValueRow('Method', _method ?? '—'),
                Divider(height: 1, color: c.lineSoft),
                KeyValueRow('Slip number', _slipNo),
                Divider(height: 1, color: c.lineSoft),
                KeyValueRow('Deposit date', fmtDate(_depositDate)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: c.brand50,
              borderRadius: BorderRadius.circular(11),
              border: Border.all(color: c.brand200),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.shield_outlined, size: 17, color: c.brand600),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    'Recording this marks the cheque deposited, closes the related task, '
                    'and writes a permanent audit entry against your name.',
                    style: TextStyle(
                      color: c.brand700,
                      fontSize: 12.5,
                      height: 1.45,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ];
    }
  }
}

InputDecoration _inputDecoration(BuildContext context, String hint) {
  final c = context.c;
  return InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: c.faint, fontSize: 14, letterSpacing: 0),
    filled: true,
    fillColor: c.surface,
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(11),
      borderSide: BorderSide(color: c.line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(11),
      borderSide: BorderSide(color: c.brand500, width: 2),
    ),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(11)),
  );
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 7),
    child: Text(
      text,
      style: TextStyle(
        color: context.c.fg,
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

class _CheckRow extends StatelessWidget {
  const _CheckRow({
    required this.checked,
    required this.title,
    required this.detail,
    required this.onChanged,
  });
  final bool checked;
  final String title, detail;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: checked ? c.brand50 : c.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => onChanged(!checked),
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: checked ? c.brand400 : c.line),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: checked ? c.brandSolid : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: checked ? c.brandSolid : c.lineStrong,
                    width: 1.5,
                  ),
                ),
                child: checked
                    ? const Icon(Icons.check, size: 15, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: c.fg,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      detail,
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RadioRow extends StatelessWidget {
  const _RadioRow({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: selected ? c.brand50 : c.surface,
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: selected ? c.brand400 : c.line),
          ),
          child: Row(
            children: [
              Icon(
                selected
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 19,
                color: selected ? c.brand600 : c.lineStrong,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 13.5,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Mirrors the web wizard's live requirement panel: amber while informational,
/// red once the employee has tried to continue.
class _RequirementPanel extends StatelessWidget {
  const _RequirementPanel({required this.problems, required this.attempted});
  final List<String> problems;
  final bool attempted;

  @override
  Widget build(BuildContext context) {
    final c = context.c;

    if (problems.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: c.brand50,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Row(
          children: [
            Icon(Icons.check_circle_outline, size: 17, color: c.brand600),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                'This step is complete. You can continue.',
                style: TextStyle(
                  color: c.brand700,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final bg = attempted ? c.red50 : c.amber50;
    final border = attempted ? c.red200 : c.amber200;
    final head = attempted ? c.red800 : c.amber800;
    final body = attempted ? c.red700 : c.amber700;

    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info_outline, size: 16, color: head),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  attempted
                      ? 'You cannot continue until these are fixed'
                      : '${problems.length} item${problems.length > 1 ? 's' : ''} still required',
                  style: TextStyle(
                    color: head,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          for (final p in problems)
            Padding(
              padding: const EdgeInsets.only(left: 24, bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• ', style: TextStyle(color: body, fontSize: 12.5)),
                  Expanded(
                    child: Text(
                      p,
                      style: TextStyle(
                        color: body,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
