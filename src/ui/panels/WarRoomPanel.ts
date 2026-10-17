import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { ALIEN_TARGETS } from '../../content/aliens';
import { DOCTRINES, SHIP_CLASSES } from '../../content/shipClasses';
import type { Squadron } from '../../core/combat/Combat';
import { BAND_MULT } from '../../core/combat/Combat';
import { Drawer } from '../Drawer';
import type { CombatOutcome, FleetGroup, GameActions, GameQueries } from '../GameActions';
import { locateButton, storesView } from '../widgets';
import { firepower } from '../../core/fleet/Logistics';
import { specOf } from '../../content/logistics';
import { clear, h } from '../dom';

const nameOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)?.name ?? id;
const docOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)?.doctrine ?? 'civilian';

/** Automated, deterministic combat against alien fleets and planets. */
export class WarRoomPanel extends Drawer {
  private targetId = ALIEN_TARGETS[0].id;
  private committed: Record<string, number> = {};
  private groupId: string | null = null;
  private outcome: CombatOutcome | null = null;
  private readonly left = h('div', { class: 'war-left' });
  private readonly right = h('div', { class: 'war-right' });

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries) {
    super('war', 'War Room', 'Combat is automated and deterministic, and only ships on station at the target can fight. Ammunition sets firepower: rearm in a friendly system.', true);
    this.body.append(h('div', { class: 'war' }, this.left, this.right));
    store.subscribe((s, prev) => {
      if (!this.opened) return;
      if (s.economy.roster !== prev.economy.roster || s.engaged !== prev.engaged || s.loadouts !== prev.loadouts || s.turn !== prev.turn) { this.resetCommit(); this.render(); }
    });
  }

  protected onOpen(): void {
    this.resetCommit();
    this.render();
  }

  /** Groups on station at the current target. */
  private groupsHere(): FleetGroup[] {
    return this.q.groupsAt(this.q.targetStar(this.targetId)).filter((g) => g.ships.some((x) => SHIP_CLASSES.find((c) => c.id === x.classId)!.attack > 0));
  }

  private group(): FleetGroup | null {
    const here = this.groupsHere();
    return here.find((g) => g.id === this.groupId) ?? here[0] ?? null;
  }

  private resetCommit(): void {
    this.committed = {};
    const g = this.group();
    this.groupId = g?.id ?? null;
    for (const x of g?.ships ?? []) {
      const c = SHIP_CLASSES.find((y) => y.id === x.classId)!;
      if (c.role === 'combat' || c.role === 'capital') this.committed[c.id] = x.count;
    }
  }

  private render(): void {
    const s = this.store.state;
    const target = ALIEN_TARGETS.find((t) => t.id === this.targetId)!;
    const star = this.q.targetStar(this.targetId);
    const group = this.group();
    const here = this.groupsHere();
    const roster: Record<string, number> = Object.fromEntries((group?.ships ?? []).map((x) => [x.classId, x.count]));
    const warships = SHIP_CLASSES.filter((c) => (c.role === 'combat' || c.role === 'capital') && roster[c.id]);
    const commit = () => Object.entries(this.committed).filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
    const fireNote = h('p', { class: 'small muted' });
    const updateFire = () => {
      if (!group) return;
      const f = firepower(group.stores.ammo, commit(), specOf);
      fireNote.textContent = `Firepower ${Math.round(f.factor * 100)}% · this battle uses ${f.spent} ammunition`;
      fireNote.className = `small ${f.factor < 1 ? 'red' : 'muted'}`;
    };
    clear(this.left);
    this.left.append(
      h('h4', {}, 'Target'),
      h('div', { class: 'target-list' }, ...ALIEN_TARGETS.map((t) => h('button', { class: `option ${t.id === this.targetId ? 'active' : ''}`, onclick: () => { this.targetId = t.id; this.outcome = null; this.groupId = null; this.resetCommit(); this.render(); } },
        h('b', {}, t.name), h('span', {}, `${t.owner} · ${t.kind === 'planet' ? 'planetary assault' : 'fleet battle'} · at ${this.q.targetStar(t.id).name}`), h('small', { class: 'muted' }, t.blurb)))),
      h('div', { class: 'row-between' }, h('span', { class: 'small' }, `Target location: `, h('b', {}, star.name)),
        locateButton(`Locate ${star.name}`, () => { this.actions.select(star); this.actions.flyTo(star, true); })),
      h('h4', {}, 'Enemy order of battle'),
      h('ul', { class: 'plain oob' }, ...(target.kind === 'fleet' ? target.fleet!.ships : target.planet!.garrison.ships).map((x) => h('li', {}, h('span', { class: 'doc-dot', style: `--doc:${DOCTRINES[docOf(x.classId)].color}` }), `${x.count} × ${nameOf(x.classId)}`)),
        target.planet ? h('li', { class: 'muted' }, `Planetary defence ${target.planet.defense} · garrison troops ${target.planet.troops}`) : null),
      h('h4', {}, 'Strike group'),
      here.length > 1 ? h('div', { class: 'row' }, ...here.map((g) => h('button', { class: `chip ${g.id === group?.id ? 'active' : ''}`, onclick: () => { this.groupId = g.id; this.resetCommit(); this.render(); } }, g.name))) : '',
      group ? h('div', {}, h('div', { class: 'small' }, h('b', {}, group.name), ` · on station at ${star.name}`), storesView(group)) : '',
      !group ? h('div', { class: 'notice warn' }, `No warships on station at ${star.name}. Send a strike group from the Fleets panel: select ${star.name} on the map, then launch or redirect a fleet.`,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { this.actions.select(star); this.actions.openPanel('fleets'); } }, 'Open Fleets with this target'))) : '',
      warships.length ? h('div', { class: 'commit' }, ...warships.map((c) => {
        const input = h('input', { type: 'range', min: 0, max: roster[c.id], step: 1, value: this.committed[c.id] ?? 0, id: `commit-${c.id}` }) as HTMLInputElement;
        const out = h('output', { class: 'mono' }, String(this.committed[c.id] ?? 0));
        input.addEventListener('input', () => { this.committed[c.id] = Number(input.value); out.textContent = input.value; updateFire(); });
        return h('label', { class: 'slider' }, h('span', {}, h('span', { class: 'doc-dot', style: `--doc:${DOCTRINES[c.doctrine].color}` }), c.name), input, out);
      })) : '',
      fireNote,
      h('button', { class: 'btn primary wide', disabled: !group || !warships.length || s.engaged.includes(this.targetId), onclick: () => this.fight() },
        s.engaged.includes(this.targetId) ? 'Already engaged this year' : target.kind === 'planet' ? 'Launch assault' : 'Engage'),
      h('h4', {}, 'Doctrine counters'),
      this.matrix(),
    );
    updateFire();
    clear(this.right);
    this.right.append(this.outcome ? this.report(this.outcome) : h('div', { class: 'empty' }, h('b', {}, 'No battle yet'), h('p', { class: 'muted' }, 'Pick a target and a strike group, then engage. Results are deterministic for this year, so the same fight always plays out the same way.')));
  }

  private fight(): void {
    const ships: Squadron[] = Object.entries(this.committed).filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
    if (!this.groupId) return;
    this.outcome = this.actions.engage(this.targetId, ships, this.groupId);
    this.render();
  }

  private matrix(): HTMLElement {
    const docs = ['long', 'short', 'barrage', 'siege', 'suppression', 'capture'] as const;
    return h('table', { class: 'data compact' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Doctrine'), h('th', { class: 'num' }, 'Long'), h('th', { class: 'num' }, 'Mid'), h('th', { class: 'num' }, 'Short'), h('th', {}, 'Weak vs'))),
      h('tbody', {}, ...docs.map((d) => h('tr', {},
        h('td', {}, h('span', { class: 'doc-dot', style: `--doc:${DOCTRINES[d].color}` }), DOCTRINES[d].name),
        ...(['long', 'medium', 'short'] as const).map((b) => h('td', { class: `num mono heat`, style: `--v:${Math.min(1, BAND_MULT[d][b] / 1.7)}` }, `×${BAND_MULT[d][b].toFixed(1)}`)),
        h('td', { class: 'small muted' }, DOCTRINES[d].weak)))));
  }

  private report(o: CombatOutcome): HTMLElement {
    const good = /Victory|captured/.test(o.summary);
    const wrap = h('div', { class: 'battle' }, h('div', { class: `verdict ${good ? 'good' : 'bad'}` }, o.summary));
    const battle = o.kind === 'fleet' ? o.result : o.result.space;
    if (battle) {
      const max = Math.max(1, ...battle.rounds.flatMap((r) => r.damage));
      wrap.append(h('h4', {}, 'Space battle'),
        h('div', { class: 'rounds' }, ...battle.rounds.map((r) => h('div', { class: 'round' },
          h('span', { class: 'rn mono' }, `R${r.round}`),
          h('span', { class: `band ${r.band}` }, r.band),
          h('span', { class: 'bars' },
            h('span', { class: 'bar me', style: `width:${(r.damage[0] / max) * 100}%` }, h('em', {}, String(r.damage[0]))),
            h('span', { class: 'bar foe', style: `width:${(r.damage[1] / max) * 100}%` }, h('em', {}, String(r.damage[1])))),
          h('span', { class: 'loss mono' }, `${r.losses[0] ? `−${r.losses[0]}` : '0'} / ${r.losses[1] ? `−${r.losses[1]}` : '0'}`),
          r.notes.length ? h('span', { class: 'note' }, r.notes.join(' · ')) : null))),
        h('p', { class: 'legend small muted' }, h('span', { class: 'key me' }), 'Your damage  ', h('span', { class: 'key foe' }), 'Enemy damage  · losses shown as yours / theirs'));
      const caps = battle.captured[0];
      if (caps.length) wrap.append(h('p', { class: 'good-note' }, `Captured: ${caps.map((c) => `${c.count} × ${nameOf(c.classId)}`).join(', ')}. Reverse engineering shards added to their unlock technologies.`));
    }
    if (o.kind === 'planet') {
      const a = o.result;
      if (a.bombardment.length) {
        wrap.append(h('h4', {}, 'Bombardment'), h('table', { class: 'data compact' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Round'), h('th', { class: 'num' }, 'Damage'), h('th', { class: 'num' }, 'Defence left'), h('th', { class: 'num' }, 'Ships lost'))),
          h('tbody', {}, ...a.bombardment.map((b) => h('tr', {}, h('td', {}, String(b.round)), h('td', { class: 'num mono' }, String(b.damage)), h('td', { class: 'num mono' }, String(b.defenseLeft)), h('td', { class: 'num mono' }, String(b.lost)))))));
      }
      if (a.phaseReached === 'ground') wrap.append(h('h4', {}, 'Ground assault'), h('p', {}, `${a.troopsLanded} troops landed against ${a.troopsNeeded} needed.`));
    }
    return wrap;
  }
}
