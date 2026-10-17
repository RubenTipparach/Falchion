import type { BattleLogEntry, ShipTally } from '../core/combat/BattleLog';
import { RESOURCES } from '../content/resources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { h } from './dom';
import { icon } from './icons';

const nameOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)?.name ?? id;
const KIND: Record<BattleLogEntry['kind'], string> = { raid: 'Raid', sea: 'Battle at sea', pursuit: 'Pursuit', assault: 'Assault' };
const OUTCOME: Record<BattleLogEntry['outcome'], [string, 'good' | 'bad' | 'even']> = {
  won: ['Won', 'good'], lost: ['Lost', 'bad'], draw: ['Standstill', 'even'], ongoing: ['Fighting', 'even'], plundered: ['Plundered', 'bad'],
};

// ── What the player last read (kept in this browser: it is not game state) ──
const SEEN_KEY = 'falchion.battleLogSeen';
export const BATTLE_LOG_SEEN_EVENT = 'falchion:battlelog-seen';
export function lastSeenBattle(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
export function markBattlesSeen(log: readonly BattleLogEntry[] | undefined): void {
  const top = log?.[0]?.id;
  if (!top || top === lastSeenBattle()) return;
  try {
    localStorage.setItem(SEEN_KEY, top);
  } catch {
    // Storage blocked: the badge just stays until the next read.
  }
  window.dispatchEvent(new Event(BATTLE_LOG_SEEN_EVENT));
}

export interface BattleLogOptions {
  readonly onlyAttacks: boolean;
  readonly setOnlyAttacks: (on: boolean) => void;
  /** The battle at sea a fleet is still fighting (Watch), if any. */
  readonly watchable: (fleetId: string) => boolean;
  readonly watch: (fleetId: string) => void;
  readonly locate: (e: BattleLogEntry) => void;
}

const tally = (t: ShipTally | undefined) => Object.entries(t ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${n} × ${nameOf(id)}`).join(', ');

/** War Room › Battle log: every raid on us, battle at sea and assault, newest first. */
export function battleLogView(log: readonly BattleLogEntry[] | undefined, o: BattleLogOptions): HTMLElement {
  const all = log ?? [];
  const shown = o.onlyAttacks ? all.filter((e) => e.attacked) : all;
  const attacks = all.filter((e) => e.attacked).length;
  return h('div', { class: 'battle-log' },
    h('div', { class: 'row-between' },
      h('p', { class: 'small muted' }, `${all.length} battle${all.length === 1 ? '' : 's'} logged, ${attacks} on us. The last ${60} are kept.`),
      h('label', { class: 'small toggle' }, h('input', { type: 'checkbox', checked: o.onlyAttacks, onchange: (ev: Event) => o.setOnlyAttacks((ev.target as HTMLInputElement).checked) }), ' Only attacks on us')),
    shown.length ? h('div', { class: 'log-list' }, ...shown.map((e) => entryView(e, o)))
      : h('div', { class: 'empty' }, h('b', {}, o.onlyAttacks ? 'No attacks on us yet' : 'No battles yet'), h('p', { class: 'muted' }, 'Raids on your worlds and fleets, battles at sea and your assaults are logged here.')));
}

function entryView(e: BattleLogEntry, o: BattleLogOptions): HTMLElement {
  const [label, tone] = OUTCOME[e.outcome];
  const lost = tally(e.lost), killed = tally(e.killed), boarded = tally(e.boarded), taken = tally(e.taken);
  const plunder = Object.entries(e.plunder ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([r, n]) => `${n} ${RESOURCES.find((x) => x.id === r)?.name.toLowerCase() ?? r}`).join(', ');
  const row = (k: string, v: string, cls = '') => (v ? h('div', { class: `log-row ${cls}` }, h('span', { class: 'muted' }, k), h('span', {}, v)) : '');
  return h('details', { class: `log-entry ${e.attacked ? 'attacked' : ''} ${tone}` },
    h('summary', {},
      h('span', { class: 'log-year mono' }, `Y${e.year}`),
      h('span', { class: 'log-what' },
        h('b', {}, `${KIND[e.kind]}${e.round ? ` · round ${e.round}` : ''}`),
        e.attacked ? h('span', { class: 'tag bad', title: 'We were attacked' }, 'ATTACKED') : '',
        h('span', { class: 'small muted' }, ` ${e.ours} vs ${e.foe}${e.foeEmpire && e.foeEmpire !== e.foe ? ` (${e.foeEmpire})` : ''} · ${e.place?.name ?? 'deep space'}`)),
      h('span', { class: `log-outcome ${tone}` }, label)),
    h('div', { class: 'log-body' },
      h('p', { class: 'small' }, e.summary),
      row('Our losses', lost || 'none', lost ? 'bad' : ''),
      row('Enemy destroyed', killed || 'none'),
      row('We boarded', boarded, 'good'),
      row('They boarded', taken, 'bad'),
      row('Plundered', plunder, 'bad'),
      h('div', { class: 'row' },
        e.place ? h('button', { class: 'btn', onclick: () => o.locate(e) }, icon('locate'), ' Locate') : '',
        e.fleetId && o.watchable(e.fleetId) ? h('button', { class: 'btn watch', onclick: () => o.watch(e.fleetId!) }, icon('battle'), ' Watch battle') : '')));
}
