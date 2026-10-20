## ADDED Requirements

### Requirement: Flora is placed once per cell
The surface close-up SHALL evaluate the terrain height at most once per flora cell per frame, not once per vertex. Where float render targets are available, it SHALL do so in a placement pass whose results every vertex of the cell's prop reads.

#### Scenario: A bone world up close
- **WHEN** the camera is close to the ground of a bone world
- **THEN** the terrain is evaluated about 15,000 times a frame, against 23.6 million before

### Requirement: A kind draws only its own cells
Each flora kind SHALL draw only the cells where it can grow. A cell's kind and its growth roll SHALL be decided by a hash that the CPU and GPU compute identically.

#### Scenario: The hashes agree
- **WHEN** the bench compares the GPU's hash with the CPU's over a grid of cells, negative cells included
- **THEN** there are no mismatches

### Requirement: The globe bakes off the main thread
Where Web Workers exist, the close-up's globe SHALL bake its six faces in parallel in workers. No face SHALL be baked on the main thread. Without workers it SHALL bake one face a frame, as before.

#### Scenario: Zooming into a planet
- **WHEN** the close-up starts building a planet's globe
- **THEN** the main thread only merges the finished faces, and does not stall for the bake

### Requirement: Shaders compile ahead and loop cheaply on every driver
No shader loop SHALL take screen-space derivatives (`fwidth`, `dFdx`, `dFdy`), directly or through a helper. A loop that needs a pixel's size SHALL be given it from outside the loop. On Windows, Direct3D's compiler must unroll and flatten such a loop: every pixel then pays for every city, and the compile takes seconds. A planet's close-up SHALL start compiling its shaders in the background (`compileAsync`) as it is built, and SHALL NOT wait on that compile to be shown.

#### Scenario: Zooming into a colony on a Windows PC
- **WHEN** the close-up of a planet with many cities comes into view for the first time
- **THEN** the game keeps drawing while its shaders compile, and a pixel far from every city does not run the city code

### Requirement: Surface shaders are prepared up front, behind a progress bar
Shortly after the game starts it SHALL compile every shader a close-up can use (one terrain per mix of shader switches the planet types use, the cities, roads, traffic and props, and the props' placement pass) and the system view's planet spheres, and SHALL show a progress bar while it does. While a close-up builds, a small bar SHALL say so.

#### Scenario: First zoom onto a planet after start-up
- **WHEN** the player zooms onto a colony once the bar has finished
- **THEN** no close-up shader is compiled during the landing

### Requirement: The warm-up never floods the driver
The warm-up SHALL hand the driver at most two programs at a time (one without parallel compile), the next only once those have finished. It SHALL pause while the tab is hidden or the player is moving the view. Handing all of them over at once froze every Chrome tab on Windows.

#### Scenario: The warm-up does not freeze the browser
- **WHEN** the warm-up runs on Chrome on Windows
- **THEN** at most two of its programs are compiling at any moment, and other tabs stay responsive

### Requirement: A planet's close-up waits only for its own shaders
A planet's close-up SHALL open once its own shaders are ready (its terrain and what every close-up shares), not the whole warm-up. Pressing Land, or zooming all the way in, SHALL move them to the front of the warm-up, keep the view at planet view, and say so with that planet's own progress. A Land pressed early SHALL land by itself once they are ready.

#### Scenario: Landing during the warm-up
- **WHEN** the player presses Land on a colony while the warm-up is at 4 of 75
- **THEN** the bar reads "Preparing <planet> · 1/11 · landing when ready", and the view descends once those 11 are compiled, while the rest carry on

### Requirement: Zooming into a star system compiles nothing on the spot
The warm-up SHALL also prepare the system view (planets, rings, orbits, every kind of star, each megastructure, each belt, the nebula sky) with the map's own lights. A new system SHALL stay hidden until its shaders are ready, and the one it replaced SHALL be kept until then. No megastructure SHALL write a per-system number into its shader source.

#### Scenario: A system replaces another
- **WHEN** the view moves from one system to the next
- **THEN** the programs the two share are reused, not deleted and rebuilt

#### Scenario: Zooming from system to system
- **WHEN** the player zooms into five systems in turn after the warm-up
- **THEN** no shader is compiled and the game does not wait on the GPU process for any of them
