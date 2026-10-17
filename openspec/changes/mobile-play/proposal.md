## Why
Players open Falchion from Discord on their phones. On a phone the game was hard to use:
- the top bar took three rows and hid every resource;
- the star, planet and fleet cards ran off the top of the screen;
- the map had no pinch zoom, no twist or tilt, and no way to give a move order (right-click only);
- hints talked about hovering and right-clicking.

## What Changes
- Touch controls on the map, like a maps app:
  - one finger pans;
  - two fingers pinch to zoom, twist to turn and slide up or down together to tilt;
  - a long press is the right-click (a move order for the selected fleet);
  - a tap selects; a double tap dives in.
- Phone layout (720px wide and below):
  - one slim top bar with the empire, every resource in a strip you can swipe, and the year;
  - the tabs as a bottom bar, within thumb reach;
  - drawers fill the space between the two bars;
  - the star, planet and fleet cards become a scrollable bottom sheet;
  - news shows briefly as a toast.
- The page cannot be zoomed or bounced by the browser, respects the notch (safe areas) and can run
  full screen from the home screen.
- Touch screens get touch hints (press and hold, twist, slide) instead of mouse ones.

## Impact
- `src/render/map/MapCameraController.ts`: multi-touch gestures and the long press.
- `src/render/map/ZoomModel.ts`: `setAltitude` for pinch zoom.
- `src/ui/styles.css`, `src/ui/Dispatches.ts`, `src/ui/StarInfoPanel.ts`, `src/ui/dom.ts`, `index.html`.
