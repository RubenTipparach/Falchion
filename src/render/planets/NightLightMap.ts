import * as THREE from 'three';
import type { LightSpot } from '../../core/surface/NightLights';

/**
 * A planet's night lights as one equirectangular texture (red channel, 0..1), painted from its
 * light spots (src/core/surface/NightLights.ts). The system view's planet material and the
 * close-up's terrain shader both sample it by direction in the planet's frame (LIGHT_MAP_GLSL),
 * so the lights are in the same places at every zoom level.
 */

/** Texture width (height is half): about 0.006 radians per texel. */
const WIDTH = 1024;

/** GLSL: the light map's value at a unit direction in the planet's frame. */
export const LIGHT_MAP_GLSL = /* glsl */ `
float lightMapAt(sampler2D map, vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  return texture2D(map, uv).r;
}`;

export function buildNightLightMap(spots: readonly LightSpot[], width = WIDTH): THREE.DataTexture {
  const W = width, H = width / 2;
  const buf = new Float32Array(W * H);
  const texel = (Math.PI * 2) / W;
  // Per row and column: sine and cosine of latitude and longitude at texel centres.
  const sinLat = new Float64Array(H), cosLat = new Float64Array(H), sinLon = new Float64Array(W), cosLon = new Float64Array(W);
  for (let j = 0; j < H; j++) { const lat = ((j + 0.5) / H) * Math.PI - Math.PI / 2; sinLat[j] = Math.sin(lat); cosLat[j] = Math.cos(lat); }
  for (let i = 0; i < W; i++) { const lon = ((i + 0.5) / W) * Math.PI * 2 - Math.PI; sinLon[i] = Math.sin(lon); cosLon[i] = Math.cos(lon); }
  for (const s of spots) {
    // Spots smaller than a texel are spread over one, dimmed by the area they really cover.
    const r = Math.max(s.radius, texel * 0.9);
    const power = s.power * Math.min(1, Math.sqrt(s.radius / r));
    const [x, y, z] = s.dir;
    const lat = Math.asin(Math.max(-1, Math.min(1, y))), lon = Math.atan2(z, x);
    const jc = ((lat + Math.PI / 2) / Math.PI) * H - 0.5, ic = ((lon + Math.PI) / (Math.PI * 2)) * W - 0.5;
    const dj = Math.ceil(r / (Math.PI / H)) + 1;
    const di = Math.min(Math.ceil(r / (texel * Math.max(Math.cos(lat), 0.05))) + 1, W / 2);
    for (let j = Math.max(0, Math.floor(jc - dj)); j <= Math.min(H - 1, Math.ceil(jc + dj)); j++) {
      for (let k = Math.floor(ic - di); k <= Math.ceil(ic + di); k++) {
        const i = ((k % W) + W) % W;
        const dx = cosLat[j] * cosLon[i] - x, dy = sinLat[j] - y, dz = cosLat[j] * sinLon[i] - z;
        const t = (dx * dx + dy * dy + dz * dz) / (r * r);
        if (t >= 1) continue;
        const v = power * (1 - t) * (1 - t);
        const o = j * W + i;
        if (v > buf[o]) buf[o] = v;
      }
    }
  }
  const data = new Uint8Array(W * H);
  for (let o = 0; o < data.length; o++) data[o] = Math.round(Math.min(buf[o], 1) * 255);
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** A dark 1x1 map for worlds with no lights (samplers need a texture). */
export const NO_LIGHTS: THREE.DataTexture = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  t.needsUpdate = true;
  return t;
})();
