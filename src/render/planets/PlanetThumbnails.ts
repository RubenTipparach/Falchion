import * as THREE from 'three';
import { PLANET_LOOKS } from '../../content/planetLooks';
import type { Planet } from '../../core/galaxy/Planets';
import { hashSeed, Rng } from '../../core/rng/Rng';
import { createPlanetMaterial, createRingMaterial } from './PlanetMaterial';

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
    const look = PLANET_LOOKS[planet.biome] ?? PLANET_LOOKS.barren;
    const material = createPlanetMaterial(look, hashSeed(planet.id, 'surface'));
    // Light from the upper left, in view space (the shader is camera-relative).
    material.uniforms.uStarPos.value.set(-6, 4, 2);
    material.uniforms.uTime.value = 5;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), material);
    sphere.rotation.z = 0.25;
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
}
