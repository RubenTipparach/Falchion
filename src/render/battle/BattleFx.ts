import * as THREE from 'three';

/** Colours as raw sRGB components (the effect shaders write them straight to the screen). */
export type RGB = readonly [number, number, number];
export const rgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const WHITE: RGB = [1, 1, 1];
/** Effect colours: the doctrines' colours, fire and flashes. */
export const COL = {
  long: rgb('#7fd3e6'), short: rgb('#ff9f6b'), barrage: rgb('#ffd166'), siege: rgb('#c792ea'), sup: rgb('#9fe3ff'), cap: rgb('#6ee7a8'),
  assault: rgb('#ff7a7a'), support: rgb('#a98bff'), fire: rgb('#ff8a3d'), flash: rgb('#fff1d6'), flak: rgb('#ffe7b8'), bad: rgb('#ff5d5d'),
} as const;

/**
 * Camera-facing glows (points sized in world units): flashes, missiles, sparks, haze and
 * shockwave rings (kind 1), soft clouds (kind 2). One draw call, refilled each frame.
 */
export class Glows {
  n = 0;
  readonly points: THREE.Points;
  readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly kind: Float32Array;
  private readonly geo = new THREE.BufferGeometry();

  constructor(private readonly max = 9000) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.kind = new Float32Array(max);
    const at = (a: Float32Array, s: number) => new THREE.BufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', at(this.pos, 3)); this.geo.setAttribute('color4', at(this.col, 4)); this.geo.setAttribute('size', at(this.size, 1)); this.geo.setAttribute('kind', at(this.kind, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec4 color4; attribute float size; attribute float kind; uniform float uScale; varying vec4 vC; varying float vK;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(size * uScale / max(-mv.z, 0.1), 900.0); gl_Position = projectionMatrix * mv; vC = color4; vK = kind; }`,
      fragmentShader: `varying vec4 vC; varying float vK;
        void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard; float a;
          if (vK < 0.5) { a = pow(1.0 - r, 2.2) + 0.6 * smoothstep(0.35, 0.0, r); }
          else if (vK < 1.5) { a = smoothstep(0.7, 0.9, r) * smoothstep(1.0, 0.92, r) * 1.4 + 0.08 * (1.0 - r); }
          else { a = pow(1.0 - r * r, 2.0) * 0.6; }
          gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  add(p: THREE.Vector3, c: RGB, a: number, size: number, kind = 0): void {
    if (this.n >= this.max || a <= 0.003) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = Math.min(a, 1.5);
    this.size[i] = size; this.kind[i] = kind;
  }

  flush(): void {
    for (const k of ['position', 'color4', 'size', 'kind']) {
      const a = this.geo.getAttribute(k) as THREE.BufferAttribute;
      a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.n) * a.itemSize); a.needsUpdate = true;
    }
    this.geo.setDrawRange(0, this.n);
  }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}

/** Beams and tracers: one instanced quad that always faces the camera, with a white-hot core. */
export class Beams {
  n = 0;
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly c: Float32Array;
  private readonly w: Float32Array;

  constructor(private readonly max = 4000) {
    const g = this.geo;
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    this.a = new Float32Array(max * 3); this.b = new Float32Array(max * 3); this.c = new Float32Array(max * 4); this.w = new Float32Array(max * 3);
    const ia = (arr: Float32Array, s: number) => new THREE.InstancedBufferAttribute(arr, s).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aA', ia(this.a, 3)); g.setAttribute('aB', ia(this.b, 3)); g.setAttribute('aC', ia(this.c, 4)); g.setAttribute('aW', ia(this.w, 3));
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 aA; attribute vec3 aB; attribute vec4 aC; attribute vec3 aW; varying vec4 vC; varying float vY; varying float vF;
        void main(){ vec4 a = modelViewMatrix * vec4(aA, 1.0); vec4 b = modelViewMatrix * vec4(aB, 1.0);
          vec3 d = b.xyz - a.xyz; float len = length(d); d = len > 1e-5 ? d / len : vec3(1.0, 0.0, 0.0);
          vec3 p = mix(a.xyz, b.xyz, position.x);
          vec3 side = cross(d, normalize(-p)); float sl = length(side); side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
          p += side * position.y * aW.x * 0.5 + d * (position.x * 2.0 - 1.0) * aW.x * 0.35;
          vC = aC; vY = position.y; vF = mix(aW.y, aW.z, position.x);
          gl_Position = projectionMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying vec4 vC; varying float vY; varying float vF;
        void main(){ float d = abs(vY); float a = pow(1.0 - d, 1.8); float core = smoothstep(0.5, 0.95, 1.0 - d);
          gl_FragColor = vec4(mix(vC.rgb, vec3(1.0), core * 0.7), vC.a * vF * a); }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  /** A beam from p to q, `w` wide; fa and fb fade its two ends. */
  add(p: THREE.Vector3, q: THREE.Vector3, c: RGB, a: number, w: number, fa = 1, fb = 1): void {
    if (this.n >= this.max || a <= 0.003) return;
    const i = this.n++;
    this.a[i * 3] = p.x; this.a[i * 3 + 1] = p.y; this.a[i * 3 + 2] = p.z;
    this.b[i * 3] = q.x; this.b[i * 3 + 1] = q.y; this.b[i * 3 + 2] = q.z;
    this.c[i * 4] = c[0]; this.c[i * 4 + 1] = c[1]; this.c[i * 4 + 2] = c[2]; this.c[i * 4 + 3] = Math.min(a, 1.5);
    this.w[i * 3] = w; this.w[i * 3 + 1] = fa; this.w[i * 3 + 2] = fb;
  }

  flush(): void {
    for (const k of ['aA', 'aB', 'aC', 'aW']) {
      const a = this.geo.getAttribute(k) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.n) * a.itemSize); a.needsUpdate = true;
    }
    this.geo.instanceCount = this.n;
  }

  dispose(): void { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

const _m = new THREE.Matrix4(), _c = new THREE.Color();

/** An instanced mesh refilled each frame (hull chunks, shield bubbles). */
export class Instances {
  n = 0;
  readonly mesh: THREE.InstancedMesh;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private readonly max: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, c: RGB, k = 1): void {
    if (this.n >= this.max) return;
    _m.compose(pos, quat, scale);
    this.mesh.setMatrixAt(this.n, _m);
    _c.setRGB(c[0] * k, c[1] * k, c[2] * k);
    this.mesh.setColorAt(this.n, _c);
    this.n++;
  }

  flush(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.dispose(); }
}

/** Shield flash: a rim-lit bubble with a faint hex pattern, coloured by the empire. */
function shieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vP;
      void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz); vC = instanceColor; vP = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying vec3 vP;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float rim = pow(f, 2.4);
        float hex = abs(sin(vP.x * 9.0) * sin(vP.y * 9.0) * sin(vP.z * 9.0)); float a = rim * (0.6 + 0.6 * hex);
        gl_FragColor = vec4(vC, a); }`,
  });
}

/** All the battle's effects: four draw calls, whatever is going on. */
export class BattleFx {
  readonly glow = new Glows();
  readonly beam = new Beams();
  readonly debris = new Instances(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.55, flatShading: true }), 900);
  readonly shield = new Instances(new THREE.IcosahedronGeometry(1, 3), shieldMaterial(), 160);
  readonly group = new THREE.Group();

  constructor() {
    this.shield.mesh.renderOrder = 3;
    this.group.add(this.debris.mesh, this.shield.mesh, this.beam.mesh, this.glow.points);
  }

  begin(): void { this.glow.n = this.beam.n = this.debris.n = this.shield.n = 0; }
  end(): void { this.glow.flush(); this.beam.flush(); this.debris.flush(); this.shield.flush(); }

  dispose(): void { this.glow.dispose(); this.beam.dispose(); this.debris.dispose(); this.shield.dispose(); }
}
