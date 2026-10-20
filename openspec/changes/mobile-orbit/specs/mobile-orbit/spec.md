## ADDED Requirements

### Requirement: An orbit joystick on touch screens
On a touch-first device the game SHALL show a small joystick. Pushing it SHALL turn the current view's heading and tilt round the point the view centres on: the map, a star system, a planet's close-up or the battle view. It SHALL turn faster the further it is pushed, and SHALL do nothing near its centre. It SHALL NOT pan or zoom the view, and SHALL NOT be shown where the primary pointer is a mouse.

#### Scenario: Orbiting the home system
- **WHEN** the player holds the joystick pushed to the right on the map
- **THEN** the view's heading turns steadily round the point at the centre of the view, which stays where it is

#### Scenario: Out of the bottom sheet's way
- **WHEN** a star or planet card opens as a bottom sheet on a phone
- **THEN** the joystick moves up to sit just above it, and drops back to the corner when the card closes
