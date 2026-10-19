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
