## ADDED Requirements

### Requirement: Twenty-one planet types
The galaxy SHALL generate 21 planet types: the original nine (Barren shown as Cratered) and twelve new ones (shrouded, eyeball, dust, swamp, storm, choir, city, magma, acid, aurora, bone and dead machine worlds). City worlds SHALL NOT be generated naturally: they are the capitals of tier 4 and 5 civilisations.

#### Scenario: A red dwarf's ocean world
- **WHEN** an ocean world orbits close to an M dwarf
- **THEN** it may be an eyeball world: tidally locked, with a day-side ocean ringed by ice

### Requirement: Existing worlds keep their type
A planet's original type roll SHALL be unchanged. New types SHALL come only from a second, independent roll that refines an original type into a related one. A colonised planet SHALL keep the type it was settled as.

#### Scenario: Loading an old empire
- **WHEN** an empire settled before this change is loaded
- **THEN** every one of its colonies shows and yields as the type it was settled as

### Requirement: Realistic star classes
Main-sequence stars SHALL follow solar-neighbourhood proportions (most are M dwarfs). O and B stars SHALL be commoner in the spiral arms and giants in the bulge. Binary and triple systems SHALL occur at rates that rise with the primary's mass.

#### Scenario: Most stars are red dwarfs
- **WHEN** many systems are generated
- **THEN** about three quarters of the main-sequence stars are class M, and about half the Sun-like stars have a companion

### Requirement: Stellar remnants and the central black hole
The galaxy SHALL hold brown dwarfs, white dwarfs, giants, neutron stars, pulsars and stellar black holes, and a supermassive black hole at its centre. A system's planet count SHALL NOT change: neutron stars and black holes SHALL only replace systems without planets.

#### Scenario: The galactic centre
- **WHEN** a player reaches the centre of the galaxy
- **THEN** it finds a supermassive black hole with an accretion disc and jets

### Requirement: Choir worlds broadcast
A choir world SHALL show a fragment of the instruction its dormant machines broadcast, the same for every viewer, and SHALL say that it does not quite match the viewer's own.

#### Scenario: Viewing a choir world
- **WHEN** a player opens a choir world's card
- **THEN** it reads that world's broadcast fragment
