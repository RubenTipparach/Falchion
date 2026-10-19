import * as THREE from 'three';

/**
 * The swarm habitat's painted maps, from Star Crew Bridge Simulator's O'Neill cylinder
 * (public/textures/oneill, see its README): one land stripe with its rivers, a close-up ground
 * detail, where clouds gather, the end caps' machinery and the mirrors' panels. Loaded once and
 * shared; the cloud map is also read on the CPU, to place the puffs.
 */
export interface HabitatArt {
  readonly land: THREE.Texture;
  readonly landDetail: THREE.Texture;
  readonly dome: THREE.Texture;
  readonly mirror: THREE.Texture;
  /** The detail map's mean colour (the land is multiplied by detail / mean, so it keeps its tone). */
  readonly detailMean: THREE.Color;
  /** Cloud cover 0..1 at (u round the habitat, v along it), once loaded. */
  readonly clouds: Promise<(u: number, v: number) => number>;
}

let art: HabitatArt | null = null;

function texture(name: string, repeat: boolean, onLoad?: (t: THREE.Texture) => void): THREE.Texture {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const t = new THREE.TextureLoader().load(`${base}textures/oneill/${name}.png`, onLoad, undefined, () => undefined);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Pixels of a loaded image (null where there is no canvas to read it with). */
function pixels(img: CanvasImageSource & { width: number; height: number }): ImageData | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

export function habitatArt(): HabitatArt {
  if (art) return art;
  // The detail map's mean, measured from the file: its alpha is empty, and a canvas would read
  // every pixel of it back as black.
  const detailMean = new THREE.Color(0.858, 0.858, 0.818);
  const landDetail = texture('oneill_land_detail', true);
  const clouds = new Promise<(u: number, v: number) => number>((done) => {
    texture('oneill_clouds', true, (t) => {
      const d = pixels(t.image as HTMLImageElement);
      if (!d) return done(() => 0);
      done((u, v) => {
        const x = Math.floor((((u % 1) + 1) % 1) * d.width), y = Math.floor((((v % 1) + 1) % 1) * d.height);
        return d.data[(y * d.width + x) * 4 + 3] / 255;
      });
    });
  });
  art = { land: texture('oneill_land', true), landDetail, dome: texture('oneill_dome', false), mirror: texture('oneill_mirror', true), detailMean, clouds };
  return art;
}
