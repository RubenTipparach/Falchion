import * as THREE from 'three';
import { frameAt } from '../../core/surface/Terrain';
import { planetLayout } from './planetLayouts';
import { FULL_QUALITY, SurfaceTerrain } from './surface/SurfaceTerrain';
import { Settlements } from './surface/Settlements';
import { RoadMesh } from './surface/RoadMesh';
import { Flora } from './surface/Flora';

/**
 * City shots (tools/planets/city.html, `npm run planets:city`): a capital colony on a temperate
 * world and a city world, by day and by night, from an overview, street level and close to the
 * towers, so changes to cities (towers, streets, traffic, people, lamps) can be judged by eye
 * against the same frames. Fixed seeds and a fixed clock keep runs comparable.
 */
const W = 520, H = 340;

interface Shot { label: string; img: string }

export async function cityShots(root: HTMLElement): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x05070c, 1);
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.0001, 10);
  const shots: Shot[] = [];

  // A capital with every special building, on a temperate world.
  const colony = { owner: 'own' as const, name: 'Aurelia', capital: true, size: 4, pop: 9, buildings: ['shipyard', 'farm', 'mine', 'lab', 'trade-hub', 'manufactory', 'temple'] };
  for (const [biome, withColony] of [['terran', true], ['ecumenopolis', false]] as const) {
    const planet = { id: `shots:${biome}/3`, biome };
    const { look, layout } = planetLayout(planet, withColony ? colony : null);
    const terrain = new SurfaceTerrain(look, layout.settlements, FULL_QUALITY, null);
    while (!terrain.bakeStep()) await new Promise((r) => setTimeout(r, 30));
    const settlements = new Settlements(layout, terrain, false);
    const roads = new RoadMesh(layout.roads, terrain);
    const flora = new Flora(biome, terrain, false);
    const scene = new THREE.Scene();
    scene.add(terrain.group, settlements.group, flora.group);
    if (roads.mesh) scene.add(roads.mesh);
    const centre = new THREE.Vector3(...(layout.settlements[0]?.dir ?? layout.landing));
    const { t1, t2 } = frameAt([centre.x, centre.y, centre.z]);
    const T1 = new THREE.Vector3(...t1), T2 = new THREE.Vector3(...t2);
    const ground = (d: THREE.Vector3) => terrain.surfaceRadius(d.clone().normalize());
    for (const night of [false, true]) {
      // Day: the sun high over the city; night: under the far side.
      const sun = centre.clone().multiplyScalar(night ? -1 : 0.8).addScaledVector(T1, 0.5).normalize();
      // [label, distance from the ground point, tilt from straight down (rad), the ground point's offset along t2]
      const poses: Array<[string, number, number, number]> = [['overview', 0.09, 0.55, 0], ['street level', 0.014, 1.05, 0.006], ['close', 0.0035, 1.2, 0.012]];
      for (const [label, d, tilt, off] of poses) {
        const target = centre.clone().addScaledVector(T2, off).normalize();
        const focus = target.clone().multiplyScalar(ground(target));
        const back = target.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(T2, -Math.sin(tilt)).normalize();
        camera.position.copy(focus).addScaledVector(back, d);
        const minR = ground(camera.position) + 0.0004;
        if (camera.position.length() < minR) camera.position.setLength(minR);
        camera.up.copy(target);
        camera.lookAt(focus);
        const alt = camera.position.length() - ground(camera.position);
        camera.near = Math.max(0.00002, Math.min(alt * 0.2, 0.5));
        camera.far = Math.sqrt(Math.max(camera.position.lengthSq() - 1, 0)) + 1.3;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const time = 42.5;
        terrain.update({ cam: camera.position, focus, d, alt, sun, time, fade: 1 });
        const pxAtOne = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / H;
        settlements.setPointScale(1 / pxAtOne);
        settlements.update(time);
        roads.setPixelSize(pxAtOne);
        flora.update(d, renderer);
        renderer.render(scene, camera);
        shots.push({ label: `${biome} · ${night ? 'night' : 'day'} · ${label}`, img: renderer.domElement.toDataURL('image/jpeg', 0.85) });
      }
    }
    flora.dispose();
    settlements.dispose();
    terrain.dispose();
  }
  root.innerHTML = '';
  for (const s of shots) {
    const fig = document.createElement('figure');
    fig.innerHTML = `<img src="${s.img}" width="${W}" height="${H}" alt=""><figcaption>${s.label}</figcaption>`;
    root.append(fig);
  }
  (window as unknown as { CITY_READY: boolean }).CITY_READY = true;
}
