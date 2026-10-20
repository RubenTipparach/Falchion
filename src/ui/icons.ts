import { RESOURCES, Resource } from '../content/resources';

/** Inline SVG icons (stroke-based, inherit currentColor). */
const svg = (body: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  logo: svg('<path d="M4 20 L19 5"/><path d="M15 4h5v5"/><path d="M7 13l4 4"/><path d="M4 20l2.5-.5L5 18z" fill="currentColor"/>', 20),
  hex: svg('<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>'),
  galaxy: svg('<circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 12c4-6 10-3 8 2"/><path d="M12 12c-4 6-10 3-8-2"/><path d="M12 12c6 3 4 9-1 8"/><path d="M12 12c-6-3-4-9 1-8"/>'),
  shipyard: svg('<path d="M3 15l9-11 9 11-9 5z"/><path d="M12 4v16"/><path d="M7.5 13.5L12 16l4.5-2.5"/>'),
  research: svg('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v2a4 4 0 0 0 4 4h0M18 8v2a4 4 0 0 1-4 4h0M12 14v2"/>'),
  explore: svg('<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-20 12 12)"/>'),
  endTurn: svg('<path d="M5 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  focus: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  fleet: svg('<path d="M4 12l14-6-4 6 4 6z"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'),
  crate: svg('<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>', 22),
  trade: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  battle: svg('<path d="M5 19L19 5M14 5h5v5"/><path d="M19 19L5 5M5 10V5h5"/>'),
  play: svg('<path d="M8 5l11 7-11 7z" fill="currentColor"/>'),
  relations: svg('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  anomaly: svg('<path d="M12 12m-2 0a2 2 0 1 0 4 0a4 4 0 1 0-8 0a6 6 0 1 0 12 0a8 8 0 1 0-16 0"/>'),
  derelict: svg('<path d="M4 14l6-6 3 3 7-7"/><path d="M14 4h6v6"/><path d="M4 20h16"/>'),
  shard: svg('<path d="M12 3l6 7-6 11-6-11z"/><path d="M6 10h12"/>'),
  chassis: svg('<path d="M12 3l4 8-4 10-4-10z"/><path d="M8 11l-4 4M16 11l4 4"/>'),
  part: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  materials: svg('<path d="M4 18l4-9 4 5 3-3 5 7z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  empire: svg('<path d="M3 20h18"/><path d="M5 20V10M9.7 20V10M14.3 20V10M19 20V10"/><path d="M3 10l9-6 9 6z"/>'),
  locate: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  supply: svg('<rect x="4" y="7" width="16" height="12" rx="1.5"/><path d="M9 7V5h6v2M4 12h16"/>'),
  hull: svg('<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/>'),
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
  land: svg('<path d="M12 3v10"/><path d="M8 9.5l4 4 4-4"/><path d="M3 20c3-2.6 6-3.4 9-3.4s6 .8 9 3.4"/>'),
  build: svg('<path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6"/>'),
  // Share: a link (two chain loops).
  link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>'),
  players: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 0 5.5 2.4 5.5 5.8"/>'),
  // Missions: a pennant on a staff.
  missions: svg('<path d="M6 21V3"/><path d="M6 4h12l-3 4 3 4H6"/>'),
  chat: svg('<path d="M4 5h16v10H10l-4 4v-4H4z"/><path d="M8 9h8M8 12h5"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** One glyph per resource, drawn in the resource's colour. */
const RESOURCE_ICONS: Readonly<Record<Resource, string>> = {
  // Credits: a stamped coin.
  credits: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><path d="M12 9v6M10.5 10.5h2.2a1.3 1.3 0 0 1 0 2.6h-1.4a1.3 1.3 0 0 0 0 2.6h2.2"/>'),
  // Influence: a laurel-crowned star.
  influence: svg('<path d="M12 5l1.9 3.9 4.3.6-3.1 3 .7 4.3L12 14.8l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/><path d="M5 18c2 1.6 4.4 2.2 7 2.2s5-.6 7-2.2"/>'),
  // Faith: a flame inside a halo.
  faith: svg('<path d="M12 20c-3 0-5-2-5-4.8 0-3 3.2-4.6 3.6-8.2 2.4 1.6 3.4 3.4 3.4 5.2.8-.6 1.2-1.4 1.4-2.4 1.2 1.2 1.6 3 1.6 4.4 0 3-2 5.8-5 5.8z"/><ellipse cx="12" cy="4" rx="4" ry="1.4"/>'),
  // Food: an ear of grain.
  food: svg('<path d="M12 21V8"/><path d="M12 9c-2.6-.4-3.6-2.4-3.6-4.6 2.4.2 3.6 2 3.6 4.6zM12 9c2.6-.4 3.6-2.4 3.6-4.6-2.4.2-3.6 2-3.6 4.6z"/><path d="M12 14c-2.6-.4-3.8-2.4-3.8-4.4 2.4.2 3.8 1.9 3.8 4.4zM12 14c2.6-.4 3.8-2.4 3.8-4.4-2.4.2-3.8 1.9-3.8 4.4z"/><path d="M12 19c-2.6-.4-3.8-2.4-3.8-4.4 2.4.2 3.8 1.9 3.8 4.4zM12 19c2.6-.4 3.8-2.4 3.8-4.4-2.4.2-3.8 1.9-3.8 4.4z"/>'),
  // Metals: stacked ingots.
  metals: svg('<path d="M4 18l2-4h6l2 4z"/><path d="M10 18l2-4h6l2 4z"/><path d="M7 14l2-4h6l2 4"/>'),
  // Gases: a gas canister venting.
  gases: svg('<rect x="7" y="8" width="10" height="13" rx="3"/><path d="M10 8V6h4v2"/><path d="M15 4c1-.8 2.4-.8 3.4 0M16.5 2.2c.8-.4 1.8-.4 2.6 0"/><path d="M7 13h10"/>'),
  // Crystals: a faceted gem cluster.
  crystals: svg('<path d="M9 21l-3-7 3-9 3 9z"/><path d="M15 21l-3-6 3-7 3 7z"/><path d="M6 14h6M12 15h6"/>'),
  // Trade goods: a strapped crate.
  goods: svg('<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/><path d="M8 6l8 4"/>'),
};

/** Resource glyph in the resource's own colour. */
export function resourceIcon(id: Resource, size = 16): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'ico res-ico';
  span.innerHTML = RESOURCE_ICONS[id].replace('width="16" height="16"', `width="${size}" height="${size}"`);
  span.style.color = RESOURCES.find((r) => r.id === id)?.color ?? 'currentColor';
  return span;
}

export function icon(name: IconName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = ICONS[name];
  return span;
}
