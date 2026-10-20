import type { ThumbKind } from '../render/thumbs/subjects';

export type { ThumbKind };

/** Makes a thumbnail element: an image that fills in once the studio has rendered it. */
export type ThumbFn = (kind: ThumbKind, id: string, size: number) => HTMLElement;

/** Without a studio (tests, headless) a thumbnail is an empty tile of the right size. */
let impl: ThumbFn = (_kind, _id, size) => {
  const s = document.createElement('span');
  s.className = 'thumb';
  s.style.width = s.style.height = `${size}px`;
  return s;
};

/** The app connects the studio here once (src/app/main.ts). */
export const setThumbs = (fn: ThumbFn): void => {
  impl = fn;
};

/** A rendered picture of a ship class, building, resource, encounter kind, research node or planet type. */
export const thumb = (kind: ThumbKind, id: string, size = 32): HTMLElement => impl(kind, id, size);
