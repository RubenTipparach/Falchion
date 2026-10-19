/**
 * Surface patterns (PlanetLook.pattern), one copy for the system view (PlanetMaterial) and the
 * close-up (surface/shaders.ts TERRAIN_FRAG), so a city world, a dead machine world, a choir world
 * or a bone world looks the same from orbit and from the ground (change planet-audit). `s` scales
 * the pattern (1: as from orbit; the close-up adds finer layers); `near` (0..1) is how close the
 * camera is (things on the ground are props now: content/flora.ts). Needs NOISE_GLSL,
 * ATMOSPHERE_GLSL (hash13, cubeUV) and the uniforms uC0..uC3, uGlow, uSeed and uTime.
 */
export const PATTERN_GLSL = /* glsl */ `
#ifdef PATTERN
/** Antialiased line: 1 within halfW of an integer of g (at least about a pixel wide). */
float gridLine(float g, float halfW) { float fw = fwidth(g); float w = max(halfW, fw * 0.6); float d = abs(g - floor(g + 0.5)); return 1.0 - smoothstep(w - fw * 0.5, w + fw * 0.5, d); }
/** How much of a pattern layer at this frequency can be drawn without aliasing (0..1). */
float patternFade(vec2 g) { return 1.0 - smoothstep(0.35, 0.9, length(fwidth(g))); }

/**
 * The pattern over a base colour: returns the colour, adds the pattern's own lights to patE and
 * may lower spec. d: unit direction; p: noise position; h: height; dusk: 1 on the night side.
 */
vec3 surfacePattern(vec3 d, vec3 p, float h, vec3 col, float s, float near, float dusk, inout float spec, inout vec3 patE) {
  vec3 cu = cubeUV(d);
#if PATTERN == 1
  // City world (change city-life, after Coruscant): districts on a grid of avenues, each split
  // into blocks, and blocks split again and again where a hash says so (a fractal of streets);
  // some districts are laid out round a circular plaza, some cut by a diagonal boulevard. Gold
  // lights over the whole night from orbit; up close the streets are threads of light and the
  // blocks dark, under the towers.
  vec2 gA = cu.xy * 3.0 * s;
  vec2 dA = floor(gA);
  float dh = hash13(vec3(dA, cu.z + 19.0) + floor(uSeed));
  vec2 g = cu.xy * 9.0 * s;
  vec2 bid = floor(g);
  float bh = hash13(vec3(bid, cu.z) + floor(uSeed));
  float dist = fbm(d * 3.0 + uSeed);
  vec3 block = mix(uC1, uC3, bh) * (0.8 + 0.35 * hash13(vec3(floor(g * 3.0), cu.z + 7.0)));
  block = mix(block, mix(uC2, vec3(0.62, 0.6, 0.55), 0.4), smoothstep(0.1, 0.5, dist) * 0.5);
  float street = max(gridLine(g.x, 0.07), gridLine(g.y, 0.07));
  float avenue = max(gridLine(gA.x, 0.03), gridLine(gA.y, 0.03));
  // Fractal streets: at each finer level, a block whose hash says so is split by its midlines.
  float frac = 0.0;
  float lvl = 1.0;
  for (int i = 1; i <= 4; i++) {
    lvl *= 2.0;
    vec2 gL = g * lvl;
    vec2 parent = floor(gL * 0.5);
    float split = step(0.32, hash13(vec3(parent, cu.z + float(i) * 7.0) + floor(uSeed)));
    float fadeL = patternFade(gL);
    vec2 odd = mod(floor(gL + 0.5), 2.0);
    float mid = max(gridLine(gL.x, 0.09) * odd.x, gridLine(gL.y, 0.09) * odd.y);
    frac = max(frac, mid * split * fadeL * (1.0 - 0.15 * float(i)));
  }
  // A district round a circular plaza: rings and spokes. Another cut by a diagonal boulevard.
  vec2 fA = fract(gA) - 0.5;
  float rA = length(fA);
  float circ = step(0.6, dh);
  float ringW = fwidth(rA) * 1.2 + 0.006;
  float rings = max(1.0 - smoothstep(ringW * 0.5, ringW, abs(rA - 0.18)), 1.0 - smoothstep(ringW * 0.5, ringW, abs(rA - 0.34)));
  float spokes = (1.0 - smoothstep(0.0, 0.03 + fwidth(fA.x) * 2.0, abs(sin(atan(fA.y, fA.x) * 4.0)) * rA)) * step(0.08, rA) * step(rA, 0.46);
  float plazaA = 1.0 - smoothstep(0.08, 0.085, rA);
  float radial = circ * max(rings, spokes);
  float diag = step(dh, 0.25) * max(gridLine((gA.x + gA.y) * 1.0, 0.025), gridLine((gA.x - gA.y) * 1.0, 0.025));
  // Inside a circular district the plain grid gives way to the rings and spokes.
  street *= 1.0 - circ * smoothstep(0.42, 0.3, rA);
  frac *= 1.0 - circ * smoothstep(0.42, 0.3, rA);
  // Close up, every block is itself a grid of towers and alleys.
  vec2 g2 = g * 8.0;
  float fine = patternFade(g2);
  float alley = max(gridLine(g2.x, 0.08), gridLine(g2.y, 0.08)) * fine;
  float tower = hash13(vec3(floor(g2), cu.z + 13.0));
  block *= mix(1.0, 0.75 + 0.5 * tower, fine);
  block = mix(block, mix(uC3, vec3(0.7, 0.68, 0.62), 0.5), circ * plazaA);
  float roads = max(max(max(street * 0.8, avenue), max(radial, diag)), max(alley * 0.7, frac));
  col = mix(block, uC0, roads);
  spec = 0.25;
  float windows = step(0.45, hash13(vec3(floor(g * 4.0), cu.z + 3.0)));
  float dense = 0.55 + 0.45 * smoothstep(-0.4, 0.4, dist);
  // From orbit the whole night side glows; close in, the glow draws in to the streets and plazas.
  float far = 1.0 - near * 0.8;
  // Seen close, a wide road is dark tarmac with threads of light down its lanes, not a glowing
  // plain: the roads' glow narrows to their centres and edges as the camera comes down.
  float threads = max(max(gridLine(g.x, 0.003), gridLine(g.y, 0.003)) * (1.0 - circ * smoothstep(0.42, 0.3, rA)),
    max(max(gridLine(gA.x, 0.002), gridLine(gA.y, 0.002)), max(abs(abs(fract(gA.x + 0.5) - 0.5) - 0.022), abs(abs(fract(gA.y + 0.5) - 0.5) - 0.022)) < 0.0015 ? 1.0 : 0.0));
  float wideGlow = street * 0.7 + avenue * 0.9 + (radial + diag) * 0.9;
  float lanes = mix(wideGlow, threads * 1.2 + (radial + diag) * 0.25, near) + frac * 0.5 + alley * 0.25;
  patE += uGlow * (windows * 0.35 * dense * far + lanes * mix(1.0, 0.5, near) + step(0.8, tower) * fine * 0.35 * far + circ * plazaA * 0.6) * (dusk * 1.6 + 0.06);
#elif PATTERN == 2
  // Dead machine world: rusting plates, seams and dead blocks; a few dying lights.
  vec2 g = cu.xy * 11.0 * s;
  vec2 pid = floor(g), f = fract(g);
  float ph = hash13(vec3(pid, cu.z) + floor(uSeed));
  vec2 g3 = cu.xy * 3.5 * s;
  float blk = hash13(vec3(floor(g3), cu.z + 11.0) + floor(uSeed));
  vec3 plate = mix(uC1, uC2, ph) * (0.75 + 0.5 * step(0.7, blk));
  float rust = smoothstep(0.0, 0.5, fbm(d * 4.0 + uSeed.zxy) + h * 0.4);
  plate = mix(plate, uC3 * (0.8 + 0.4 * snoise(p * 9.0)), rust * 0.75);
  plate *= 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.1, f.x)) - 0.3 * smoothstep(0.88, 1.0, f.y);
  // Close up: panels within the plates, rivet lines and vents.
  vec2 g2 = g * 6.0;
  float fine = patternFade(g2);
  float panel = max(gridLine(g2.x, 0.04), gridLine(g2.y, 0.04)) * fine;
  plate *= mix(1.0, 0.85 + 0.3 * hash13(vec3(floor(g2), cu.z + 5.0)), fine);
  float seam = max(gridLine(g.x, 0.05), gridLine(g.y, 0.05));
  float trench = max(gridLine(g3.x, 0.04), gridLine(g3.y, 0.04));
  col = mix(plate, uC0, max(max(seam * 0.85, trench), panel * 0.5));
  spec = 0.4 * (1.0 - rust);
  vec3 lid = vec3(floor(cu.xy * 22.0 * s), cu.z);
  float lh = hash13(lid + floor(uSeed) + 5.0);
  float lamp = step(0.95, lh) * (1.0 - smoothstep(0.1, 0.42, length(fract(cu.xy * 22.0 * s) - 0.5)));
  float flicker = smoothstep(0.2, 0.5, fract(uTime * (0.1 + lh * 0.3) + lh * 17.0)) * (0.7 + 0.3 * sin(uTime * 13.0 + lh * 40.0));
  patE += uGlow * lamp * flicker * (dusk * 1.8 + 0.9);
#elif PATTERN == 3
  // Choir world: circuit traces over a pale dead crust, pulses running along them; finer traces close up.
  float trace = 0.0, pulse = 0.0;
  for (int lv = 0; lv < 2; lv++) {
    float k = lv == 0 ? 12.0 * s : 12.0 * s * 7.0;
    vec2 g = cu.xy * k;
    float fade = lv == 0 ? 1.0 : patternFade(g) * 0.8;
    if (fade <= 0.0) continue;
    vec2 cid = floor(g);
    float o = float(lv) * 19.0;
    float hx = hash13(vec3(cid.x + 0.5, floor(g.y + 0.5), cu.z + o) + floor(uSeed));
    float hy = hash13(vec3(floor(g.x + 0.5), cid.y + 0.5, cu.z + 9.0 + o) + floor(uSeed));
    float trX = gridLine(g.y, 0.05) * step(0.45, hx);
    float trY = gridLine(g.x, 0.05) * step(0.45, hy);
    vec2 nd = g - floor(g + 0.5);
    float node = (1.0 - smoothstep(0.1, 0.16, length(nd))) * step(0.6, hash13(vec3(floor(g + 0.5), cu.z + 4.0 + o)));
    float t = max(max(trX, trY), node) * fade;
    trace = max(trace, t);
    pulse = max(pulse, t * pow(0.5 + 0.5 * sin((g.x + g.y) * 0.9 - uTime * 2.2 + cu.z * 1.7), 6.0));
  }
  float breathe = 0.55 + 0.45 * sin(uTime * 0.7 + fbm(d * 2.0 + uSeed) * 6.0);
  col = mix(col, col * 0.55, trace * 0.8);
  patE += uGlow * (trace * 0.35 + pulse * 1.2) * breathe * (dusk * 1.3 + 0.8);
#elif PATTERN == 4
  // Bone world: a dead world. From orbit, grey dead forests, pale ash plains and white salt flats
  // where seas dried up; on the ground its bones and dead trees are props (content/flora.ts).
  float forest = smoothstep(-0.05, 0.3, fbm(d * 5.0 + uSeed.yzx));
  float salt = 1.0 - smoothstep(-0.35, -0.15, h);
  col = mix(col, uC1 * 0.75, forest * 0.55);
  col = mix(col, vec3(0.9, 0.88, 0.82), salt * 0.8);
  col *= 0.9 + 0.15 * smoothstep(0.55, 0.95, ridged(p * 6.0));
#endif
  return col;
}
#endif
`;

/** The PATTERN #define for each pattern. */
export const PATTERN_IDS = { city: 1, machine: 2, circuit: 3, bones: 4 } as const;
