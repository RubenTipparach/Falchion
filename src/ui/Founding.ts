import { SHIP_STYLES } from '../content/shipStyles';
import { EmpireIdentity, Flag, HeraldryTables, NAME_MAX, cleanIdentity, randomEmpireName, randomFlag } from '../core/empire/Identity';
import { Rng } from '../core/rng/Rng';
import { FLAG_EMBLEMS, FLAG_FIELDS } from '../content/heraldry';
import { h } from './dom';
import { icon } from './icons';
import { flagEl } from '../render/flag';

/**
 * The founding screen: name the empire, its ruler and capital, pick its colour and design
 * its flag. Shown once for a new empire (it cannot be dismissed) and again from the Empire
 * panel to edit, where Cancel resolves null.
 */
export function showFounding(start: EmpireIdentity, t: HeraldryTables, mode: 'found' | 'edit'): Promise<EmpireIdentity | null> {
  return new Promise((resolve) => {
    let id: EmpireIdentity = start;
    // Dice rolls only need to differ from each other; they are not part of the simulation.
    const rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    const set = (patch: Partial<EmpireIdentity>) => { id = { ...id, ...patch }; render(); };
    const setFlag = (patch: Partial<Flag>) => set({ flag: { ...id.flag, ...patch } });
    const setFlagColor = (i: 0 | 1 | 2, c: string) => {
      const colors = [...id.flag.colors] as [string, string, string];
      colors[i] = c;
      setFlag({ colors });
    };

    const nameIn = h('input', { class: 'input', maxlength: NAME_MAX, 'aria-label': 'Empire name' });
    const rulerIn = h('input', { class: 'input', maxlength: NAME_MAX, 'aria-label': 'Ruler name' });
    const capitalIn = h('input', { class: 'input', maxlength: NAME_MAX, 'aria-label': 'Capital world name' });
    const titleSel = h('select', { class: 'input', 'aria-label': 'Ruler title' }, ...t.titles.map((x) => h('option', { value: x }, x)));
    nameIn.oninput = () => { id = { ...id, name: nameIn.value }; renderPreview(); };
    rulerIn.oninput = () => { id = { ...id, ruler: rulerIn.value }; renderPreview(); };
    capitalIn.oninput = () => { id = { ...id, capital: capitalIn.value }; renderPreview(); };
    titleSel.onchange = () => set({ title: titleSel.value });

    const preview = h('div', { class: 'founding-preview' });
    const colorRow = h('div', { class: 'swatches' });
    const fieldRow = h('div', { class: 'flag-tiles' });
    const emblemRow = h('div', { class: 'flag-tiles' });
    const flagColorRows = [h('div', { class: 'swatches small' }), h('div', { class: 'swatches small' }), h('div', { class: 'swatches small' })];
    const styleRow = h('div', { class: 'style-picks' });
    const error = h('p', { class: 'small red', hidden: true });

    const swatch = (c: string, active: boolean, pick: () => void, label: string) =>
      h('button', { class: `swatch ${active ? 'active' : ''}`, style: `background:${c}`, title: label, 'aria-label': label, 'aria-pressed': active ? 'true' : 'false', onclick: pick });

    const renderPreview = () => {
      preview.replaceChildren(
        flagEl(id.flag, 168),
        h('h3', { style: `color:${id.color}` }, id.name.trim() || 'Unnamed empire'),
        h('p', {}, `${id.title} ${id.ruler.trim() || '…'}`),
        h('p', { class: 'muted small' }, `Capital: ${id.capital.trim() || '…'}`));
    };

    const render = () => {
      if (nameIn.value !== id.name) nameIn.value = id.name;
      if (rulerIn.value !== id.ruler) rulerIn.value = id.ruler;
      if (capitalIn.value !== id.capital) capitalIn.value = id.capital;
      titleSel.value = id.title;
      renderPreview();
      colorRow.replaceChildren(...t.colors.map((c) => swatch(c, c === id.color, () => {
        // The flag's main colour follows the empire colour unless it was set apart.
        const followFlag = id.flag.colors[0] === id.color;
        set({ color: c, flag: followFlag ? { ...id.flag, colors: [c, id.flag.colors[1], id.flag.colors[2]] } : id.flag });
      }, `Empire colour ${c}`)));
      fieldRow.replaceChildren(...FLAG_FIELDS.map((f) => h('button', { class: `flag-tile ${f.id === id.flag.field ? 'active' : ''}`, title: f.name, 'aria-label': `Pattern: ${f.name}`, onclick: () => setFlag({ field: f.id }) },
        flagEl({ ...id.flag, field: f.id, emblem: 'none' }, 42))));
      emblemRow.replaceChildren(...FLAG_EMBLEMS.map((e) => h('button', { class: `flag-tile ${e.id === id.flag.emblem ? 'active' : ''}`, title: e.name, 'aria-label': `Emblem: ${e.name}`, onclick: () => setFlag({ emblem: e.id }) },
        flagEl({ ...id.flag, field: 'solid', emblem: e.id }, 42))));
      styleRow.replaceChildren(...SHIP_STYLES.map((s) => h('button', { class: `style-pick ${s.id === id.shipStyle ? 'active' : ''}`, 'aria-pressed': s.id === id.shipStyle ? 'true' : 'false', onclick: () => set({ shipStyle: s.id }) },
        h('b', {}, s.name), h('small', {}, s.blurb))));
      flagColorRows.forEach((row, i) => row.replaceChildren(...t.flagColors.map((c) =>
        swatch(c, c === id.flag.colors[i], () => setFlagColor(i as 0 | 1 | 2, c), `${['Field', 'Second', 'Emblem'][i]} colour ${c}`))));
    };

    const done = (result: EmpireIdentity | null) => { el.remove(); resolve(result); };
    const submit = () => {
      const clean = cleanIdentity(id, t);
      if (!clean) { error.hidden = false; error.textContent = 'Give your empire a name.'; nameIn.focus(); return; }
      done(clean);
    };

    // A group, not a <label>: a label forwards clicks to its first control, which would undo every pick.
    const field = (label: string, ...control: Array<Node | string>) => h('div', { class: 'founding-field', role: 'group', 'aria-label': label }, h('span', { class: 'eyebrow' }, label), ...control);
    const el = h('div', { class: 'founding', role: 'dialog', 'aria-modal': 'true', 'aria-label': mode === 'found' ? 'Found your empire' : 'Edit your empire' },
      h('div', { class: 'founding-card frame' },
        h('header', {},
          h('span', { class: 'eyebrow' }, mode === 'found' ? 'A new empire' : 'Empire'),
          h('h2', {}, mode === 'found' ? 'Found your empire' : 'Edit your empire'),
          h('p', { class: 'muted' }, mode === 'found'
            ? 'Choose how the galaxy will know you. Every player sees your name, colours and flag on the map. You can change them later from the Empire panel.'
            : 'Every player sees your name, colours and flag on the map.')),
        h('div', { class: 'founding-grid' },
          preview,
          h('div', { class: 'founding-form' },
            field('Empire name', h('div', { class: 'row' }, nameIn,
              h('button', { class: 'icon-btn', title: 'Suggest a name', 'aria-label': 'Suggest a name', onclick: (e: Event) => { e.preventDefault(); set({ name: randomEmpireName(rng, t) }); } }, icon('dice')))),
            field('Ruler', h('div', { class: 'row' }, titleSel, rulerIn)),
            field('Capital world', capitalIn),
            field('Empire colour', colorRow),
            field('Flag pattern', fieldRow),
            field('Emblem', emblemRow),
            field('Flag colours', h('div', { class: 'flag-colors' },
              h('small', { class: 'muted' }, 'Field'), flagColorRows[0],
              h('small', { class: 'muted' }, 'Second'), flagColorRows[1],
              h('small', { class: 'muted' }, 'Emblem'), flagColorRows[2])),
            h('button', { class: 'btn ghost', onclick: (e: Event) => { e.preventDefault(); setFlag(randomFlag(rng, t, id.color)); } }, icon('dice'), ' Random flag'),
            // Your race's own way of building ships: research unlocks the others to mix in later.
            mode === 'found' ? field('Ship style', h('small', { class: 'muted' }, 'Your race builds ships this way from the start. Research unlocks the other styles, which you can mix in to make your ships your own.'), styleRow) : '')),
        error,
        h('footer', {},
          mode === 'edit' ? h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel') : '',
          h('button', { class: 'btn primary', onclick: submit }, mode === 'found' ? 'Found empire' : 'Save'))));
    el.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing here must not drive the map's keyboard shortcuts
      if (e.key === 'Escape' && mode === 'edit') done(null);
    });
    render();
    document.body.append(el);
    nameIn.focus();
    nameIn.select();
  });
}
