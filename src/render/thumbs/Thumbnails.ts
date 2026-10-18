import { thumbSubject, type ThumbContext, type ThumbKind } from './subjects';
import { ThumbStudio } from './ThumbStudio';

/**
 * The thumbnail service the UI uses (`src/ui/thumbs.ts`): an <img> per request, filled from the
 * studio's cache at once or as soon as it is rendered.
 */
export function createThumbs(ctx: ThumbContext, studio = new ThumbStudio()) {
  return (kind: ThumbKind, id: string, size: number): HTMLElement => {
    const img = document.createElement('img');
    img.className = `thumb thumb-${kind}`;
    img.width = img.height = size;
    img.alt = '';
    img.decoding = 'async';
    const subject = thumbSubject(kind, id, ctx);
    if (!subject) return img;
    const set = (url: string) => {
      if (url) img.src = url;
      img.classList.add('ready');
    };
    const now = studio.request(subject.key, () => subject.build(), set);
    if (now) set(now);
    return img;
  };
}
