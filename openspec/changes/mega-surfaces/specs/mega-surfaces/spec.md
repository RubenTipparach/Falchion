## ADDED Requirements

### Requirement: Megastructures can be landed on
The ringworld, the Dyson sphere, the Alderson disk, the Dyson swarm and the topopolis SHALL each be zoomed into from the system view without a break, and no black screen SHALL come between. The two habitats (swarm and topopolis), a few km across, SHALL dissolve from the system view into their insides. Land and Escape SHALL glide the zoom down or up the same way.

#### Scenario: Landing on a habitat
- **WHEN** the player zooms in on a Dyson swarm habitat from its system
- **THEN** the system view dissolves into the habitat's inside, with no black screen

### Requirement: One camera from the system view to the ground
For the ring, the sphere and the disc the zoom SHALL be one camera in one world: the system view's camera, carried into the structure's own frame at true scale, SHALL become the close-up's camera and come down over the very land the system view drew, with no crossfade between two views.

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
The ring, sphere and disc close-ups SHALL reach 3,000 km up, where they hand over to the system view. Coasts SHALL be worked per pixel near the shore, so they are curves that stay put as the view moves, not the mesh's polygons. Night SHALL be a dusk in which the land can be made out, never black.

#### Scenario: Night on a ring
- **WHEN** a shadow square passes over the camera on a ringworld
- **THEN** the land can still be made out in a blue dusk, with city lights

### Requirement: One land at every distance
The ground, its far view and the system view's drawing of the ringworld's inner face, the Dyson sphere's inside and the Alderson disk SHALL all draw the land from the same noise: broad scales of oceans and super-continents, then continents and coasts. Each scale SHALL fade in as it grows to a few pixels, and a pixel wider than a coast SHALL be drawn as the share of land and sea under it.

#### Scenario: Zooming out from a ringworld city
- **WHEN** the player zooms out from a city on a ringworld
- **THEN** the coasts stay where they are and smooth all the way up, the continents they belong to come into view, and the ring in the system view shows those same continents

### Requirement: The land has climates and relief
The ring, sphere and disc SHALL have climates at scales larger than a continent: desert belts, steppe, grassland, forest, rainforest, tundra, taiga, ice sheets and sea ice, with trees only where the climate grows them. Their land SHALL have broad scales up to the structure's own size, and rugged country SHALL have ridged hills tens of km across, so the ground close up has slopes a low sun picks out.

#### Scenario: Looking across an Alderson disk
- **WHEN** the player looks over the disk from the system view, then comes down to its ground
- **THEN** deserts, forests, ice and seas tell its regions apart from far off, and near the ground hills and valleys stand out in the low sun

### Requirement: The land is seamless on its shape
The land's noise SHALL be read at the land's 3D point on its shape, so a sphere's land has no pinch at its far pole and a ring's meets itself.

#### Scenario: The far side of a Dyson sphere
- **WHEN** the player looks across a Dyson sphere's inside at the point opposite its landing site
- **THEN** the land there is like the land anywhere else, with no lines converging on a point

### Requirement: A Dyson sphere's plates are the same up close
The close-up SHALL draw the Dyson sphere's shell from outside with the system view's own plates: the same lattice, starlight through the seams, and the same few plates missing, through which the land on the far inside (and the star) shows. From inside, a missing plate SHALL be a hole to space.

#### Scenario: Flying in to a Dyson sphere
- **WHEN** the player zooms from the system view toward a Dyson sphere
- **THEN** its hull fills the view as a lattice of dark plates with glowing seams and a few gaps, matching the system view's

### Requirement: The star is drawn wherever it is in front
The close-up sky SHALL draw the star, with a corona sized to the star, wherever nothing nearer stands in front of it: in an empty sky, and over land beyond it (the disc's far side through its hole, the ring's arch, the shell's far side).

#### Scenario: Looking into an Alderson disk's hole
- **WHEN** the player, flying in, looks toward the hole at the disk's centre
- **THEN** the star blazes in the hole as it does in the system view

### Requirement: A clock says when day comes
On a megastructure's ground with days and nights, the HUD SHALL say whether it is day or night where the camera stands and how long until that turns. Right-drag SHALL circle the ground at the middle of the screen; looking out past the ground the camera can circle, it SHALL turn where it stands.

#### Scenario: Waiting for day in a habitat
- **WHEN** the player is on a swarm habitat's land at night
- **THEN** the HUD reads "Night here · daylight in" and the minutes and seconds until the mirrors open
