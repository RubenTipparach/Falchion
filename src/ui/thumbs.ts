export type ThumbKind = 'ship' | 'building' | 'resource' | 'event' | 'research';
type ThumbFn = (kind: ThumbKind, id: string, size: number) => HTMLElement;
let impl: ThumbFn = (_k, _i, size) => { const s = document.createElement('span'); s.className = 'thumb'; s.style.width = s.style.height = `${size}px`; return s; };
export const setThumbs = (fn: ThumbFn): void => { impl = fn; };
export const thumb = (kind: ThumbKind, id: string, size = 32): HTMLElement => impl(kind, id, size);
