# Spec Delta

## Purpose

Lets players move between seeing a single light year and the whole 70,000 ly galaxy, showing the right level of detail at each scale.

## ADDED Requirements

### Requirement: Exponential zoom
Scroll zoom SHALL scale camera altitude exponentially so each scroll step changes the visible area by a constant factor, covering from a few hexes to the full galaxy.

#### Scenario: Constant zoom factor
- **WHEN** the player scrolls one step in at two different altitudes
- **THEN** the altitude is multiplied by the same factor in both cases

#### Scenario: Zoom limits
- **WHEN** the player scrolls beyond the closest or farthest zoom
- **THEN** the altitude is clamped to the allowed range

### Requirement: Hex grid level of detail
The hex grid SHALL be drawn only when zoomed in enough that individual hexes are distinguishable, and SHALL fade out as the player zooms out.

#### Scenario: Zoomed out
- **WHEN** the visible width exceeds the hex-grid threshold
- **THEN** no hex grid lines are drawn

#### Scenario: Zoomed in
- **WHEN** the visible width is below the hex-grid threshold
- **THEN** hex outlines are drawn around the camera focus

### Requirement: Quadrant and radial cell overlay
When zoomed out past the hex threshold, the map SHALL show quadrant boundaries, radial rings and radial cells with labels so players can read galactic addresses.

#### Scenario: Galaxy view overlay
- **WHEN** the player is in galaxy view
- **THEN** quadrant lines, ring circles and cell divisions are visible with quadrant labels

### Requirement: View toggle
A single control (button and keyboard shortcut) SHALL switch between hex view and galaxy view by animating the zoom, keeping the current focus point.

#### Scenario: Toggle out
- **WHEN** the player presses the toggle while in hex view
- **THEN** the camera animates to galaxy altitude and the overlay appears

#### Scenario: Toggle in
- **WHEN** the player presses the toggle while in galaxy view
- **THEN** the camera animates back to hex altitude over the focus point

### Requirement: Star selection
Clicking a star in hex view SHALL select it and show its name, galactic address, hex coordinate, distance from the player's home and travel time.

#### Scenario: Select a star
- **WHEN** the player clicks a hex containing a star
- **THEN** an info panel shows that system's details
