import { NOISE_GLSL } from '../../planets/noise.glsl';

/** Cities the ground shader knows of at once (the nearest to the camera). */
export const MAX_MEGA_CITIES = 24;

/**
 * The ground of a megastructure on the GPU (change mega-surfaces): the GLSL copy of
 * src/core/mega/MegaGround.ts (the height, line for line), the shape that bends the land
 * (flat, round a cylinder's axis or a sphere's centre), the land's colours and the air.
 *
 * Coordinates: a site is (x, z) km on the land from the landing site. Everything drawn near is in
 * the camera's frame: the focus (the ground point the camera looks at) at the origin, y up.
 */
export const MEGA_GROUND_GLSL = /* glsl */ `
${NOISE_GLSL}
uniform vec3 uOffset;
uniform float uFeature;
uniform float uRelief;
uniform float uSea;
uniform vec4 uCityA[${MAX_MEGA_CITIES}];
uniform float uCityLevel[${MAX_MEGA_CITIES}];
uniform int uCityN;
uniform float uShape;
uniform float uRadius;
uniform float uTime;
uniform float uHalfWidth;
uniform float uHabitat;

/** A habitat is round: its land repeats once round (the seam is in a window). */
vec2 wrapSite(vec2 s) {
  if (uHabitat < 0.5) return s;
  float c = 6.28318530718 * uRadius;
  return vec2(s.x - c * floor((s.x + c * 0.5) / c), s.y);
}
float groundNoise(vec2 site, float oct) {
  site = wrapSite(site);
  vec3 p = vec3(site / uFeature + uOffset.xy, uOffset.z);
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 14; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    v += a * w * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
float ridges(vec2 site) {
  site = wrapSite(site);
  vec3 p = vec3(site / uFeature * 2.6 + uOffset.xy + vec2(31.0, 17.0), uOffset.z + 5.0);
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    float r = 1.0 - abs(snoise(p));
    v += a * r * r;
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}
float rawHeight(vec2 site, float oct) {
  float land = groundNoise(site, oct) - uSea;
  if (land <= 0.0) return land * uRelief * 0.8;
  float m = ridges(site);
  return (land * 0.6 + smoothstep(0.14, 0.5, land) * m * m * 1.9) * uRelief;
}
float groundHeight(vec2 site, float oct) {
  float h = rawHeight(site, oct);
  site = wrapSite(site);
  for (int i = 0; i < ${MAX_MEGA_CITIES}; i++) {
    if (i >= uCityN) break;
    vec4 c = uCityA[i];
    float f = 1.0 - smoothstep(c.z, c.z * 1.5, length(site - c.xy));
    if (f > 0.0) h += (uCityLevel[i] - h) * f;
  }
  return h;
}
float octavesAt(float dist) { return clamp(log2(uFeature * 6.0 / max(dist, 1e-4)), 1.0, 13.0); }
/** The camera (focus frame) and the height of the ground under it, km. */
uniform vec3 uCam;
uniform float uCamGround;
/**
 * Distance from the camera to a point rel along the land, taking the land as level at the
 * camera's ground: what the terrain's grids slide and add octaves by (and the trees, the same).
 */
float camDist(vec2 rel) { return length(vec3(rel.x, uCamGround, rel.y) - uCam); }

/** sin(t) / t, exact for the tiny angles round a structure millions of km across (a GPU's sin() is not). */
float sinc(float t) {
  if (abs(t) > 0.02) return sin(t) / t;
  float t2 = t * t;
  return 1.0 - t2 / 6.0 + t2 * t2 / 120.0;
}
/**
 * A point on the land (rel: km from the focus along the land; h: km up) in the camera's frame:
 * flat, round a cylinder's axis (a ring, a habitat: the land rises along x), or inside a sphere
 * (it rises all round). Written as d sinc(t) and d (t/2) sinc(t/2)^2 so that a point 10 m from
 * the focus on a ring 15 million km round lands 10 m away, not at a multiple of a GPU's sin() step.
 */
vec3 bend(vec2 rel, float h) {
  if (uShape < 0.5) return vec3(rel.x, h, rel.y);
  float k = 1.0 - h / uRadius;
  if (uShape < 1.5) {
    float t = rel.x / uRadius, sh = sinc(t * 0.5);
    return vec3(rel.x * sinc(t) * k, rel.x * t * 0.5 * sh * sh * k + h, rel.y);
  }
  float d = length(rel);
  if (d < 1e-9) return vec3(0.0, h, 0.0);
  float t = d / uRadius, sh = sinc(t * 0.5);
  vec2 out_ = rel * sinc(t) * k;
  return vec3(out_.x, d * t * 0.5 * sh * sh * k + h, out_.y);
}
/** Turn a direction given in the land's own frame at rel (x along, y up, z across) into the camera's. */
vec3 bendDir(vec2 rel, vec3 v) {
  if (uShape < 0.5) return v;
  if (uShape < 1.5) {
    float t = rel.x / uRadius, c = cos(t), s = sin(t);
    return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
  }
  float d = length(rel);
  if (d < 1e-9) return v;
  vec2 u = rel / d;
  vec3 k = vec3(u.y, 0.0, -u.x);
  float a = -d / uRadius, c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

/** The land's colour: sea, shore, grass and forest by how wet it is, dry plains, rock and snow. */
vec3 landColour(vec2 site, float h, float slope, float fw) {
  site = wrapSite(site);
  vec3 q = vec3(site / uFeature + uOffset.xy, uOffset.z);
  float wet = snoise(q * 0.8 + vec3(40.0, 11.0, 7.0));
  // Mottling, each scale gone before it is smaller than a pixel (fw: a pixel's size, km).
  float m14 = 1.0 - smoothstep(uFeature / 14.0 * 0.1, uFeature / 14.0 * 0.4, fw);
  float m61 = 1.0 - smoothstep(uFeature / 61.0 * 0.1, uFeature / 61.0 * 0.4, fw);
  float mott = (m14 > 0.0 ? snoise(q * 14.0 + vec3(3.0)) * 0.6 * m14 : 0.0) + (m61 > 0.0 ? snoise(q * 61.0 + vec3(9.0)) * 0.4 * m61 : 0.0);
  if (h < 0.0) {
    float depth = clamp(-h / (uRelief * 0.35), 0.0, 1.0);
    return mix(vec3(0.08, 0.32, 0.38), vec3(0.015, 0.06, 0.16), sqrt(depth));
  }
  // Height over the relief: mountains reach about 1.7, the snow line is above 1.
  float e = h / uRelief;
  vec3 grass = mix(vec3(0.3, 0.42, 0.14), vec3(0.18, 0.32, 0.1), smoothstep(-0.2, 0.4, wet));
  vec3 forest = vec3(0.07, 0.17, 0.07);
  vec3 dry = mix(vec3(0.5, 0.43, 0.28), vec3(0.4, 0.36, 0.22), mott * 0.5 + 0.5);
  vec3 col = mix(dry, grass, smoothstep(-0.45, -0.1, wet));
  col = mix(col, forest, smoothstep(0.05, 0.35, wet + mott * 0.15) * (1.0 - smoothstep(0.45, 0.7, e)));
  col = mix(vec3(0.6, 0.56, 0.43), col, smoothstep(0.004, 0.015, e));
  vec3 rock = mix(vec3(0.33, 0.31, 0.29), vec3(0.45, 0.42, 0.38), mott * 0.5 + 0.5);
  col = mix(col, rock, max(smoothstep(0.32, 0.55, slope), smoothstep(0.65, 0.9, e + mott * 0.06)));
  col = mix(col, vec3(0.86, 0.88, 0.92), smoothstep(1.05, 1.15, e + mott * 0.08 - slope * 0.4));
  return col * (0.9 + 0.1 * mott);
}

/**
 * Ground detail below the mesh: value noise at 4 m, 16 m, 64 m, 256 m, 1 km and 4 km, each fading
 * out as it gets smaller than a pixel (fw: a pixel's size, km, taken outside any loop). Worked from
 * near uDetailOrigin (a multiple of the 4 km octave near the camera), so fine octaves stay exact
 * however far the camera roams.
 */
uniform vec2 uDetailOrigin;
uint dHash(uvec2 v) { v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u; return v.x ^ v.y; }
float dCell(vec2 c, float salt) { return float(dHash(uvec2(ivec2(mod(c + salt * 131.0, 65536.0)))) & 0xffffu) / 65535.0; }
float dNoise(vec2 local, float lambda, float salt) {
  vec2 p = local / lambda;
  vec2 i = floor(p), f = fract(p);
  vec2 c = i + floor(uDetailOrigin / lambda + 0.5);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dCell(c, salt), dCell(c + vec2(1.0, 0.0), salt), u.x), mix(dCell(c + vec2(0.0, 1.0), salt), dCell(c + vec2(1.0, 1.0), salt), u.x), u.y) * 2.0 - 1.0;
}
/** (fine texture, patches) in about [-1, 1]: speckle and tufts close up, fields and groves further out. */
vec2 groundDetail(vec2 site, float fw) {
  vec2 local = site - uDetailOrigin;
  float fine = 0.0, grove = 0.0, lam = 0.004;
  for (int i = 0; i < 6; i++) {
    // Gone before a cell is a few pixels long either way (at a grazing angle it streaks).
    float w = 1.0 - smoothstep(lam * 0.08, lam * 0.3, fw);
    float n = dNoise(local, lam, float(i));
    if (i < 3) fine += n * w * 0.5; else grove += n * w * 0.6;
    lam *= 4.0;
  }
  return vec2(fine, grove);
}

uniform vec3 uSun;
uniform vec3 uSunCol;
uniform float uDay;
uniform float uCamAlt;
uniform float uHazeKm;
uniform float uAtmKm;
uniform float uDawn;

/** Where the light comes from at rel: the sun, or in a habitat the mirrors, through the windows across the axis. */
vec3 sunAt(vec2 rel) {
  return uHabitat > 0.5 ? normalize(bendDir(rel, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0, 0.25)) : uSun;
}
/** The sky's colour looking along dir (the camera's frame). */
vec3 skyColour(vec3 dir) {
  float e = dir.y;
  float thick = exp(-max(uCamAlt, 0.0) / 30.0);
  vec3 zen = vec3(0.12, 0.3, 0.68), hor = vec3(0.6, 0.72, 0.86);
  vec3 day = mix(hor, zen, sqrt(clamp(e, 0.0, 1.0)));
  // Dawn: a low sun warms the sky round it.
  float toward = max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-6), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-6)), 0.0);
  day = mix(day, vec3(0.95, 0.55, 0.3), uDawn * (1.0 - smoothstep(0.0, 0.35, abs(e))) * toward * 0.75);
  day += uSunCol * pow(max(dot(dir, uSun), 0.0), 24.0) * 0.3;
  vec3 night = mix(vec3(0.05, 0.07, 0.13), vec3(0.1, 0.12, 0.19), 1.0 - abs(e));
  vec3 c = mix(night, day, uDay);
  return c * mix(0.0, 1.0, thick) * smoothstep(-0.25, 0.0, e + (1.0 - thick) * 0.25);
}
/** How far along dir (km) the view runs through the air before it reaches what it sees, dist km away. */
float airPath(vec3 dir, float dist) {
  if (dir.y >= 0.0) return min(dist, max(uAtmKm - uCamAlt, 0.0) / max(dir.y, 0.02));
  float skip = max(uCamAlt - uAtmKm, 0.0) / max(-dir.y, 0.02);
  return max(dist - skip, 0.0);
}
/** Haze over something dist km away along dir. */
vec3 airOver(vec3 col, vec3 dir, float dist) {
  float f = 1.0 - exp(-airPath(dir, dist) / uHazeKm);
  vec3 haze = mix(vec3(0.08, 0.1, 0.16), mix(vec3(0.62, 0.72, 0.84), vec3(0.95, 0.62, 0.4), uDawn * 0.6), uDay);
  return mix(col, haze, f);
}
`;
