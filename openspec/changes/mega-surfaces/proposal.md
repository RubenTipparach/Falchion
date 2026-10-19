## Why
The owner: "I also want to be able to land on ring worlds and see surface details and cities there too", "same with alderson disc and dyson spheres or swarms", "dyson sphere on the inside should have livable land", and later "topopolis needs details for sure, anything inhabitable needs details" "and we can land on".

## What Changes
- **Land on a megastructure.** The megastructure's card gets a Land button (as a planet's has). The view fades from the system view to the structure's ground, then glides down; zooming out past the top, or Escape, fades back to the system view.
- **Each structure is its own place:**
  - **Ringworld:** a continent on the ring's inner face. The land rises into the Arch overhead and runs to rim walls. The star stays at the zenith, and shadow squares bring the night in bands that sweep along the Arch.
  - **Dyson Sphere:** livable land on the inside of the shell, curving up into a dome. The star hangs overhead in an endless noon.
  - **Alderson Disk:** a flat land running to the horizon. The star sits low in the hole at the disc's centre, rising and setting as it bobs.
  - **Dyson Swarm:** one of its habitats, a spinning cylinder. Three land strips and three windows wrap round overhead, with the star and the other collectors outside.
  - **Topopolis:** a habitat tube wound round its star, endless along its length. The same land strips and windows, the land repeating down the tube into its own haze, and the tube's other loops crossing the sky beyond the windows as lit bands. The six structures nobody lives on (stellar engine, Matrioshka brain, star lifter, Nicoll-Dyson beam, Penrose sphere, neutron forge) are not landable.
- **Ground detail and cities.** Terrain with seas, plains, forests and mountains, streets and districts drawn in the ground, towers with lit windows, and trees, all from the structure's seed.
- **The close-up is its own layer** (`MegaSurfaceLayer`). The planet close-up is not touched.

## Impact
New `src/render/megastructures/surface/`, `src/core/mega/` (the ground's height, shared by GPU and CPU). `GameController.land`/`leaveSurface`, `StarInfoPanel`'s Land button, `main.ts` wiring and the HUD's altitude readout.
