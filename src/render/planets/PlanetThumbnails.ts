import * as THREE from 'three';
import { PLANET_LOOKS } from '../../content/planetLooks';
import type { Planet } from '../../core/galaxy/Planets';
import { hashSeed, Rng } from '../../core/rng/Rng';
import { createPlanetMaterial, createRingMaterial } from './PlanetMaterial';
import { isMegastructure, type MegaType } from '../../content/megastructures';
import { createMegaVisual } from '../megastructures/MegaVisuals';

/**
 * Renders planet portraits with the same procedural shader as the system view,
 * using one small offscreen renderer; results are cached as data URLs.
 */
export class PlanetThumbnails {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private readonly cache = new Map<string, string>();

  constructor(size = 96) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size * 2, size * 2, false);
    this.camera.position.set(0, 0, 4.2);
    this.camera.lookAt(0, 0, 0);
  }

  url(planet: Planet): string {
    const hit = this.cache.get(planet.id);
    if (hit) return hit;
    if (isMegastructure(planet.biome)) return this.megaUrl(planet, planet.biome);
    const look = PLANET_LOOKS[planet.biome] ?? PLANET_LOOKS.barren;
    const material = createPlanetMaterial(look, hashSeed(planet.id, 'surface'));
    // Light from the upper left, in view space (the shader is camera-relative).
    material.uniforms.uStarPos.value.set(-6, 4, 2);
    material.uniforms.uTime.value = 5;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), material);
    // A tidally locked world shows its sunward basin (its +x pole), turned toward the light and the viewer.
    if (look.locked !== undefined) sphere.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.6, 0.4, 0.7).normalize());
    else sphere.rotation.z = 0.25;
    this.scene.add(sphere);
    let ring: THREE.Mesh | null = null;
    if (look.ringChance && new Rng(hashSeed(planet.id, 'ringroll')).chance(look.ringChance)) {
      ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.2, 96), createRingMaterial(look.palette[2], hashSeed(planet.id, 'ring')));
      ring.rotation.x = -1.2;
      this.scene.add(ring);
      this.camera.position.z = 6;
    } else this.camera.position.z = 4.2;
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(sphere);
    sphere.geometry.dispose();
    material.dispose();
    if (ring) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    }
    this.cache.set(planet.id, url);
    return url;
  }

  /** A megastructure round a small bright star, seen from above at an angle (change megastructures). */
  private megaUrl(planet: Planet, type: MegaType): string {
    const light = new THREE.Color('#fff4e0');
    const v = createMegaVisual(type, { seed: hashSeed(planet.id, 'mega'), light, clearance: 0.02 });
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff2c8' }));
    const holder = new THREE.Group();
    holder.add(v.object3d, star);
    holder.scale.setScalar(1.25 / v.extent);
    holder.rotation.x = 0.55;
    this.scene.add(holder);
    holder.updateMatrixWorld(true);
    v.update(5);
    this.camera.position.z = 4.2;
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    v.dispose();
    star.geometry.dispose();
    (star.material as THREE.Material).dispose();
    this.cache.set(planet.id, url);
    return url;
  }
}
