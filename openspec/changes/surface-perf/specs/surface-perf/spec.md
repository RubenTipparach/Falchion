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
Shortly after the game starts it SHALL compile every shader a close-up can use (one terrain per mix of shader switches the planet types use, the cities, roads, traffic and props, and the props' placement pass) and the system view's planet spheres, and SHALL show a progress bar while it does. Without parallel compile it SHALL finish one program at a time, so no single stall is long. While a close-up builds, a small bar SHALL say so.

#### Scenario: First zoom onto a planet after start-up
- **WHEN** the player zooms onto a colony once the bar has finished
- **THEN** no close-up shader is compiled during the landing
