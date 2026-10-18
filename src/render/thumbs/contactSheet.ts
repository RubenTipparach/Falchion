import { BIOMES } from '../../content/biomes';
import { BUILDINGS } from '../../content/buildings';
import { ENCOUNTER_KINDS } from '../../content/encounters';
import { RESOURCES } from '../../content/resources';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { TECH_NODES } from '../../content/techTree';
import { classDesign } from '../../core/ships/ClassDesign';
import { DEFAULT_DESIGN } from '../../core/ships/ShipDesign';
import { createDefaultShipFactory } from '../ships/defaultRegistries';
import { HULL_VARIANTS, thumbSubject, type ThumbContext, type ThumbKind } from './subjects';
import { ThumbStudio } from './ThumbStudio';
import { preloadHullTextures } from '../ships/hullTextures';

/**
 * Every thumbnail in one page (tools/thumbs/sheet.html), for `npm run thumbs` to capture and a
 * person to look at. `?only=resource,event` limits it to some kinds.
 */
export async function contactSheet(root: HTMLElement): Promise<void> {
  await preloadHullTextures();
  const { factory } = createDefaultShipFactory();
  const byId = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
  const ctx: ThumbContext = { factory, design: (id) => classDesign(DEFAULT_DESIGN, byId.get(id) ?? SHIP_CLASSES[0]) };
  const params = new URLSearchParams(location.search);
  // ?px=320: bigger tiles, to judge detail (the game shows them at 96 or less).
  const px = Number(params.get('px')) || 0;
  const studio = new ThumbStudio(px ? px * 2 : 160);
  if (px) document.documentElement.style.setProperty('--tile', `${px}px`);
  const only = params.get('only')?.split(',');
  // ?domain=hulls,weapons: only those research domains (each swarm worker checks its own).
  const domains = params.get('domain')?.split(',');
  // ?ids=lancer,dreadnought: only those subjects.
  const ids = params.get('ids')?.split(',');
  const rows: [ThumbKind, string, ReadonlyArray<{ id: string; name: string }>][] = [
    ['resource', 'Resources', RESOURCES],
    ['event', 'Events', ENCOUNTER_KINDS],
    ['building', 'Buildings', [...BUILDINGS, { id: 'capitol', name: 'Capitol' }]],
    ['ship', 'Ships', SHIP_CLASSES],
    ['research', 'Research', TECH_NODES.filter((n) => !domains || domains.includes(n.domain))],
    ['planet', 'Planets', BIOMES],
    ['hull', 'Generated hulls', ['technological', 'utilitarian', 'organic', 'geometric', 'classic'].flatMap((st) => HULL_VARIANTS.map((v, i) => ({ id: `${st}~${i}`, name: `${st} ${v.length}×${v.bulk} e${v.engines} w${v.weapons}` })))],
  ];
  for (const [kind, title, items] of rows) {
    if (only && !only.includes(kind)) continue;
    const grid = document.createElement('div');
    grid.className = 'grid';
    // An id names a subject, or every hull variant of a style (`technological` matches `technological~3`).
    for (const it of items.filter((x) => !ids || ids.some((id) => x.id === id || x.id.startsWith(`${id}~`)))) {
      const cell = document.createElement('figure');
      const s = thumbSubject(kind, it.id, ctx);
      const img = document.createElement('img');
      if (s) img.src = studio.render(s.build());
      else cell.classList.add('missing');
      const cap = document.createElement('figcaption');
      cap.textContent = it.name;
      cap.title = it.id;
      cell.append(img, cap);
      grid.append(cell);
    }
    const h = document.createElement('h2');
    h.textContent = `${title} (${items.length})`;
    root.append(h, grid);
  }
  (window as unknown as { THUMBS_READY: boolean }).THUMBS_READY = true;
}
