/**
 * Bloom Points — the port of backend/bloom.py.
 *
 * The one place a number is allowed to live. Weighted toward depth rather than
 * frequency: closing a loop is worth more than turning up, and every source has a
 * daily cap so the total cannot be ground out.
 *
 * The distance to the next level is withheld until the user is inside the last 20%
 * of it, which is the goal gradient: a bar that is nearly full pulls, a bar that is
 * barely started just reports.
 */

import * as companion from './companion';
import { streakDay } from './streak';
import * as ritual from './ritual';

export const AWARDS: Record<string, { bp: number; cap: number; label: string }> = {
  call: { bp: 20, cap: 40, label: 'a call' },
  memory_saved: { bp: 15, cap: 45, label: 'something worth remembering' },
  memory_edited: { bp: 10, cap: 30, label: 'correcting what she remembers' },
  loop_resolved: { bp: 25, cap: 25, label: 'closing the loop' },
  quest: { bp: 15, cap: 45, label: 'a daily quest' },
  ritual_hit: { bp: 20, cap: 20, label: 'showing up at your time' },
  journey_node: { bp: 40, cap: 40, label: 'a journey step' },
  moment_kept: { bp: 10, cap: 20, label: 'keeping a moment' },
};

export const MAX_LEVEL = 50;
const CURVE_BASE = 45;
const CURVE_EXP = 0.8;
export const HINT_WITHIN = 0.2;
export const DOUBLE_MULTIPLIER = 2;

export const BANDS: Array<[number, number, string]> = [
  [1, 5, 'Garden capacity, first cosmetics'],
  [6, 15, 'Voices, garden themes, mood presets'],
  [16, 30, 'Seasonal flowers, journey slots'],
  [31, 50, 'Rare species, the Long Year track, prestige cosmetics'],
];

function toNext(level: number): number {
  return Math.floor(CURVE_BASE * level ** CURVE_EXP);
}

/** (level, points into this level, points needed for the next). */
export function levelFor(total: number): [number, number, number] {
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const need = toNext(level);
    if (total - spent < need) return [level, total - spent, need];
    spent += need;
    level += 1;
  }
  return [MAX_LEVEL, total - spent, 0];
}

export function bandFor(level: number): string {
  for (const [lo, hi, text] of BANDS) {
    if (level >= lo && level <= hi) return text;
  }
  return BANDS[BANDS.length - 1][2];
}

type DayState = { day: string; earned: Record<string, number> };

async function dayState(): Promise<DayState> {
  const p = await companion.profile();
  const s = p.bloom_day as unknown as DayState | null;
  if (!s || s.day !== streakDay()) return { day: streakDay(), earned: {} };
  return { day: s.day, earned: s.earned ?? {} };
}

/** Inside the user's own ritual window, points double. */
export async function isDouble(): Promise<boolean> {
  return (await ritual.anchorNow()) !== null;
}

/**
 * Grant points for something that happened. Returns what was actually granted, and
 * 0 when the source is unknown or its daily cap is spent — which is how the number
 * stays un-grindable.
 */
export async function award(source: string, count = 1): Promise<number> {
  const rule = AWARDS[source];
  if (!rule || count <= 0) return 0;

  const state = await dayState();
  const earned = { ...state.earned };
  const already = earned[source] ?? 0;
  const room = rule.cap - already;
  if (room <= 0) return 0;

  const gross = Math.min(rule.bp * count, room);
  if (gross <= 0) return 0;
  earned[source] = already + gross;

  const granted = gross * ((await isDouble()) ? DOUBLE_MULTIPLIER : 1);
  const p = await companion.profile();
  await companion.update({
    bloom_points: (p.bloom_points ?? 0) + granted,
    bloom_day: { day: streakDay(), earned } as unknown as Record<string, unknown>,
  });
  return granted;
}

/**
 * A level reached since this was last read, or null. A level-up is a scene, not a
 * toast, so it is read at call open and she can mention it herself.
 */
export async function takeLevelUp(): Promise<{ level: number; band: string } | null> {
  const p = await companion.profile();
  const [level] = levelFor(p.bloom_points ?? 0);
  const seen = (p.bloom_today ?? 0) as number;
  if (level <= seen) return null;
  await companion.update({ bloom_today: level });
  return { level, band: bandFor(level) };
}

export async function status(): Promise<Record<string, unknown>> {
  const p = await companion.profile();
  const total = p.bloom_points ?? 0;
  const [level, into, need] = levelFor(total);
  const close = Boolean(need) && need - into <= need * HINT_WITHIN;
  return {
    points: total,
    level,
    band: bandFor(level),
    max_level: MAX_LEVEL,
    // Only populated near the threshold; the UI shows nothing otherwise.
    to_next: close ? need - into : null,
    double: await isDouble(),
  };
}
