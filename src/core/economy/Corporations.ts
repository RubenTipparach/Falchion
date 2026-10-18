import { CORPORATION_SECTORS } from '../../content/commerce';
import { Rng, hashSeed } from '../rng/Rng';

/**
 * NPC corporations (change commerce): two to each NPC faction, traded on the stock market by any
 * empire that knows the faction. Nothing about them is stored: who they are comes from the
 * faction's id, and their share price is a pure function of the year (a long swing and a short
 * one), so every empire sees the same price. Each pays a steady dividend.
 */
export interface Corporation {
  /** `${npcId}#${n}`. */
  readonly id: string;
  readonly npc: string;
  readonly name: string;
  readonly blurb: string;
  /** The price it swings around. */
  readonly base: number;
  /** Dividend per share per year. */
  readonly dividend: number;
  readonly long: { readonly period: number; readonly phase: number };
  readonly short: { readonly period: number; readonly phase: number };
}

/** A faction's corporations, named after its first word: "Vossk Mining Combine". */
export function corporationsOf(npc: { readonly id: string; readonly name: string }): Corporation[] {
  const rng = new Rng(hashSeed('corporations', npc.id));
  const word = npc.name.split(' ')[0];
  const sectors = [...CORPORATION_SECTORS];
  const out: Corporation[] = [];
  for (let n = 0; n < 2; n++) {
    const sector = sectors.splice(rng.int(0, sectors.length - 1), 1)[0];
    const base = Math.round(rng.range(8, 40) * 100) / 100;
    out.push({
      id: `${npc.id}#${n}`, npc: npc.id, name: `${word} ${sector.word}`, blurb: sector.blurb, base,
      dividend: Math.round(base * rng.range(0.002, 0.006) * 1000) / 1000,
      long: { period: rng.range(300, 900), phase: rng.next() },
      short: { period: rng.range(60, 200), phase: rng.next() },
    });
  }
  return out;
}

/** A corporation's share price in a year. */
export function corpPrice(c: Corporation, year: number): number {
  const wave = (w: { period: number; phase: number }) => Math.sin(2 * Math.PI * (year / w.period + w.phase));
  return Math.max(0.5, Math.round(c.base * (1 + 0.3 * wave(c.long) + 0.1 * wave(c.short)) * 100) / 100);
}

/** Corporation ids are `${npcId}#${n}`: the faction it belongs to. */
export const corpNpc = (id: string): string => id.slice(0, id.lastIndexOf('#'));
