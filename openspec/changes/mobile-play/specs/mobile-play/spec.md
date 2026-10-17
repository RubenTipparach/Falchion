## ADDED Requirements

### Requirement: The map responds to touch like a maps app
On a touch screen the map SHALL pan with one finger, zoom with a two-finger pinch about the
fingers, turn with a two-finger twist and tilt when two fingers slide up or down together. A long
press SHALL act as a right-click, so it gives the selected fleet a move order.

#### Scenario: Pinch to zoom
- **WHEN** the player spreads two fingers apart on the map
- **THEN** the view zooms in, keeping the ground under the fingers under them

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
