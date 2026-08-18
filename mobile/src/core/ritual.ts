/**
 * The daily ritual, agreed out loud — the port of backend/ritual_pact.py.
 *
 * A time the user picks *in conversation*, which is what makes it a pact rather than
 * a setting. She asks when she should expect them, they answer in speech, and she says
 * the time back as a plan the two of them just made. The repeat-back is the
 * commitment; without it this is only a question.
 *
 * Two things shape the module:
 *
 * **She has to actually ask.** The instruction is mandatory and positioned, not an
 * invitation. "Raise it when it fits naturally" reads to a small model as permission
 * to skip, and measured that way she asked in one call out of three. Telling it where
 * the question goes is the same fix that worked for disclosure.
 *
 * **Asking has a limit.** At most once a day, at most three times ever. A pact
 * declined three times is an answer, and silence is a feature applies to asking too.
 */

import * as companion from './companion';
import { streakDay } from './streak';

/** Late enough that she is not asking a stranger, early enough to land in week 1. */
const MIN_CALLS = 2;
const MAX_ASKS = 3;

/** The turn she may raise it from: not the opener, which belongs to the loop payoff. */
export const ASK_FROM_TURN = 2;

/**
 * Wide enough that a habit does not need a stopwatch, narrow enough that a 3pm call
 * is not greeted as a wind-down.
 */
const ANCHOR_WINDOW_MINUTES = 150;

/** Morning is the cheap 60-second intention; night is the debrief, where the value is. */
export const DEFAULT_TIME: Record<string, string> = { morning: '08:00', night: '21:30' };

// Plurals matter: "nights work for me" is how people answer, and \bnight\b does not
// match "nights" because the s blocks the word boundary. Fixed on both sides — the
// desktop regex had the same gap, so the whole answer parsed as nothing and she asked
// again on the next call.
const MORNING_CUES =
  /\b(mornings?|wake up|waking up|before work|first thing|start of (?:the|my) day|on (?:the|my) commute|breakfast)\b/i;

const NIGHT_CUES =
  /\b(nights?|evenings?|before bed|bed ?time|before i sleep|before sleeping|after work|end of (?:the|my) day|wind ?down|dinner|once i'?m home|when i get (?:home|back))\b/i;

const DECLINE_CUES =
  /\b(not (?:now|really|right now)|maybe later|another time|no thanks?|i'?d rather not|rather not|skip (?:it|that)|don'?t (?:remind|set)|no schedule|not sure|dunno|i don'?t know)\b/i;

/**
 * A clock time. Bare numbers are ignored unless something marks them as a time
 * ("at 9", "around 9", "9pm", "9:30"), so "I have 3 meetings" cannot set a ritual.
 */
const TIME_RE =
  /(?:\b(?:at|around|about|by|before)\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)?/gi;

const WORD_HOUR: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const WORD_TIME_RE = new RegExp(
  `\\b(${Object.keys(WORD_HOUR).join('|')})\\s*(?:o'?clock)?\\s*` +
    `(?:(thirty|fifteen|forty ?five)\\s*)?` +
    `(a\\.?m\\.?|p\\.?m\\.?|in the morning|at night|in the evening|tonight)?\\b`,
  'i',
);

const WORD_MINUTE: Record<string, number> = {
  thirty: 30, fifteen: 15, fortyfive: 45, 'forty five': 45,
};

export type Pact = { kind: string; time: string } | { declined: true } | null;

// ── Asking ───────────────────────────────────────────────────────────────────

export async function isDue(): Promise<boolean> {
  const p = await companion.profile();
  if (!p.onboarded || p.ritual_kind) return false;
  if (p.ritual_pact_declined) return false;
  if ((p.total_calls ?? 0) < MIN_CALLS) return false;
  if ((p.ritual_pact_asks ?? 0) >= MAX_ASKS) return false;
  return p.ritual_pact_asked_on !== streakDay();
}

/** Record that she raised it, so it is once a day and gives up after a few tries. */
export async function markAsked(): Promise<void> {
  const p = await companion.profile();
  await companion.update({
    ritual_pact_asked_on: streakDay(),
    ritual_pact_asks: (p.ritual_pact_asks ?? 0) + 1,
  });
}

/**
 * The instruction that makes her ask. Mandatory and positioned, for the reason in the
 * module docstring. Two things are non-negotiable: she asks for a *time*, and she says
 * it back.
 */
export function asPromptBlock(): string {
  return (
    '\n\nIMPORTANT, do this in this reply: after you respond to what they said, ' +
    'END your reply by asking when they would like you to expect them each day. ' +
    'Offer the two options out loud, right after work, or right before they sleep. ' +
    'Say you want to be part of their day rather than an interruption in it. Ask it ' +
    'as a real question and stop there, do not ask anything else. If they answer with ' +
    'a time, say that time back to them as a plan the two of you just made. If they ' +
    'would rather not pick one, let it go warmly.'
  );
}

// ── Reading their answer ─────────────────────────────────────────────────────

function clamp(hour: number, minute: number, mer: string | null, hint: string | null): string | null {
  if (!(minute >= 0 && minute < 60)) return null;
  const m = (mer ?? '').toLowerCase().replace(/\./g, '').replace(/'/g, '');
  if (m.startsWith('p') || m === 'at night' || m === 'in the evening' || m === 'tonight') {
    if (hour < 12) hour += 12;
  } else if (m.startsWith('a') || m === 'in the morning') {
    if (hour === 12) hour = 0;
  } else if (m === 'oclock' || !m) {
    // No meridiem. The anchor they picked disambiguates better than any default.
    if (hint === 'night' && hour < 12) hour += 12;
    else if (hint === 'morning' && hour === 12) hour = 0;
  }
  if (!(hour >= 0 && hour < 24)) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function extractTime(text: string, hint: string | null): string | null {
  const w = WORD_TIME_RE.exec(text);
  if (w && (w[3] || hint)) {
    const hour = WORD_HOUR[w[1].toLowerCase()];
    const minute = WORD_MINUTE[(w[2] ?? '').toLowerCase().replace(/ /g, '')] ?? 0;
    const got = clamp(hour, minute, w[3] ?? null, hint);
    if (got) return got;
  }

  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(text)) !== null) {
    const [whole, hourS, minuteS, mer] = m;
    // A bare number with no clock marker is a quantity, not a time.
    if (!minuteS && !mer && !/^[a-z]/i.test(whole.trim())) continue;
    const got = clamp(Number(hourS), Number(minuteS ?? 0), mer ?? null, hint);
    if (got) return got;
  }
  return null;
}

/**
 * Read a spoken answer into a ritual, or null if they did not commit to one.
 *
 * A decline is distinct from an unparsed answer: a decline stops her asking, an
 * unparsed answer does not.
 */
export function parse(text: string): Pact {
  const t = (text || '').trim();
  if (!t) return null;
  if (DECLINE_CUES.test(t)) return { declined: true };

  let kind: string | null = null;
  if (NIGHT_CUES.test(t)) kind = 'night';
  else if (MORNING_CUES.test(t)) kind = 'morning';

  const time = extractTime(t, kind);
  if (!kind && time) {
    // A bare time still says which anchor they mean. The small hours count as night:
    // someone who says "half twelve" means the wind-down before sleep, and greeting
    // that with "what matters today?" would be the wrong ritual entirely.
    const hour = Number(time.slice(0, 2));
    kind = hour >= 5 && hour < 12 ? 'morning' : 'night';
  }
  if (!kind) return null;
  return { kind, time: time ?? DEFAULT_TIME[kind] };
}

/** Latest answer wins, so a correction ("actually make it ten") beats the first guess. */
export function parseFromTurns(turns: Array<{ role?: string; content?: string }>): Pact {
  const userTurns = (turns ?? []).filter((t) => t.role === 'user').reverse();
  for (const turn of userTurns) {
    const got = parse(String(turn.content ?? ''));
    if (got) return got;
  }
  return null;
}

// ── Living with it ───────────────────────────────────────────────────────────

export async function anchorNow(now = new Date()): Promise<string | null> {
  const p = await companion.profile();
  const kind = p.ritual_kind;
  if (!kind || !p.ritual_time) return null;
  const parts = p.ritual_time.split(':');
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  let delta = Math.abs(now.getHours() * 60 + now.getMinutes() - (hh * 60 + mm));
  delta = Math.min(delta, 24 * 60 - delta); // wrap midnight
  return delta <= ANCHOR_WINDOW_MINUTES ? kind : null;
}

/**
 * The ritual loop planted when a call lands on its anchor. It carries the lowest base
 * strength of any loop type, so the conversational loop always takes the one visible
 * slot and this just sits underneath holding the cadence.
 */
const RITUAL_LOOP: Record<string, string> = {
  morning: "same time tomorrow morning? I'll be here.",
  night: "same time tomorrow night? I'll be here.",
};

export async function closingLoop(kind?: string | null): Promise<string | null> {
  const k = kind ?? (await anchorNow());
  return k ? RITUAL_LOOP[k] ?? null : null;
}

/** The receipt shown once the pact lands. She already said it out loud in the call. */
export function confirmLine(kind: string, time: string): string {
  const hh = Number(time.slice(0, 2));
  const mm = Number(time.slice(3, 5));
  const suffix = hh < 12 ? 'am' : 'pm';
  const hour12 = hh % 12 || 12;
  const clock = mm ? `${hour12}:${String(mm).padStart(2, '0')}${suffix}` : `${hour12}${suffix}`;
  const when = kind === 'morning' ? 'Mornings' : 'Nights';
  return `It's a plan. ${when} at ${clock}.`;
}

/** Set it directly, for the settings control. */
export async function set(
  kind: string | null,
  time?: string | null,
): Promise<{ ritual_kind: string | null; ritual_time: string | null }> {
  if (!kind) {
    const cleared = await companion.update({ ritual_kind: null, ritual_time: null });
    return { ritual_kind: cleared.ritual_kind ?? null, ritual_time: cleared.ritual_time ?? null };
  }
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : DEFAULT_TIME[kind] ?? '21:30';
  const p = await companion.update({ ritual_kind: kind, ritual_time: t });
  return { ritual_kind: p.ritual_kind ?? null, ritual_time: p.ritual_time ?? null };
}

/** Record a decline so she stops asking. */
export async function decline(): Promise<void> {
  await companion.update({ ritual_pact_declined: true });
}

/** Is a reminder due right now? Once a day, in the window, and not if already spoken. */
export async function due(now = new Date()): Promise<{ due: boolean; kind?: string }> {
  const p = await companion.profile();
  const kind = await anchorNow(now);
  if (!kind) return { due: false };
  const today = streakDay(now);
  if (p.ritual_dismissed_day === today) return { due: false };
  if (p.streak_last_date === today) return { due: false };
  return { due: true, kind };
}

export async function dismiss(now = new Date()): Promise<void> {
  await companion.update({ ritual_dismissed_day: streakDay(now) });
}
