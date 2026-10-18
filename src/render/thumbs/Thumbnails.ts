import { thumbSubject, type ThumbContext, type ThumbKind } from './subjects';
import { ThumbStudio } from './ThumbStudio';
import { buildingArtStyle, drawnBuildingUrl, onBuildingArtStyle } from './drawnArt';

/**
 * The thumbnail service the UI uses (`src/ui/thumbs.ts`): an <img> per request, filled from the
 * studio's cache at once or as soon as it is rendered. Buildings use the viewer's art style: a
 * hand-drawn picture when the style has one (the render when it fails to load), and the ones on
 * screen switch when the style changes.
 */
export function createThumbs(ctx: ThumbContext, studio = new ThumbStudio()) {
  const render = (img: HTMLImageElement, kind: ThumbKind, id: string) => {
    const subject = thumbSubject(kind, id, ctx);
    if (!subject) return;
    const set = (url: string) => {
      if (url) img.src = url;
      img.classList.add('ready');
    };
    const now = studio.request(subject.key, () => subject.build(), set);
    if (now) set(now);
  };
  const building = (img: HTMLImageElement, id: string) => {
    const style = buildingArtStyle();
    const drawn = drawnBuildingUrl(style, id);
    img.classList.toggle('pixelated', !!style.pixelated);
    img.classList.toggle('drawn', !!drawn);
    if (!drawn) return render(img, 'building', id);
    img.onerror = () => { img.onerror = null; img.classList.remove('drawn', 'pixelated'); render(img, 'building', id); };
    img.src = drawn;
    img.classList.add('ready');
  };
  if (typeof document !== 'undefined') {
    onBuildingArtStyle(() => document.querySelectorAll<HTMLImageElement>('img.thumb-building[data-id]').forEach((img) => building(img, img.dataset.id!)));
  }
  return (kind: ThumbKind, id: string, size: number): HTMLElement => {
    const img = document.createElement('img');
    img.className = `thumb thumb-${kind}`;
    img.width = img.height = size;
    img.alt = '';
    img.decoding = 'async';
    if (kind === 'building') {
      img.dataset.id = id;
      building(img, id);
    } else {
      render(img, kind, id);
    }
    return img;
  };
}
