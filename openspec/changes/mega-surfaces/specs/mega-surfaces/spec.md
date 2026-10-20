## ADDED Requirements

### Requirement: Megastructures can be landed on
The ringworld, the Dyson sphere, the Alderson disk, the Dyson swarm and the topopolis SHALL each be zoomed into from the system view without a break. For the ring, the sphere and the disc the zoom SHALL be one camera in one world: the system view's camera, carried into the structure's own frame at true scale, SHALL become the close-up's camera and come down over the very land the system view drew, with no crossfade between two views. The two habitats (swarm and topopolis), a few km across, SHALL dissolve from the system view into their insides. No black screen SHALL come between. Land and Escape SHALL glide the zoom down or up the same way.

#### Scenario: Landing on a ringworld
- **WHEN** the player zooms in on a ringworld from its system
- **THEN** the camera flies on toward the ring, the band of land on its inner face grows to fill the view, and the same continents come down beneath it to the ground, with the Arch rising overhead

#### Scenario: Leaving
- **WHEN** the player zooms out from the ground, or presses Escape
- **THEN** the camera climbs back out the same way, and the ring is in the system view, framed on the structure

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

### Requirement: The close-up looks right over its whole height
The ring, sphere and disc close-ups SHALL reach 3,000 km up, where they hand over to the system view. Coasts SHALL be worked per pixel near the shore, so they are curves that stay put as the view moves, not the mesh's polygons. The land SHALL be one land at every distance: the ground, its far view and the system view's drawing of the ringworld's inner face, the Dyson sphere's inside and the Alderson disk SHALL all draw it from the same noise (broad scales of oceans and super-continents, then continents and coasts), each scale fading in as it grows to a few pixels, and a pixel wider than a coast drawn as the share of land and sea under it. Night SHALL be a dusk in which the land can be made out, never black.

#### Scenario: Zooming out from a ringworld city
- **WHEN** the player zooms out from a city on a ringworld
- **THEN** the coasts stay where they are and smooth all the way up, the continents they belong to come into view, and the ring in the system view shows those same continents
