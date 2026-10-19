## Why
The owner: "I would like some kind of small joystick I can use on my phone to orbit around stuff". On a touch screen, one finger pans and two fingers only zoom. Gestures were kept from turning or tilting the view because that got in the way, so a phone had no way to orbit at all.

## What Changes
- **A small on-screen joystick (OrbitStick)** shows on touch-first devices, bottom right. Hold it and push:
  - left and right turn the heading round whatever the view centres on;
  - up and down tilt the view.
- **It works in every view.** The joystick drives each view's own turn, as a right-drag does on a desktop:
  - the galaxy map and star systems (`MapCameraController.orbit`);
  - a planet's close-up (its rig's turn);
  - the battle view (its camera).
- **Response:** a small dead zone, gentle near the centre, quick at the rim (deflection squared). The knob springs back when let go.
- **Placement:**
  - it stays above the phone's bottom sheet as the sheet opens, grows and closes;
  - it sits mid-right during a battle, clear of the battle dock;
  - it sits under drawers.

## Impact
`src/ui/OrbitStick.ts` (new), `MapCameraController.orbit`, wiring in `src/app/main.ts`, styles. Desktop is unchanged: the joystick shows only where the primary pointer is coarse.
