import { BIOMES } from '../../content/biomes';
import { BUILDINGS } from '../../content/buildings';
import { ENCOUNTER_KINDS } from '../../content/encounters';
import { RESOURCES } from '../../content/resources';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { TECH_NODES } from '../../content/techTree';
import { classDesign } from '../../core/ships/ClassDesign';
import { DEFAULT_DESIGN } from '../../core/ships/ShipDesign';
import { createDefaultShipFactory } from '../ships/defaultRegistries';
import { thumbSubject, type ThumbContext, type ThumbKind } from './subjects';
import { ThumbStudio } from './ThumbStudio';

/**
 * Every thumbnail in one page (tools/thumbs/sheet.html), for `npm run thumbs` to capture and a
 * person to look at. `?only=resource,event` limits it to some kinds.
 */
export function contactSheet(root: HTMLElement): void {
  const { factory } = createDefaultShipFactory();
  const byId = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
  const ctx: ThumbContext = { factory, design: (id) => classDesign(DEFAULT_DESIGN, byId.get(id) ?? SHIP_CLASSES[0]) };
  const studio = new ThumbStudio(160);
  const params = new URLSearchParams(location.search);
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
  ];
  for (const [kind, title, items] of rows) {
    if (only && !only.includes(kind)) continue;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const it of items.filter((x) => !ids || ids.includes(x.id))) {
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
