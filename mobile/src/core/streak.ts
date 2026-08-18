/**
 * The streak — the port of backend/streak.py.
 *
 * A run of days she was spoken to, with a freeze economy so a single missed day is
 * soft rather than a punishment, and a 48-hour repair window after a break.
 *
 * Two design rules carried over, both deliberate:
 *
 * `none` is a state, even though the design doc lists only five. Someone who has
 * never had a streak has not broken anything, and showing them a break — or worse,
 * offering to repair it — is both false and exactly the shame framing the doc rules
 * out.
 *
 * Freezes settle lazily. They are described as consumed at rollover, but there is no
 * 4am job on a phone that may not even be running, so they are applied the next time
 * anything reads the streak. The user-visible result is identical.
 */

import * as companion from './companion';

export const ROLLOVER_HOUR = 4;
export const MIN_CALL_SECONDS = 60;
export const FREEZE_EVERY_N_DAYS = 7;
export const MAX_FREEZES = 3;
export const FRAGMENTS_PER_FREEZE = 5;
export const AT_RISK_HOURS = 4;
export const REPAIR_WINDOW_HOURS = 48;
export const LONG_YEAR = 365;
export const LONG_YEAR_NEAR_DAYS = 30;
const MAX_HISTORY_DAYS = 400;

export type StreakState = 'none' | 'safe' | 'at_risk' | 'frozen' | 'repairable' | 'broken';

/** The streak day rolls at 4am, so a late-night call counts for the day just ending. */
export function streakDay(now = new Date()): string {
  const d = new Date(now.getTime());
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400_000);
}

function nextRollover(now = new Date()): Date {
  const r = new Date(now.getFullYear(), now.getMonth(), now.getDate(), ROLLOVER_HOUR);
  if (now.getHours() >= ROLLOVER_HOUR) r.setDate(r.getDate() + 1);
  return r;
}

/** Bring the streak up to date with the clock, spending freezes for missed days. */
async function settle(now = new Date()): Promise<companion.Profile> {
  const p = await companion.profile();
  const cur = parseDate(streakDay(now)) as Date;
  const last = parseDate(p.streak_last_date);
  if (!last || (p.current_streak ?? 0) <= 0) return p;

  const gap = dayDiff(cur, last);
  if (gap <= 1) return p; // met today, or today is still open

  const missed = gap - 1;
  const freezes = p.streak_freezes ?? 0;
  const changes: Partial<companion.Profile> = {};

  const covered = Math.min(missed, freezes);
  changes.streak_freezes = freezes - covered;
  if (covered > 0) {
    changes.streak_freeze_notice = (p.streak_freeze_notice ?? 0) + covered;
  }

  if (covered >= missed) {
    // Fully covered: the run continues. Covered days are recorded separately from
    // days they actually showed up for, so the week view can show them honestly as
    // covered rather than claiming they were there.
    const frozen = [...(p.streak_frozen_days ?? [])];
    for (let i = 1; i <= missed; i++) {
      const d = new Date(last.getTime());
      d.setDate(d.getDate() + i);
      frozen.push(isoDate(d));
    }
    changes.streak_frozen_days = [...new Set(frozen)].sort().slice(-MAX_HISTORY_DAYS);
    const yesterday = new Date(cur.getTime());
    yesterday.setDate(yesterday.getDate() - 1);
    changes.streak_last_date = isoDate(yesterday);
    changes.current_streak = (p.current_streak ?? 0) + missed;
  } else {
    // The run ends but stays repairable for 48h. The break is dated to the rollover
    // it actually happened at, not to the moment it was noticed: settlement is lazy,
    // so stamping "now" would restart the grace period every time the app opened and
    // a streak abandoned for a month would still offer repair.
    const firstUncovered = new Date(last.getTime());
    firstUncovered.setDate(firstUncovered.getDate() + covered + 1);
    const brokeAt = new Date(firstUncovered.getTime());
    brokeAt.setDate(brokeAt.getDate() + 1);
    brokeAt.setHours(ROLLOVER_HOUR, 0, 0, 0);
    changes.streak_broken_at = brokeAt.toISOString();
    changes.streak_broken_from = p.current_streak ?? 0;
    changes.current_streak = 0;
  }

  return Object.keys(changes).length ? companion.update(changes) : p;
}

function repairAvailable(p: companion.Profile, now: Date): boolean {
  if (!p.streak_broken_at || !p.streak_broken_from) return false;
  const when = new Date(p.streak_broken_at);
  if (Number.isNaN(when.getTime())) return false;
  if (now.getTime() - when.getTime() > REPAIR_WINDOW_HOURS * 3600_000) return false;
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return p.streak_repair_month !== month;
}

export async function state(now = new Date()): Promise<StreakState> {
  const p = await settle(now);
  const cur = streakDay(now);

  if (!p.streak_last_date && (p.current_streak ?? 0) <= 0) return 'none';
  if (p.streak_last_date === cur) return 'safe';
  if ((p.current_streak ?? 0) > 0) {
    if (p.streak_freeze_notice) return 'frozen';
    const hoursLeft = (nextRollover(now).getTime() - now.getTime()) / 3600_000;
    return hoursLeft <= AT_RISK_HOURS ? 'at_risk' : 'safe';
  }
  if (repairAvailable(p, now)) return 'repairable';
  return 'broken';
}

/** One freeze per 7 days of streak, capped. Never announced as a reward. */
async function grantFreezeIfEarned(p: companion.Profile): Promise<companion.Profile> {
  const streak = p.current_streak ?? 0;
  const mark = p.streak_freeze_mark ?? 0;
  if (Math.floor(streak / FREEZE_EVERY_N_DAYS) <= Math.floor(mark / FREEZE_EVERY_N_DAYS)) {
    return p;
  }
  return companion.update({
    streak_freezes: Math.min(MAX_FREEZES, (p.streak_freezes ?? 0) + 1),
    streak_freeze_mark: streak,
  });
}

export function qualifies(durationS = 0, questDone = false): boolean {
  return durationS >= MIN_CALL_SECONDS || questDone;
}

/** Record that today counted. Idempotent within a streak day. */
export async function recordActivity(now = new Date()): Promise<companion.Profile> {
  let p = await settle(now);
  const cur = streakDay(now);
  if (p.streak_last_date === cur) return p; // already counted today

  const last = parseDate(p.streak_last_date);
  const curDate = parseDate(cur) as Date;
  const consecutive = last !== null && dayDiff(curDate, last) === 1;

  const current = consecutive ? (p.current_streak ?? 0) + 1 : 1;
  p = await companion.update({
    streak_last_date: cur,
    current_streak: current,
    longest_streak: Math.max(p.longest_streak ?? 0, current),
    streak_broken_at: null,
    streak_broken_from: 0,
  });
  return grantFreezeIfEarned(p);
}

/** Five fragments make a freeze. */
export async function addFragment(count = 1): Promise<companion.Profile> {
  const p = await companion.profile();
  let frags = (p.streak_fragments ?? 0) + count;
  let freezes = p.streak_freezes ?? 0;
  while (frags >= FRAGMENTS_PER_FREEZE && freezes < MAX_FREEZES) {
    frags -= FRAGMENTS_PER_FREEZE;
    freezes += 1;
  }
  return companion.update({ streak_fragments: frags, streak_freezes: freezes });
}

/** Take the broken run back, free, once a month, without ceremony. */
export async function repair(now = new Date()): Promise<{ repaired: boolean; current: number }> {
  const p = await settle(now);
  if (!repairAvailable(p, now)) return { repaired: false, current: p.current_streak ?? 0 };
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const restored = p.streak_broken_from ?? 0;
  const updated = await companion.update({
    current_streak: restored,
    streak_last_date: streakDay(now),
    streak_repair_month: month,
    streak_broken_at: null,
    streak_broken_from: 0,
  });
  return { repaired: true, current: updated.current_streak ?? 0 };
}

/**
 * The freeze notice, read once and cleared. The user learns a freeze was spent after
 * the fact and warmly, so it is a moment rather than a running tally.
 */
export async function takeFreezeNotice(): Promise<string | null> {
  const p = await companion.profile();
  const n = p.streak_freeze_notice ?? 0;
  if (!n) return null;
  await companion.update({ streak_freeze_notice: 0 });
  return n === 1
    ? 'You missed a day, so I held your streak for you.'
    : `You missed ${n} days, so I held your streak for you.`;
}

/** The last seven days: met, covered by a freeze, or missed. */
export async function perfectWeek(now = new Date()): Promise<
  Array<{ date: string; met: boolean; frozen: boolean }>
> {
  const p = await companion.profile();
  const frozen = new Set(p.streak_frozen_days ?? []);
  const met = new Set(p.streak_met_days ?? []);
  const last = p.streak_last_date;
  const out: Array<{ date: string; met: boolean; frozen: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    out.push({
      date: iso,
      met: met.has(iso) || iso === last,
      frozen: frozen.has(iso),
    });
  }
  return out;
}

export async function longYear(now = new Date()): Promise<{
  days: number;
  reached: boolean;
  near: boolean;
  remaining: number;
}> {
  const p = await companion.profile();
  const days = p.current_streak ?? 0;
  return {
    days,
    reached: days >= LONG_YEAR,
    near: days >= LONG_YEAR - LONG_YEAR_NEAR_DAYS && days < LONG_YEAR,
    remaining: Math.max(0, LONG_YEAR - days),
  };
}

export async function status(now = new Date()): Promise<Record<string, unknown>> {
  const st = await state(now);
  const p = await companion.profile();
  return {
    state: st,
    current: p.current_streak ?? 0,
    longest: p.longest_streak ?? 0,
    freezes: p.streak_freezes ?? 0,
    fragments: p.streak_fragments ?? 0,
    met_today: p.streak_last_date === streakDay(now),
    repairable: st === 'repairable',
    broken_from: p.streak_broken_from ?? 0,
    hours_left: Math.round(((nextRollover(now).getTime() - now.getTime()) / 3600_000) * 10) / 10,
    week: await perfectWeek(now),
    long_year: (p.current_streak ?? 0) >= LONG_YEAR,
  };
}
