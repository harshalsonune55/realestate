import 'package:flutter/material.dart';

/// Photography for the portfolio.
///
/// The seed data is invented, so there is nothing to photograph — these are
/// real Unsplash images standing in for the buildings and their interiors.
/// Which image a building or unit gets is derived from its id, never drawn at
/// random: a card must show the same photo every time it is rebuilt, or
/// scrolling the list would reshuffle the portfolio in front of the reader.
///
/// A photo is decoration on top of the gradient, not a replacement for it.
/// [PropertyPhoto] paints the gradient first and leaves it showing while the
/// image loads, and keeps it if the image never arrives — offline, the cards
/// look exactly as they did before.
class Photos {
  const Photos._();

  /// Exteriors — used on the building cards.
  static const _buildings = [
    'photo-1545324418-cc1a3fa10c00',
    'photo-1493809842364-78817add7ffb',
    'photo-1512917774080-9991f1c4c750',
    'photo-1560518883-ce09059eeffa',
    'photo-1567496898669-ee935f5f647a',
    'photo-1613490493576-7fde63acd811',
    'photo-1600596542815-ffad4c1539a9',
    'photo-1580587771525-78b9dba3b914',
  ];

  /// Interiors — used on the unit cards, because a unit is a room, not a tower.
  static const _interiors = [
    'photo-1502672260266-1c1ef2d93688',
    'photo-1522708323590-d24dbb6b0267',
    'photo-1560448204-e02f11c3d0e2',
    'photo-1484154218962-a197022b5858',
    'photo-1586023492125-27b2c045efd7',
    'photo-1556912173-3bb406ef7e77',
    'photo-1571508601891-ca5e7a713859',
    'photo-1616486338812-3dadae4b4ace',
    'photo-1600607687939-ce8a6c25118c',
    'photo-1600566753086-00f18fb6b3ea',
    'photo-1583847268964-b28dc8f51f92',
    'photo-1519643381401-22c77e60520e',
  ];

  static String _url(String id, int width) =>
      'https://images.unsplash.com/$id?w=$width&q=80&auto=format&fit=crop';

  /// A stable index for [seed] — the same string always picks the same photo.
  static int _slot(String seed, int length) {
    var h = 0;
    for (final unit in seed.codeUnits) {
      h = (h * 31 + unit) & 0x7fffffff;
    }
    return h % length;
  }

  static String building(String propertyId, {int width = 800}) =>
      _url(_buildings[_slot(propertyId, _buildings.length)], width);

  static String interior(String unitId, {int width = 800}) =>
      _url(_interiors[_slot(unitId, _interiors.length)], width);
}

/// The photo header both the building and unit cards use.
///
/// The gradient is the floor of this widget: it is painted underneath always,
/// so a slow network fades a photo in over it and a dead network simply leaves
/// it in place. Nothing here ever shows a broken-image glyph or a grey box.
class PropertyPhoto extends StatelessWidget {
  const PropertyPhoto({
    super.key,
    required this.url,
    required this.gradient,
    this.height = 180,
    this.radius = 22,
    this.overlay,
  });

  final String url;
  final List<Color> gradient;
  final double height;
  final double radius;

  /// Drawn on top of the photo — status pills, occupancy, and the like.
  final Widget? overlay;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: gradient,
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Center(
                child: Icon(
                  Icons.apartment_rounded,
                  size: 56,
                  color: Colors.white.withValues(alpha: 0.28),
                ),
              ),
            ),
            Image.network(
              url,
              fit: BoxFit.cover,
              // Fading in stops the photo from snapping over the gradient the
              // moment the last byte lands.
              frameBuilder: (context, child, frame, wasSynchronous) {
                if (wasSynchronous) return child;
                return AnimatedOpacity(
                  opacity: frame == null ? 0 : 1,
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOut,
                  child: child,
                );
              },
              // Offline, or the URL moved: the gradient underneath is the card.
              errorBuilder: (context, error, stack) => const SizedBox.shrink(),
            ),
            // A soft floor under the photo so white overlay text stays legible
            // whichever image landed.
            if (overlay != null)
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.38),
                    ],
                    stops: const [0.5, 1],
                  ),
                ),
              ),
            ?overlay,
          ],
        ),
      ),
    );
  }
}
