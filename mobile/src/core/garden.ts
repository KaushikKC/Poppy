/**
 * The garden — the port of backend/garden.py.
 *
 * One flower per call: a bud for turning up, a bloom for a call that had something
 * real in it. Both stored the same way, so a bud is never a failure, just a smaller
 * thing that happened.
 *
 * Note what this deliberately does not return: no count, no total, no level, no
 * percentage. Every number lives on the other surface. The moment one appears here
 * the user starts gardening for a score instead of talking.
 */

import * as companion from './companion';
import { streakDay } from './streak';

export const BUD = 'bud';
export const BLOOM = 'bloom';

export const KINDS: Record<
  string,
  { label: string; petals: number; hue: string; rare?: boolean }
> = {
  vent: { label: 'vent', petals: 5, hue: '#c2456b' },
  hype: { label: 'hype', petals: 8, hue: '#f2913c' },
  wind: { label: 'wind down', petals: 6, hue: '#5aa9d6' },
  plan: { label: 'plan', petals: 4, hue: '#63a85b' },
  talk: { label: 'talk', petals: 6, hue: '#e0554f' },
  ritual: { label: 'ritual', petals: 7, hue: '#8b7bd8' },
  // The Long Year. Obtainable exactly one way, by being here a year, which is what
  // makes it worth anything. Never planted by an ordinary call.
  longyear: { label: 'the long year', petals: 12, hue: '#e8b53f', rare: true },
};

export const DEFAULT_KIND = 'talk';
const MAX_FLOWERS = 800;

export type Flower = {
  id: string;
  kind: string;
  state: string;
  date: string;
  season: string;
  seed: number;
  x?: number;
  y?: number;
  label?: string;
};

/** Seasons shift the garden with the real calendar: landmarks made visual. */
export function seasonFor(when = new Date()): string {
  const m = when.getMonth() + 1;
  if ([12, 1, 2].includes(m)) return 'winter';
  if ([3, 4, 5].includes(m)) return 'spring';
  if ([6, 7, 8].includes(m)) return 'summer';
  return 'autumn';
}

async function flowers(): Promise<Flower[]> {
  return ((await companion.profile()).garden ?? []) as unknown as Flower[];
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function plant(
  kind: string | null = null,
  bloomed = false,
  when = new Date(),
): Promise<Flower> {
  const k = kind && KINDS[kind] ? kind : DEFAULT_KIND;
  const flower: Flower = {
    id: newId(),
    kind: k,
    state: bloomed ? BLOOM : BUD,
    date: streakDay(when),
    season: seasonFor(when),
    // Stable per-flower jitter so the field looks grown rather than plotted, and
    // looks the same every time it is drawn.
    seed: Math.floor(Math.random() * 10000),
  };
  const all = [...(await flowers()), flower];
  await companion.update({ garden: all.slice(-MAX_FLOWERS) as unknown as Record<string, unknown>[] });
  return flower;
}

/** Turn today's bud into a bloom, if there is one. */
export async function bloomLast(when = new Date()): Promise<Flower | null> {
  const all = await flowers();
  const today = streakDay(when);
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].date === today) {
      all[i].state = BLOOM;
      await companion.update({ garden: all as unknown as Record<string, unknown>[] });
      return all[i];
    }
  }
  return null;
}

/** The rare one. Planted once, and only by having been here a year. */
export async function plantLongYear(when = new Date()): Promise<Flower | null> {
  const p = await companion.profile();
  if (p.long_year_marked) return null;
  const flower = await plant('longyear', true, when);
  await companion.update({ long_year_marked: true });
  return flower;
}

/** Drag-to-arrange: {id: {x, y}} in normalised 0..1 coordinates. */
export async function arrange(
  positions: Record<string, { x: number; y: number }>,
): Promise<number> {
  const all = await flowers();
  let moved = 0;
  for (const f of all) {
    const pos = positions[f.id];
    if (!pos) continue;
    const x = Number(pos.x);
    const y = Number(pos.y);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    f.x = Math.max(0, Math.min(1, x));
    f.y = Math.max(0, Math.min(1, y));
    moved++;
  }
  if (moved) await companion.update({ garden: all as unknown as Record<string, unknown>[] });
  return moved;
}

/** Naming a day: the user's own words on their own history. */
export async function label(id: string, text: string): Promise<Flower | null> {
  const all = await flowers();
  const f = all.find((x) => x.id === id);
  if (!f) return null;
  const clean = (text || '').trim().slice(0, 60);
  if (clean) f.label = clean;
  else delete f.label;
  await companion.update({ garden: all as unknown as Record<string, unknown>[] });
  return f;
}

export async function labelledCount(): Promise<number> {
  return (await flowers()).filter((f) => f.label).length;
}

export async function state(limit = 400): Promise<Record<string, unknown>> {
  const all = (await flowers()).slice(-limit);
  return {
    flowers: all,
    season: seasonFor(),
    kinds: KINDS,
    // True only before anything has ever grown, so the UI can stay hidden rather
    // than render an empty plot: first sight is never zero.
    empty: all.length === 0,
  };
}

export async function yearInReview(when = new Date()): Promise<Record<string, unknown>> {
  const all = await flowers();
  const year = String(when.getFullYear());
  const mine = all.filter((f) => f.date.startsWith(year));
  const byKind: Record<string, number> = {};
  for (const f of mine) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  return {
    year,
    total: mine.length,
    blooms: mine.filter((f) => f.state === BLOOM).length,
    by_kind: byKind,
    labelled: mine.filter((f) => f.label).length,
    rare: mine.filter((f) => KINDS[f.kind]?.rare).length,
  };
}
