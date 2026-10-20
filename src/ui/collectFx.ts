import type { Collected } from '../core/encounters/PlanetCache';
import type { Card } from '../core/encounters/types';
import type { Resource } from '../content/resources';
import { fmt } from './dom';
import { icon, resourceIcon } from './icons';

/**
 * Collect with a flourish: run `collect`, then fly what it gathered from `source` (the planet,
 * or the button) up into the top bar. Each resource streams into its counter, which counts up
 * as the pieces land; crate cards fly to the tab that uses them. The rect is taken first,
 * because collecting re-renders the card the source sits in.
 */
export function collectWithFx(source: Element, collect: () => Collected | null): void {
  const from = source.getBoundingClientRect();
  const got = collect();
  if (got) flyCollected(from, got);
}

const shown = (el: Element): boolean => el.getBoundingClientRect().width > 0;

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function flyCollected(from: DOMRect, got: Collected): void {
  let delay = 0;
  for (const [r, n] of Object.entries(got.haul) as Array<[Resource, number]>) {
    if (!n) continue;
    flyResource(from, r, n, delay);
    delay += 140;
  }
  const tabs = new Map<string, Card[]>();
  for (const c of got.cards) {
    if (c.type === 'materials') continue;
    const tab = c.type === 'shards' ? 'research' : 'shipyard';
    tabs.set(tab, [...(tabs.get(tab) ?? []), c]);
  }
  for (const [tab, cards] of tabs) {
    flyPieces(from, document.querySelector(`.topbar [data-tab="${tab}"]`), () => icon(tab === 'research' ? 'research' : 'shipyard'), Math.min(cards.length + 2, 6), delay, () => {}, `+${cards.length} card${cards.length > 1 ? 's' : ''}`);
    delay += 140;
  }
}

function flyResource(from: DOMRect, r: Resource, n: number, delay: number): void {
  // Resources without a counter on show (none, or hidden on a narrow screen) land on the Empire tab.
  const stat = document.querySelector<HTMLElement>(`.topbar .stat[data-resource="${r}"]`);
  const target = stat && shown(stat) ? stat : document.querySelector<HTMLElement>('.topbar [data-tab="empire"]');
  const value = target?.querySelector<HTMLElement>('.stat-value');
  const now = Number(target?.dataset.value);
  const counting = value && Number.isFinite(now);
  const pieces = Math.max(3, Math.min(10, Math.round(2 * Math.sqrt(n))));
  if (counting) value.textContent = fmt(now - n);
  flyPieces(from, target, () => resourceIcon(r, 20), pieces, delay, (landed) => {
    if (counting) value.textContent = fmt(now - n + (n * landed) / pieces);
  }, `+${fmt(n)}`);
}

/** Fly `count` pieces from `from` to `target`, calling `onLand` with how many have landed. */
function flyPieces(from: DOMRect, target: Element | null, make: () => HTMLElement, count: number, delay: number, onLand: (landed: number) => void, label: string): void {
  if (!target) return;
  if (reduced()) {
    onLand(count);
    land(target, label);
    return;
  }
  const to = target.getBoundingClientRect();
  const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
  const spread = Math.max(24, Math.min(from.width, from.height) * 0.4);
  let landed = 0;
  for (let i = 0; i < count; i++) {
    const el = make();
    el.classList.add('loot-fly');
    document.body.append(el);
    // Burst out of the planet, hang a moment, then get sucked up along a curve, speeding up.
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.8;
    const bx = cx + Math.cos(a) * spread, by = cy + Math.sin(a) * spread;
    const mx = bx + (tx - bx) * 0.35 + (Math.random() - 0.5) * 120, my = Math.min(by, ty) - 40 - Math.random() * 60;
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
    const anim = el.animate([
      { transform: at(cx, cy, 0.2), opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: at(bx, by, 1.25), opacity: 1, offset: 0.28, easing: 'linear' },
      { transform: at(bx, by - 6, 1.1), opacity: 1, offset: 0.4, easing: 'cubic-bezier(.55,0,.9,.4)' },
      { transform: at(mx, my, 0.95), opacity: 1, offset: 0.72, easing: 'cubic-bezier(.5,0,1,.6)' },
      { transform: at(tx, ty, 0.45), opacity: 0.85 },
    ], { duration: 1100 + Math.random() * 250, delay: delay + i * 70, fill: 'both' });
    anim.onfinish = () => {
      el.remove();
      landed++;
      onLand(landed);
      target.classList.remove('loot-gain');
      void (target as HTMLElement).offsetWidth;
      target.classList.add('loot-gain');
      if (landed === count) land(target, label);
    };
  }
}

/** Labels showing under each target, so several stack instead of overlapping. */
const showing = new WeakMap<Element, number>();

/** A "+n" that drops in under the counter once everything has landed. */
function land(target: Element, label: string): void {
  const to = target.getBoundingClientRect();
  const row = showing.get(target) ?? 0;
  showing.set(target, row + 1);
  const tag = document.createElement('span');
  tag.className = 'loot-plus';
  tag.textContent = label;
  tag.style.left = `${to.left + to.width / 2}px`;
  tag.style.top = `${to.bottom + 4 + row * 16}px`;
  document.body.append(tag);
  tag.addEventListener('animationend', () => {
    tag.remove();
    showing.set(target, Math.max(0, (showing.get(target) ?? 1) - 1));
  });
}
