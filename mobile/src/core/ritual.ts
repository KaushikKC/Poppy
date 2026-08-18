/**
 * The daily ritual — the port of the surface parts of backend/ritual_pact.py.
 *
 * A time the user picks themselves, which is what makes it a pact rather than a
 * schedule imposed on them. Showing up inside that window is what doubles Bloom
 * Points, and it is the only recurring reminder the app has.
 *
 * The reminder is polled by the home screen rather than pushed. On desktop that was
 * because a webview can block Web Notifications; on iOS a real local notification is
 * possible and is a later improvement, but polling works identically and needs no
 * permission prompt to start with.
 */

import * as companion from './companion';
import { streakDay } from './streak';

const ANCHOR_WINDOW_MINUTES = 90;
export const DEFAULT_TIME: Record<string, string> = { morning: '08:00', night: '21:30' };

function parseHhMm(t: string | null | undefined): [number, number] | null {
  if (!t) return null;
  const parts = t.split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return [hh, mm];
}

/** The anchor whose window we are inside right now, if any. */
export async function anchorNow(now = new Date()): Promise<string | null> {
  const p = await companion.profile();
  const kind = p.ritual_kind;
  const hm = parseHhMm(p.ritual_time);
  if (!kind || !hm) return null;
  const [hh, mm] = hm;
  let delta = Math.abs(now.getHours() * 60 + now.getMinutes() - (hh * 60 + mm));
  delta = Math.min(delta, 24 * 60 - delta); // wrap around midnight
  return delta <= ANCHOR_WINDOW_MINUTES ? kind : null;
}

/** Opt in, or clear it. */
export async function set(
  kind: string | null,
  time?: string | null,
): Promise<{ ritual_kind: string | null; ritual_time: string | null }> {
  if (!kind) {
    const cleared = await companion.update({ ritual_kind: null, ritual_time: null });
    return { ritual_kind: cleared.ritual_kind ?? null, ritual_time: cleared.ritual_time ?? null };
  }
  const t = time && parseHhMm(time) ? time : DEFAULT_TIME[kind] ?? '21:30';
  const p = await companion.update({ ritual_kind: kind, ritual_time: t });
  return { ritual_kind: p.ritual_kind ?? null, ritual_time: p.ritual_time ?? null };
}

/**
 * Is a reminder due right now? Once per day, only inside the window, and only if
 * they have not already been today.
 */
export async function due(now = new Date()): Promise<{ due: boolean; kind?: string; text?: string }> {
  const p = await companion.profile();
  const kind = await anchorNow(now);
  if (!kind) return { due: false };

  const today = streakDay(now);
  if (p.ritual_dismissed_day === today) return { due: false };
  if (p.streak_last_date === today) return { due: false }; // already spoken today

  const name = p.companion_name || 'Poppy';
  const text =
    kind === 'morning'
      ? `${name} is around, if you want to start the day together.`
      : `${name} is around, if you want to wind down together.`;
  return { due: true, kind, text };
}

/** Mark today's reminder as handled so it stops showing. */
export async function dismiss(now = new Date()): Promise<void> {
  await companion.update({ ritual_dismissed_day: streakDay(now) });
}

/** Her closing line when a ritual is set: the pact, in her voice. */
export function closingLoop(kind: string | null): string | null {
  if (!kind) return null;
  return kind === 'morning'
    ? 'Same time tomorrow morning?'
    : 'Same time tomorrow night?';
}
