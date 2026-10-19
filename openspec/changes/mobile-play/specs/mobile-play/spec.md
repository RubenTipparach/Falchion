## ADDED Requirements

### Requirement: The map responds to touch like a maps app
On a touch screen the map SHALL pan with one finger and zoom with a two-finger pinch toward
where the pinch began, a pinch covering more zoom than the fingers spread so the whole range
(planet to galaxy) takes a few gestures. Two fingers SHALL only zoom: moving them together SHALL
NOT pan, on the map or in the battle view. Touch SHALL NOT turn or tilt the view. A long press SHALL act as a
right-click, so it gives the selected fleet a move order.

#### Scenario: Pinch to zoom
- **WHEN** the player spreads two fingers apart on the map
- **THEN** the view zooms in toward where the pinch began

#### Scenario: Two fingers do not pan
- **WHEN** the player moves two fingers together across the map or the battle view without spreading them
- **THEN** the view stays where it is

#### Scenario: Twisting does not turn the view
- **WHEN** the player twists two fingers on the map
- **THEN** the view's heading and tilt stay as they were

#### Scenario: Long press to move a fleet
- **WHEN** a fleet of the player's is selected and the player presses and holds a point on the map
- **THEN** the fleet sets course for that point, and lifting the finger does not count as a tap

#### Scenario: A pinch is not a tap
- **WHEN** the player lifts their fingers after a pinch
- **THEN** nothing is selected or deselected

### Requirement: The game fits a phone screen
On screens 720px wide or narrower the game SHALL use one slim top bar with every resource in a strip
the player can swipe, a bottom tab bar, and a scrollable bottom sheet for the star, planet and fleet
cards. Nothing SHALL be cut off above the top bar.

#### Scenario: Selecting a star on a phone
- **WHEN** the player taps a star on a phone
- **THEN** its card opens as a bottom sheet above the tab bar, with its header visible and its contents scrollable

### Requirement: The map stays smooth on phones
On touch screens only (desktop rendering is unchanged) the heavy nebula and galaxy-disc shaders
SHALL render at reduced resolution (a quarter per axis) with fewer noise octaves, be redrawn only
when the view moves or a few times a second for their slow drift, and be stretched over the
screen; the hex grid SHALL shade no pixels beyond where it fades out; and the map SHALL render at
no more than 1.5 device pixels per CSS pixel.

#### Scenario: Galaxy view on a phone
- **WHEN** the player zooms out to the nebula and galaxy views on a phone
- **THEN** the nebula and disc are drawn from a low-resolution buffer and look the same, soft clouds
