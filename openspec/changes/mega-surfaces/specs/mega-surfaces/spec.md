## ADDED Requirements

### Requirement: Megastructures can be landed on
The ringworld, the Dyson sphere, the Alderson disk, the Dyson swarm and the topopolis SHALL each offer a Land action. Landing SHALL fade from the system view to the structure's ground and glide down. Zooming out past the top of the close-up, or Escape, SHALL fade back to the system view framed on the structure.

#### Scenario: Landing on a ringworld
- **WHEN** the player presses Land on a ringworld's card
- **THEN** the view fades to the ring's inner face and comes down over its land, with the Arch rising overhead

#### Scenario: Leaving
- **WHEN** the player zooms out past the close-up's top, or presses Escape
- **THEN** the view fades back to the system view, framed on the structure

### Requirement: Each structure's ground is its own shape
The ground SHALL follow the structure's shape:
- **ringworld:** the inner face of a ring, rising along its spin into an arch, bounded by rim walls;
- **Dyson sphere:** the inside of a shell, curving up all round;
- **Alderson disk:** flat;
- **Dyson swarm:** the inside of a spinning cylinder habitat, land strips between windows;
- **topopolis:** the inside of an endless spinning tube, land strips between windows running on along it.

#### Scenario: Looking along a ringworld
- **WHEN** the camera on a ringworld's land looks along the spin
- **THEN** the land rises into an arch across the sky

### Requirement: The star is where the structure puts it
The star SHALL be where the shape puts it:
- **ringworld and Dyson sphere:** overhead;
- **Alderson disk:** low on the horizon, rising and setting;
- **swarm habitat and topopolis:** outside its windows, turning past them as the habitat spins.

#### Scenario: Looking across a topopolis
- **WHEN** the camera on a topopolis's land looks up through a window
- **THEN** the opposite land strip is overhead and the tube's other loops cross the sky as lit bands

#### Scenario: Looking up from a Dyson sphere's land
- **WHEN** the camera on a Dyson sphere's inner land tilts up
- **THEN** the land curves away and up into the haze, and the star blazes overhead

### Requirement: Megastructure ground has detail and cities
The land SHALL have seas, plains, forests and mountains, from the structure's seed, and the same for every player. It SHALL also have cities: streets in the ground, and towers with windows that light at night. Trees SHALL stand near the camera on the land, never in the sea or a city. Ground detail SHALL not shimmer with distance. No shader loop SHALL take screen-space derivatives.

#### Scenario: Coming down over a ringworld city
- **WHEN** the camera descends over a city on the ring
- **THEN** streets show in the ground and towers rise from them, windows lit at night under a shadow square
