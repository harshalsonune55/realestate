import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../data/rbac.dart';
import '../data/store.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'access_log_screen.dart';

/// The signed-in employee's own page: who they are, their picture, and their
/// recent access history.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    final store = Store.instance;
    final user = store.currentUser!;
    setState(() => _busy = true);
    try {
      // Capped on the way in: a modern camera produces multi-megabyte JPEGs and
      // the whole point of storing base64 in prefs is that the blob stays small.
      final file = await ImagePicker().pickImage(
        source: source,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 80,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      await store.setAvatar(user.id, base64Encode(bytes));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load that image: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _choose() {
    final store = Store.instance;
    final user = store.currentUser!;
    final hasPicture = store.avatarFor(user.id) != null;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(sheet);
                _pick(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(sheet);
                _pick(ImageSource.gallery);
              },
            ),
            if (hasPicture)
              ListTile(
                leading: Icon(
                  Icons.delete_outline,
                  color: context.c.red600,
                ),
                title: Text(
                  'Remove picture',
                  style: TextStyle(color: context.c.red600),
                ),
                onTap: () {
                  Navigator.pop(sheet);
                  Store.instance.clearAvatar(user.id);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = Store.instance;

    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final user = store.currentUser!;
        final previous = store.previousSignIn(user.id);
        final mine = store.sessionsFor(user.id).take(8).toList();

        return Scaffold(
          backgroundColor: c.canvas,
          appBar: AppBar(title: const Text('Profile'), backgroundColor: c.surface),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              AppCard(
                child: Column(
                  children: [
                    Stack(
                      children: [
                        Avatar(
                          initials: user.initials,
                          base64Image: store.avatarFor(user.id),
                          size: 86,
                          onTap: _busy ? null : _choose,
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: GestureDetector(
                            onTap: _busy ? null : _choose,
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: c.brandSolid,
                                shape: BoxShape.circle,
                                border: Border.all(color: c.surface, width: 2),
                              ),
                              child: _busy
                                  ? const Padding(
                                      padding: EdgeInsets.all(6),
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Icon(
                                      Icons.photo_camera,
                                      size: 14,
                                      color: Colors.white,
                                    ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      user.name,
                      style: TextStyle(
                        color: c.fg,
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      user.title,
                      style: TextStyle(color: c.muted, fontSize: 13),
                    ),
                    const SizedBox(height: 9),
                    StatusBadge(roleLabel[user.role]!, tone: Tone.good),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: _busy ? null : _choose,
                      child: Text(
                        store.avatarFor(user.id) == null
                            ? 'Add a profile picture'
                            : 'Change picture',
                        style: TextStyle(
                          color: c.brand600,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              SectionHeader(title: 'Account'),
              AppCard(
                child: Column(
                  children: [
                    KeyValueRow('Email', user.email),
                    if (user.phone.isNotEmpty)
                      KeyValueRow('Phone', user.phone),
                    KeyValueRow('Role', roleLabel[user.role]!),
                    KeyValueRow(
                      'Last sign-in',
                      previous == null
                          ? 'This is your first sign-in'
                          : _stamp(previous.at),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              SectionHeader(
                title: 'Your recent access',
                sub: 'Sign-ins and sign-outs recorded on this device.',
                trailing: can(user.role, Perm.adminUsers)
                    ? TextButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const AccessLogScreen(),
                          ),
                        ),
                        child: Text(
                          'All staff',
                          style: TextStyle(
                            color: c.brand600,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      )
                    : null,
              ),
              if (mine.isEmpty)
                const EmptyState(
                  title: 'No access recorded yet',
                  icon: Icons.history,
                )
              else
                AppCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < mine.length; i++)
                        SessionRow(event: mine[i], last: i == mine.length - 1),
                    ],
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

String _stamp(DateTime d) {
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${fmtDate(d)} at $h:$m';
}

/// One line in an access log. Shared by the profile page and the
/// administrator's all-staff view.
class SessionRow extends StatelessWidget {
  const SessionRow({
    super.key,
    required this.event,
    required this.last,
    this.showName = false,
  });

  final SessionEvent event;
  final bool last, showName;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final isIn = event.kind == SessionKind.signIn;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: c.lineSoft)),
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: isIn ? c.brand50 : c.subtle,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(
              isIn ? Icons.login : Icons.logout,
              size: 15,
              color: isIn ? c.brand600 : c.muted,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  showName
                      ? event.userName
                      : sessionKindLabel[event.kind]!,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  showName
                      ? '${sessionKindLabel[event.kind]} · '
                            '${roleLabel[event.role]}'
                      : _stamp(event.at),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: c.faint, fontSize: 11),
                ),
              ],
            ),
          ),
          if (showName)
            Text(
              _stamp(event.at),
              style: TextStyle(color: c.faint, fontSize: 11),
            ),
        ],
      ),
    );
  }
}
