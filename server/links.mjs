// Hotlinks (/system/q,r/Name, /hex/q,r, /player/id) serve the game's index page with a
// title and Open Graph tags naming the place, so a link pasted in Discord unfurls as
// "Norka II · Falchion". The client reads the path and flies there (src/app/Routes.ts).

const HEX = /^-?\d{1,7},-?\d{1,7}$/;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The name a path slug was made from (spaces as underscores), bounded and on one line. */
function slugName(slug) {
  try {
    return decodeURIComponent(slug).replace(/_/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  } catch {
    return '';
  }
}

/** Title and description for a hotlink path, or null when the path is not one. */
export function linkPreview(pathname) {
  const parts = String(pathname).split('/').filter(Boolean);
  const [kind, id, slug, sub, n] = parts;
  if (kind === 'system' && HEX.test(id ?? '')) {
    const name = slug && slug !== 'planet' ? slugName(slug) : '';
    const planet = (slug === 'planet' ? id && sub : sub === 'planet' && n) || null;
    const where = name || `the system at ${id}`;
    if (planet && /^\d{1,2}$/.test(planet)) return { title: `${name ? `${name} · ` : ''}planet ${planet} · Falchion`, description: `A world in ${where}, in the Falchion galaxy. Open the link to fly there.` };
    return { title: `${name || 'A star system'} · Falchion`, description: `${name ? `The ${name} system` : `A star system at ${id}`}, in the Falchion galaxy. Open the link to fly there.` };
  }
  if (kind === 'hex' && HEX.test(id ?? '')) return { title: 'Deep space · Falchion', description: `A point in deep space at ${id}, in the Falchion galaxy. Open the link to fly there.` };
  if (kind === 'player' && /^\d{5,25}$/.test(id ?? '')) return { title: 'A commander · Falchion', description: 'An empire in the Falchion galaxy. Open the link to see it.' };
  return null;
}

/** The index page with the preview's title and Open Graph tags (all escaped). */
export function withPreview(html, preview, url) {
  const title = escapeHtml(preview.title);
  const tags = [
    `<title>${title}</title>`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${escapeHtml(preview.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Falchion" />`,
    url ? `<meta property="og:url" content="${escapeHtml(url)}" />` : '',
    `<meta name="description" content="${escapeHtml(preview.description)}" />`,
  ].filter(Boolean).join('\n    ');
  return html.replace(/<title>[^<]*<\/title>/, tags);
}

/** Link to a place for Discord posts: angle brackets stop Discord unfurling every one. */
export function placeLink(publicUrl, place) {
  if (!place || !Number.isInteger(place.q) || !Number.isInteger(place.r)) return '';
  const slug = encodeURIComponent(String(place.name ?? '').trim().replace(/\s+/g, '_')).slice(0, 80);
  return `<${String(publicUrl).replace(/\/$/, '')}/system/${place.q},${place.r}${slug ? `/${slug}` : ''}>`;
}
