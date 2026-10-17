# Spec Delta

## Purpose

Defines the galactic nebula: one coloured cloud field drawn on the map at every zoom, and the
sky that surrounds the camera inside a star system.

## ADDED Requirements

### Requirement: One nebula at every zoom
The map nebula SHALL be a single field whose large-scale structure sets cloud shape, colour and density everywhere; finer detail SHALL only modulate density inside those clouds and SHALL grow as the view zooms in. Two independent cloud patterns SHALL NOT overlap or crossfade at any zoom.

#### Scenario: Zooming keeps the hue
- **WHEN** the same galaxy point is sampled with galaxy-scale detail and with hex-scale detail
- **THEN** both samples have the same hue (within a small tolerance)

### Requirement: CPU and GPU agree
The nebula field SHALL be computable on the CPU with the same colours the map shader draws, using an integer lattice hash so both sides agree on every lattice value.

#### Scenario: Lattice parity
- **WHEN** the CPU field hashes a lattice point
- **THEN** the value equals the top 24 bits of core `hash01` for that offset lattice point, which the shader mirrors

### Requirement: System skybox
In system view the camera SHALL be surrounded by a vertex-coloured skybox painted from the map's nebula field around the system's star (or around the camera focus in deep space), deterministic per galaxy seed and anchor. Directions near the galactic plane SHALL be brighter than directions toward the poles, and no direction SHALL be black. The skybox SHALL fade in with system view and out toward the hex map, and SHALL draw behind stars, planets, ships and labels without making them transparent.

#### Scenario: Colour of the region
- **WHEN** a system lies in a region the map draws teal (or reddish-brown)
- **THEN** its skybox's average colour has that hue

#### Scenario: Same star, same sky
- **WHEN** the sky for the same star is painted twice
- **THEN** both paintings are identical, and another star's sky differs
