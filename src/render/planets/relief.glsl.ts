/**
 * Landforms over the noise terrain (change planet-audit): impact craters, canyon networks,
 * volcanoes and a tidally locked world's sunward basin. The same arithmetic as
 * src/core/surface/Relief.ts (which bakes the close-up's globe), hashing on exact integers, so the
 * system view, the baked globe and the close-up's detail patch agree. Needs NOISE_GLSL first.
 */
export const RELIEF_GLSL = /* glsl */ `
float rPerm(float x) { return m289(m289(x * 34.0 + 1.0) * x); }
float rCell(vec3 c, float salt) { return rPerm(m289(c.x + salt) + rPerm(m289(c.y) + rPerm(m289(c.z)))); }
/** A cell's feature: centre (xyz) and radius (w), with its hash in h; false when the cell has none. */
bool rFeature(vec3 c, float salt, float density, out vec4 f, out float h) {
  float a = rCell(c, salt);
  h = a;
  if (a / 289.0 > density) return false;
  float b = rPerm(a + 1.0), cc = rPerm(b + 1.0), d = rPerm(cc + 1.0), e = rPerm(d + 1.0);
  f = vec4(c + 0.2 + 0.6 * vec3(b, cc, d) / 289.0, 0.16 + 0.28 * e / 289.0);
  return true;
}
float craterLayer(vec3 q, float salt, float density) {
  vec3 fq = floor(q);
  // A crater reaches at most 0.75 of a cell from its centre (centre 0.2..0.8 across its cell,
  // radius up to 0.44, felt out to 1.7 radii), so only the neighbours on a point's own side of
  // each axis can reach it, unless it is near the middle: usually 8 cells, not 27 (change surface-perf).
  vec3 t = q - fq;
  ivec3 lo = ivec3(mix(vec3(-1.0), vec3(0.0), step(0.55, t))), hi = ivec3(mix(vec3(0.0), vec3(1.0), step(0.45, t)));
  float sum = 0.0;
  for (int k = lo.z; k <= hi.z; k++) for (int j = lo.y; j <= hi.y; j++) for (int i = lo.x; i <= hi.x; i++) {
    vec4 f; float hh;
    if (!rFeature(fq + vec3(float(i), float(j), float(k)), salt, density, f, hh)) continue;
    float d = length(q - f.xyz) / f.w;
    if (d > 1.7) continue;
    float bowl = d < 1.0 ? d * d - 1.0 : 0.0;
    float rim = exp(-pow((d - 1.0) / 0.24, 2.0)) * 0.32;
    sum += f.w * (bowl + rim);
  }
  return sum;
}
/** Craters at every size the octaves reach (CRATER_LAYERS in Relief.ts). */
float craters(vec3 p, float oct) {
  float h = 0.0;
  h += 0.75 * craterLayer(p * 1.3, 11.0, 0.5);
  h += 0.45 * craterLayer(p * 3.1, 37.0, 0.65);
  h += 0.26 * craterLayer(p * 7.3, 71.0, 0.8);
  float w4 = clamp(oct - 8.0, 0.0, 1.0);
  if (w4 > 0.0) h += w4 * 0.12 * craterLayer(p * 17.0, 113.0, 0.85);
  float w5 = clamp(oct - 10.0, 0.0, 1.0);
  if (w5 > 0.0) h += w5 * 0.05 * craterLayer(p * 41.0, 151.0, 0.9);
  return h;
}
/** How deep in a canyon a point is (0..1). */
float canyonCut(vec3 p, float strength) {
  float wide = clamp(strength - 1.0, 0.0, 1.0);
  vec3 w = vec3(snoise(p * 0.7 + vec3(11.0)), snoise(p * 0.7 + vec3(23.0)), snoise(p * 0.7 + vec3(37.0)));
  float valley = 1.0 - smoothstep(0.0, 0.2 + 0.1 * wide, abs(snoise(p * 0.9 + w * 0.6)));
  float tribs = 1.0 - smoothstep(0.0, 0.11, abs(snoise(p * 2.3 + w * 0.8 + vec3(5.0))));
  float mask = smoothstep(-0.25 - wide, 0.3 - wide, snoise(p * 0.45 + vec3(71.0)));
  return max(valley, tribs * 0.55) * mask;
}
float canyonDepth(float cut, float strength) { return strength * (0.55 * cut + 0.35 * smoothstep(0.45, 0.9, cut)); }
/** Volcanoes: (height, lava 0..1); shield cones centred on the surface (the sphere of radius rad
 * round c in noise space), a glowing caldera and lava rivers. As volcanoes() in Relief.ts. */
vec2 volcanoes(vec3 p, vec3 c, float rad) {
  vec3 q = p * 0.9;
  vec3 fq = floor(q);
  vec3 cq = c * 0.9;
  float R = rad * 0.9;
  float h = 0.0, lava = 0.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec4 f; float a;
    if (!rFeature(fq + vec3(float(i), float(j), float(k)), 197.0, 0.6, f, a)) continue;
    vec3 o = f.xyz - cq;
    float ol = length(o);
    if (abs(ol - R) > 0.5) continue;
    float r = f.w * 1.8;
    vec3 dv = q - (cq + o * (R / ol));
    float len = length(dv);
    float d = len / r;
    if (d >= 1.0) continue;
    float cone = pow(1.0 - d, 1.4);
    float caldera = 1.0 - smoothstep(0.1, 0.2, d);
    h += r * (1.4 * cone - 0.45 * caldera);
    vec3 u = dv / max(len, 1e-6);
    float ring = max(exp(-pow((d - 0.17) / 0.06, 2.0)), 0.8 * (1.0 - smoothstep(0.08, 0.12, d)));
    float river = (1.0 - smoothstep(0.0, 0.07, abs(snoise(vec3(u.x * 4.0 + a, u.y * 4.0, u.z * 4.0))))) * smoothstep(0.12, 0.2, d) * (1.0 - smoothstep(0.35, 0.9, d));
    lava = max(lava, max(ring, river * 0.85));
  }
  return vec2(h, lava);
}
/** The locked world's sunward eye (its pole is +x in the planet's frame), 0..1. */
float lockedEye(float dirX, float h, float locked) { return smoothstep(locked - 0.1, locked + 0.12, dirX + h * 0.2); }
`;
