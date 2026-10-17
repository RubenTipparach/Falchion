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
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  focus: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  fleet: svg('<path d="M4 12l14-6-4 6 4 6z"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'),
  crate: svg('<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>', 22),
  trade: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  battle: svg('<path d="M5 19L19 5M14 5h5v5"/><path d="M19 19L5 5M5 10V5h5"/>'),
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
  ammo: svg('<path d="M7 20V9l2-4 2 4v11zM13 20V9l2-4 2 4v11z"/>'),
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
  build: svg('<path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M10 20v-6h4v6"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>'),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = ICONS[name];
  return span;
}
