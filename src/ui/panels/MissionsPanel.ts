import type { GameState } from '../../app/GameState';
import type { Store } from '../../app/Store';
import { SEATS, SEAT_BY_ID, SEEK_COST, type Seat } from '../../content/advisors';
import { CHAPTERS, MISSION_BY_ID } from '../../content/missions';
import type { Resource } from '../../content/resources';
import { ADVISOR_MAX, LEADER_MAX, NEW_COURT, advisorEffects, describeEffects, openSeats, xpToNext, type Advisor } from '../../core/empire/Court';
import { NEW_MISSIONS, type QuestDef, type Reward } from '../../core/missions/Missions';
import { clear, fmt, h } from '../dom';
import { Drawer } from '../Drawer';
import type { GameActions, GameQueries } from '../GameActions';
import { icon, resourceIcon, type IconName } from '../icons';

type Tab = 'missions' | 'quests' | 'court' | 'chronicle';
const TABS: Array<[Tab, string]> = [['missions', 'Story'], ['quests', 'Faction quests'], ['court', 'Court'], ['chronicle', 'Chronicle']];

/**
 * Missions and the court (change missions-and-court): the story's missions with their live
 * objectives, the favours neighbouring factions ask, the ruler's level and the advisors who
 * serve (and decide for you, when delegated), and a chronicle of what was done.
 */
export class MissionsPanel extends Drawer {
  private tab: Tab = 'missions';
  private readonly tabsEl = h('div', { class: 'seg' });
  private readonly content = h('div', { class: 'missions-content' });

  constructor(private readonly store: Store<GameState>, private readonly actions: GameActions, private readonly q: GameQueries) {
    super('missions', 'Missions', 'Your story, favours for your neighbours, and the court that serves you.');
    this.body.append(this.tabsEl, this.content);
    store.subscribe((s, prev) => {
      if (this.opened && (s.missions !== prev.missions || s.court !== prev.court || s.turn !== prev.turn || s.empire !== prev.empire)) this.render();
    });
  }

  protected onOpen(): void {
    // Something waiting on you opens where it is.
    const m = this.store.state.missions ?? NEW_MISSIONS;
    if (this.tab === 'missions' && !m.active.some((a) => !a.quest) && m.offers.length) this.tab = 'quests';
    this.render();
  }

  private render(): void {
    const m = this.store.state.missions ?? NEW_MISSIONS;
    const court = this.store.state.court ?? NEW_COURT;
    const count: Record<Tab, number> = { missions: m.active.filter((a) => !a.quest).length, quests: m.offers.length + m.active.filter((a) => a.quest).length, court: court.candidates.length, chronicle: 0 };
    clear(this.tabsEl);
    this.tabsEl.append(...TABS.map(([id, label]) => h('button', { class: `seg-btn ${this.tab === id ? 'active' : ''}`, onclick: () => { this.tab = id; this.render(); } }, label, count[id] ? h('span', { class: 'seg-count' }, String(count[id])) : '')));
    clear(this.content);
    if (this.tab === 'missions') this.renderStory();
    else if (this.tab === 'quests') this.renderQuests();
    else if (this.tab === 'court') this.renderCourt();
    else this.renderChronicle();
  }

  // ── Story ──

  private renderStory(): void {
    const m = this.store.state.missions ?? NEW_MISSIONS;
    const story = m.active.filter((a) => !a.quest);
    const chapter = Math.max(1, ...story.map((a) => MISSION_BY_ID[a.id]?.chapter ?? 1), ...m.done.map((id) => MISSION_BY_ID[id]?.chapter ?? 1));
    const ch = CHAPTERS[chapter];
    this.content.append(
      h('div', { class: 'chapter' }, h('span', { class: 'eyebrow' }, `Chapter ${roman(chapter)}`), h('h3', {}, ch?.name ?? ''), h('p', { class: 'small muted' }, ch?.blurb ?? '')),
      story.length
        ? h('div', { class: 'mission-list' }, ...story.map((a) => this.missionCard(a.id)))
        : h('p', { class: 'muted small' }, 'No story missions right now. Explore further and meet your neighbours: the story is uncovered as you go.'),
      h('p', { class: 'small muted' }, `${m.done.length} story missions done. Missions finished are claimed for you at the year's end, or now with Claim.`),
    );
  }

  private missionCard(id: string): HTMLElement {
    const def = this.q.missionDef(id);
    const progress = this.q.missionProgress(id);
    if (!def || !progress) return h('div');
    const quest = (def as QuestDef).npc ? (def as QuestDef) : null;
    const active = (this.store.state.missions ?? NEW_MISSIONS).active.find((a) => a.id === id);
    const giver = quest ? `The ${quest.npcName}` : def.giver === 'council' ? 'The Council' : SEAT_BY_ID[def.giver as Seat]?.name ?? '';
    return h('article', { class: `mission ${progress.complete ? 'complete' : ''}` },
      h('header', {},
        h('div', {}, h('span', { class: 'eyebrow' }, giver), h('h4', {}, def.title)),
        progress.complete ? h('button', { class: 'btn primary', onclick: () => this.actions.claimMission(id) }, 'Claim') : ''),
      h('p', { class: 'small brief' }, def.briefing),
      h('ul', { class: 'objectives' }, ...progress.objectives.map((o) =>
        h('li', { class: o.done ? 'done' : '' },
          h('span', { class: 'tick' }, o.done ? '✓' : ''),
          h('span', { class: 'otext' }, o.objective.text),
          h('span', { class: 'mono small' }, `${fmt(Math.floor(o.have))} / ${fmt(o.need)}`),
          h('span', { class: 'meter' }, h('i', { style: `width:${Math.round((100 * o.have) / Math.max(1, o.need))}%` }))))),
      h('div', { class: 'rewards' }, h('span', { class: 'small muted' }, 'Reward'), ...this.rewardChips(def.rewards, quest)),
      active?.expires !== undefined ? h('p', { class: 'small muted' }, `${fmt(active.expires - this.store.state.turn)} years left`) : '');
  }

  private rewardChips(r: Reward, quest: QuestDef | null): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const [res, n] of Object.entries(r.materials ?? {})) if (n) out.push(h('span', { class: 'reward' }, resourceIcon(res as Resource, 13), `+${fmt(n)}`));
    if (r.leaderXp) out.push(h('span', { class: 'reward' }, icon('empire'), `${r.leaderXp} ruler XP`));
    if (r.advisorXp) out.push(h('span', { class: 'reward' }, `${r.advisorXp} advisor XP`));
    if (r.shards) out.push(h('span', { class: 'reward' }, icon('shard'), `${r.shards} shards`));
    if (r.candidate) out.push(h('span', { class: 'reward' }, icon('players'), `a ${SEAT_BY_ID[r.candidate].name}`));
    if (r.standing && quest) out.push(h('span', { class: 'reward' }, icon('relations'), `+${r.standing} standing`));
    if (r.accord) out.push(h('span', { class: 'reward' }, icon('trade'), `+${r.accord.tradePct}% trade, ${r.accord.years} yr`));
    return out;
  }

  // ── Faction quests ──

  private renderQuests(): void {
    const m = this.store.state.missions ?? NEW_MISSIONS;
    const taken = m.active.filter((a) => a.quest);
    const turn = this.store.state.turn;
    this.content.append(
      h('p', { class: 'small muted' }, 'Factions you know ask favours now and then, more often the better you stand with them. A favour done raises your standing (better prices and fewer raids) and brings influence and faith.'),
      h('h4', { class: 'sec' }, 'Offers'),
      m.offers.length
        ? h('div', { class: 'mission-list' }, ...m.offers.map((o) => h('article', { class: 'mission offer' },
          h('header', {}, h('div', {}, h('span', { class: 'eyebrow' }, `The ${o.npcName}`), h('h4', {}, o.title))),
          h('p', { class: 'small brief' }, o.briefing),
          h('ul', { class: 'objectives' }, ...o.objectives.map((x) => h('li', {}, h('span', { class: 'tick' }), h('span', { class: 'otext' }, x.text)))),
          h('div', { class: 'rewards' }, h('span', { class: 'small muted' }, 'Reward'), ...this.rewardChips(o.rewards, o)),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => this.actions.acceptQuest(o.id) }, 'Accept'),
            h('button', { class: 'btn', onclick: () => this.actions.declineQuest(o.id) }, 'Decline'),
            h('span', { class: 'small muted' }, `Offer stands ${fmt(Math.max(0, o.offerEnds - turn))} more years`)))))
        : h('p', { class: 'muted small' }, m.offers.length === 0 && !this.q.factions().length ? 'Meet a neighbouring faction first: their envoys bring offers.' : 'No offers right now.'),
      h('h4', { class: 'sec' }, 'Under way'),
      taken.length ? h('div', { class: 'mission-list' }, ...taken.map((a) => this.missionCard(a.id))) : h('p', { class: 'muted small' }, 'None.'),
      m.accords.some((a) => a.until > turn)
        ? h('div', {}, h('h4', { class: 'sec' }, 'Accords in force'), ...m.accords.filter((a) => a.until > turn).map((a) => h('div', { class: 'row small' }, icon('trade'), h('span', {}, a.name), h('span', { class: 'mono muted' }, `+${a.effects.tradePct}% trade · ${fmt(a.until - turn)} yr`))))
        : '',
      h('p', { class: 'small muted' }, `${fmt(m.questsDone)} favours done.`),
    );
  }

  // ── Court ──

  private renderCourt(): void {
    const court = this.store.state.court ?? NEW_COURT;
    const L = court.leader;
    const filled = Object.keys(court.seats).length;
    const influence = this.store.state.empire.materials.influence ?? 0;
    this.content.append(
      h('div', { class: 'ruler' },
        h('div', { class: 'ruler-level' }, h('span', { class: 'eyebrow' }, 'Level'), h('b', {}, String(L.level))),
        h('div', { class: 'ruler-info' },
          h('h3', {}, this.q.rulerName()),
          L.level < LEADER_MAX
            ? h('div', { class: 'xp' }, h('span', { class: 'meter' }, h('i', { style: `width:${Math.round((100 * L.xp) / xpToNext(L.level, true))}%` })), h('span', { class: 'mono small muted' }, `${fmt(L.xp)} / ${fmt(xpToNext(L.level, true))} XP`))
            : h('span', { class: 'small muted' }, 'At the height of their power'),
          h('p', { class: 'small muted' }, `+${L.level} influence a year and +${L.level} approval with every faction. Keeps ${filled} of ${openSeats(L.level)} advisors${openSeats(L.level) < SEATS.length ? ` (one more every second level)` : ''}. Missions bring experience.`))),
      h('h4', { class: 'sec' }, 'Seats'),
      h('div', { class: 'seats' }, ...SEATS.map((seat) => {
        const a = court.seats[seat.id];
        const waiting = court.candidates.filter((c) => c.seat === seat.id);
        return h('section', { class: `seat ${a ? 'held' : ''}` },
          h('header', {}, icon(seat.icon as IconName), h('div', {}, h('b', {}, seat.name), h('span', { class: 'small muted' }, seat.domain))),
          a ? this.advisorCard(a) : h('p', { class: 'small muted' }, 'Empty.'),
          h('p', { class: 'small muted decides' }, h('b', {}, 'Delegated: '), seat.decides),
          ...waiting.map((c) => this.candidateRow(c, !!a || filled < openSeats(L.level))),
          h('button', { class: 'chip', disabled: influence < SEEK_COST, title: `Spend ${SEEK_COST} influence to find a candidate`, onclick: () => this.actions.seekAdvisor(seat.id) }, `Seek a ${seat.name} · ${SEEK_COST} INF`));
      })),
    );
  }

  private advisorCard(a: Advisor): HTMLElement {
    const seat = SEAT_BY_ID[a.seat];
    const trait = seat.traits.find((t) => t.id === a.trait);
    const bonus = advisorEffects(a).map(describeEffects).filter(Boolean).join(', ');
    return h('div', { class: 'advisor' },
      h('div', { class: 'row' }, h('b', {}, a.name), h('span', { class: 'pill' }, `Lv ${a.level}`), trait ? h('span', { class: 'small muted', title: trait.blurb }, trait.name) : '', a.origin ? h('span', { class: 'small muted' }, `of the ${a.origin}`) : ''),
      a.level < ADVISOR_MAX ? h('div', { class: 'xp' }, h('span', { class: 'meter' }, h('i', { style: `width:${Math.round((100 * a.xp) / xpToNext(a.level))}%` })), h('span', { class: 'mono small muted' }, `${a.xp} / ${xpToNext(a.level)} XP`)) : '',
      h('div', { class: 'small green' }, bonus),
      h('div', { class: 'row' },
        h('button', { class: `btn ${a.delegate ? 'on' : ''}`, 'aria-pressed': String(!!a.delegate), title: seat.decides, onclick: () => this.actions.delegate(a.seat, !a.delegate) }, a.delegate ? 'Deciding for you' : 'Delegate decisions'),
        h('button', { class: 'chip', onclick: () => this.actions.dismissAdvisor(a.seat) }, 'Dismiss')));
  }

  private candidateRow(c: Advisor, room: boolean): HTMLElement {
    const trait = SEAT_BY_ID[c.seat].traits.find((t) => t.id === c.trait);
    return h('div', { class: 'candidate' },
      h('span', { class: 'small' }, h('b', {}, c.name), ` · ${trait?.name ?? ''}${c.origin ? ` · of the ${c.origin}` : ''}`),
      h('span', { class: 'small muted' }, trait?.blurb ?? ''),
      h('button', { class: 'chip', disabled: !room, title: room ? '' : 'Your ruler cannot keep another advisor yet', onclick: () => this.actions.appointAdvisor(c.id) }, 'Appoint'));
  }

  // ── Chronicle ──

  private renderChronicle(): void {
    const m = this.store.state.missions ?? NEW_MISSIONS;
    this.content.append(m.record.length
      ? h('ol', { class: 'chronicle' }, ...m.record.map((r) => h('li', {}, h('span', { class: 'mono muted' }, fmt(r.turn)), h('span', {}, r.title), h('span', { class: 'small muted' }, r.chapter ? `Chapter ${roman(r.chapter)}` : 'Favour'))))
      : h('p', { class: 'muted small' }, 'Nothing yet. Every mission and favour you finish is written here.'));
  }
}

const roman = (n: number): string => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] ?? String(n);

