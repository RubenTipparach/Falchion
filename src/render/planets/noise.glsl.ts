/**
 * 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) + fbm helpers: the one copy every planet
 * shader uses (the system view, the close-up's terrain, clouds and aurora, and the stars).
 * It hashes on exact integers, like src/core/surface/Noise.ts (the CPU copy that bakes the
 * close-up's globe), so the GPU and the CPU pick the same gradients and agree to float precision.
 */
export const NOISE_GLSL = /* glsl */ `
float m289(float x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
vec4 m289(vec4 x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
vec3 m289(vec3 x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return m289(m289(x * 34.0 + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - 0.5;
  i = m289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec4 j = p - 49.0 * floor((p + 0.5) * (1.0 / 49.0));
  vec4 x_ = floor((j + 0.5) * (1.0 / 7.0));
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * (2.0 / 7.0) + (0.5 / 7.0 - 1.0);
  vec4 y = y_ * (2.0 / 7.0) + (0.5 / 7.0 - 1.0);
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  // h is a multiple of 1/7 and often exactly 0: a margin makes every GPU (and the CPU copy,
  // src/core/surface/Noise.ts) flip the same gradients, whatever its rounding.
  vec4 sh = -step(h, vec4(0.05));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
/** Six octaves (the same sum as fbmN(p, 6.0)). */
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * snoise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
/** fbm with a fractional octave count (the close-up's terrain adds octaves as it comes down). */
float fbmN(vec3 p, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 14; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    v += a * w * snoise(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.1);
    a *= i < 6 ? 0.5 : 0.62;
  }
  return v;
}
float ridged(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * (1.0 - abs(snoise(p))); p *= 2.1; a *= 0.5; }
  return v;
}
`;
