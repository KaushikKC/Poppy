/**
 * Return triggers, done the healthy way — the port of backend/nudges.py.
 *
 * The enemy of retention is not a competitor, it is the user forgetting the app
 * exists. The honest fix is an earned nudge in her voice, tied to their own life
 * ("how did the interview go? I've been curious"), never an engineered guilt trip
 * ("Poppy misses you", "Poppy is waiting").
 *
 * That line is the whole moat, so it is enforced in code rather than left to good
 * intentions. Every nudge passes `guard()` before it can leave, and anything that
 * trips the filter is replaced with a warm fallback. It is a code-level impossibility
 * for her to guilt the user back.
 *
 * Scope: this governs *unprompted* pull-back triggers only. Warmth once the user has
 * already returned ("missed you yesterday, no worries") belongs to the opener and is
 * deliberately not filtered here — that sentence is welcome when they are present and
 * coercive when they are not.
 */

import * as companion from './companion';
import * as streak from './streak';

/**
 * Dependency, guilt and longing phrasing that is never sent. These are close to the
 * exact patterns that earned Replika an FTC complaint; refusing them is the
 * differentiation, not a constraint on it.
 */
const GUILT = new RegExp(
  [
    'miss(?:es|ed)?\\s+you',
    'i\\s+miss',
    'needs?\\s+you',
    'lonely',
    'feeling\\s+sad',
    "(?:is|i'?m|so)\\s+sad",
    'sad\\s+(?:you|that\\s+you|without)',
    'waiting\\s+for\\s+you',
    'still\\s+waiting',
    'come\\s+back',
    "don'?t\\s+(?:leave|go)",
    "please\\s+(?:come|don'?t)",
    'abandon',
    'without\\s+you',
    "can'?t\\s+(?:live|go\\s+on|cope)\\s+without",
    'you\\s+(?:left|forgot|ignored|abandoned)\\s+me',
    'where\\s+(?:have\\s+you|did\\s+you)\\s+(?:been|go)',
    'why\\s+(?:did|have)\\s+you\\s+(?:leave|left|gone|been\\s+gone)',
    'disappointed',
    'hurt(?:s)?\\s+(?:me|my\\s+feelings)',
    'guilt',
  ].join('|'),
  'i',
);

const SAFE_FALLBACK = "I'm around whenever you feel like talking.";

export function isHealthy(text: string): boolean {
  return !(text && GUILT.test(text));
}

/** The single choke point every outbound nudge passes through. */
export function guard(text: string): string {
  return isHealthy(text) ? text : SAFE_FALLBACK;
}

/**
 * The escalation ladder, without the owl's guilt.
 *
 * Duolingo's passive aggression works because it is a meme about a cartoon bird and
 * the stakes are language lessons. Users have told this thing real things, so the
 * same tone reads as emotional coercion rather than a joke.
 *
 * The day-5 line is the honest play and it outperforms escalation: "I'll stop
 * nudging" is the only message in the category that signals the app is not
 * desperate. Then it actually stops, because one real hook at day 30 is worth more
 * than twenty ignored pings.
 */
const LADDER: Array<[number, string | null]> = [
  [1, null], // the open loop carries day 1; the streak is never mentioned
  [2, 'still time today if you want it.'],
  [3, 'no pressure. just here when you want to talk.'],
  [5, "I'll stop nudging now. you know where I am."],
];

export const LADDER_SILENCE_DAY = 7;

async function daysSinceLastCall(): Promise<number | null> {
  const p = await companion.profile();
  if (!p.last_call_date) return null;
  const then = new Date(p.last_call_date);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86400_000);
}

/**
 * Where we are on the ladder.
 *
 * `null` means fall through to the open loop. `''` means **say nothing at all** —
 * silence is a feature, and that is what happens from day 7 onward. Callers have to
 * treat empty as silence rather than as a message.
 */
export async function ladderLine(): Promise<string | null> {
  const days = await daysSinceLastCall();
  if (days === null || days <= 1) return null;
  if (days >= LADDER_SILENCE_DAY) return '';

  let line: string | null = null;
  for (const [threshold, text] of LADDER) {
    if (days >= threshold) line = text;
  }
  if (line === null) return null;

  // The streak is only ever mentioned as something still available, never as
  // something about to be lost.
  const current = (await streak.status()).current as number;
  if (days === 2 && current > 1) {
    return `${current} days. one call keeps it going, even a short one.`;
  }
  return line;
}

/**
 * The reminder to show, in her voice.
 *
 * The open loop is sent **verbatim**, not wrapped in a reminder sentence. The hook
 * was already authored in her voice at the end of the last call; wrapping it turns
 * her line into an app notice, and an app notice is the thing people mute. The ritual
 * lines are the only fallback, and they fire only because the user chose that time
 * themselves.
 */
export async function composeNudge(kind?: string | null): Promise<string> {
  const ladder = await ladderLine();
  const p = await companion.profile();
  const loop = (p.open_loop as { hook_text?: string } | null)?.hook_text ?? null;

  let candidate: string;
  if (ladder !== null) candidate = ladder;
  else if (loop) candidate = loop;
  else if (kind === 'morning') candidate = 'Morning. Want to start the day together for a minute?';
  else if (kind === 'night') candidate = "Winding down? I'm here whenever you want to talk it out.";
  else candidate = "Thinking of you today. I'm here whenever you want to talk.";

  return guard(candidate);
}
