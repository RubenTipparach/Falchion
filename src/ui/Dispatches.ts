import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import { h } from './dom';
import { icon } from './icons';

/**
 * Newest-first feed of what happened: arrivals, research, battles. News about a battle whose
 * rounds were kept has a play button that replays it (change battle-replay).
 */
export class Dispatches {
  readonly el = h('section', { class: 'dispatches frame', 'aria-label': 'Dispatches' });
  private collapsed = false;
  private freshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(store: Store<GameState>, private readonly replay: (battleId: string) => void) {
    store.subscribe((s, prev) => {
      if (s.dispatches === prev.dispatches && s.battleLog === prev.battleLog) return;
      this.render(s);
      // On a phone the feed is hidden; news shows for a moment as a toast (CSS: .dispatches.fresh).
      if (s.dispatches[0] && s.dispatches[0] !== prev.dispatches[0]) this.flash();
    });
    this.render(store.state);
  }

  private flash(): void {
    this.el.classList.add('fresh');
    if (this.freshTimer) clearTimeout(this.freshTimer);
    this.freshTimer = setTimeout(() => this.el.classList.remove('fresh'), 4_500);
  }

  private render(s: GameState): void {
    const items = s.dispatches.slice(0, 7);
    this.el.replaceChildren(
      h('button', { class: 'disp-head', onclick: () => { this.collapsed = !this.collapsed; this.render(s); } },
        h('span', { class: 'eyebrow' }, 'Dispatches'), h('span', { class: 'muted small' }, this.collapsed ? 'Show' : 'Hide')),
      ...(this.collapsed ? [] : items.length
        ? items.map((d) => {
          // News from before dispatches named their battle: the entry it is the summary of, that year.
          const battle = s.battleLog?.find((e) => (d.battle ? e.id === d.battle : e.year === d.turn && (e.summary.includes(d.text) || d.text.includes(e.summary))) && e.records?.length);
          return h('div', { class: `disp ${d.tone ?? ''}` }, h('span', { class: 'disp-turn mono' }, `Y${d.turn}`), h('span', {}, d.text),
            battle ? h('button', { class: 'disp-replay', title: 'Replay this battle', 'aria-label': 'Replay this battle', onclick: () => this.replay(battle.id) }, icon('play')) : '');
        })
        : [h('p', { class: 'muted small' }, 'Set a research focus and send out your fleets: a year passes every minute.')]),
    );
  }
}
