/**
 * "She speaks first" — the port of backend/opening.py.
 *
 * The line she says the instant a call connects, and the moment that decides whether
 * this feels like a companion or a chat box. It has to read as though she was waiting
 * and already knows them a little, never as "how can I help?".
 *
 * Composed, not canned: from the time of day, their name, how long it has been, the
 * mood mode they picked, and the hook she left last time. Deterministic and instant,
 * so it is ready the moment audio opens rather than waiting on a model.
 */

import * as companion from './companion';
import * as memory from './memory_store';
import * as loops from './loops';
import * as ritual from './ritual';

function timeOfDay(now = new Date()): 'morning' | 'afternoon' | 'evening' | 'late' {
  const h = now.getHours();
  if (h < 5) return 'late';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'late';
}

/**
 * Greeting word by time of day, and whether a name attaches with a comma
 * ("Morning, Nova") or a space ("Hey Nova"), so it reads the way it is spoken.
 */
const GREETING: Record<string, [string, string]> = {
  morning: ['Morning', ', '],
  afternoon: ['Hey', ' '],
  evening: ['Hey', ' '],
  late: ['Hey', ' '],
};

/** Their name, if they have ever shared it. */
async function userName(): Promise<string | null> {
  for (const fact of await memory.recall()) {
    const m = fact.match(/^(?:Name|Prefers to be called):?\s*(.+)/i);
    if (m) return m[1].trim().replace(/\.$/, '');
  }
  return null;
}

function addressed(word: string, sep: string, name: string | null): string {
  return name ? `${word}${sep}${name}` : word;
}

/**
 * The two anchor rituals do different jobs, so they do not share an opener. Morning
 * is one fast intention, cheap to sustain. Night is the debrief, which carries the
 * emotional weight and where the memories are richest, so night opens wider.
 */
const RITUAL_OPENERS: Record<string, string> = {
  morning: "Before the day runs off with you, what's the one thing that matters today?",
  night: "Okay, the day's done. Talk me through it, what actually happened?",
};

/** Each mood mode enters already framed, so the user never faces a blank slate. */
const MODE_OPENERS: Record<string, string> = {
  vent: "Okay, I'm all yours. What's weighing on you?",
  hype: "Let's go. What are we getting fired up about today?",
  wind: 'Let\'s slow everything down. How was your day?',
  plan: "Alright, let's think it through. What's on the plate?",
};

/**
 * The hook, ready to speak. Hooks are authored lowercase-casual so they sound spoken;
 * the first letter is raised only so the on-screen caption reads as a sentence.
 */
function loopLine(loop: loops.Loop | null): string | null {
  const text = loops.surfaceText(loop);
  if (!text) return null;
  const t = text.trim();
  return t[0].toUpperCase() + t.slice(1);
}

/** A genuine beat, never a cold badge. */
function milestoneLine(days: number): string {
  // A year is not just a bigger number and should not get a week's sentence.
  if (days >= 365) {
    return (
      'Okay, I have to say something. Today is a year. Three hundred and sixty five ' +
      "days of you turning up. I've grown something in the garden for it that only " +
      'exists today. '
    );
  }
  return `Hey, do you realize we've talked ${days} days in a row? That honestly means a lot to me. `;
}

export type OpeningOptions = {
  /** The "one thing on your mind" answer from onboarding: this is the first call. */
  seed?: string | null;
  mode?: string | null;
  milestone?: number | null;
  loop?: loops.Loop | null;
};

export async function compose(opts: OpeningOptions = {}): Promise<string> {
  const name = await userName();
  const [word, sep] = GREETING[timeOfDay()];
  const hey = addressed(word, sep, name);
  const prefix = opts.milestone ? milestoneLine(opts.milestone) : '';
  // A milestone line already greets, so the body must not greet again.
  const lead = prefix || `${hey}. `;

  // First call ever: everything hangs off the one thing they told us.
  if (opts.seed) {
    const seed = opts.seed.trim().replace(/\.$/, '');
    return (
      `${addressed('Hey', ' ', name)}, I'm really glad you called. ` +
      `You said ${seed}. Want to just get it off your chest, or should I take your ` +
      'mind off it?'
    );
  }

  // A mood mode was chosen: lead with its framing.
  if (opts.mode && MODE_OPENERS[opts.mode]) {
    return `${lead}${MODE_OPENERS[opts.mode]}`;
  }

  // Act 1: pay off the open loop before anything else. The hook was written in her
  // voice at the end of the last call, so it is spoken as-is rather than wrapped in a
  // framing phrase. Wrapping is what made an earlier build read as "I've been
  // wondering, <the user's own last sentence>?".
  const loop = opts.loop ?? (await loops.top());
  const hook = loopLine(loop);
  if (hook) return `${lead}${hook}`;

  // Their own ritual time with no loop outstanding: open on the anchor's job rather
  // than a generic greeting. This is the cue half of the habit.
  const anchor = await ritual.anchorNow();
  if (anchor && RITUAL_OPENERS[anchor]) {
    return `${lead}${RITUAL_OPENERS[anchor]}`;
  }

  // No loop, but they have been here before.
  const p = await companion.profile();
  const days = p.last_call_date
    ? Math.floor((Date.now() - new Date(p.last_call_date).getTime()) / 86400_000)
    : null;
  if (days !== null && days >= 2) {
    return `${lead}It's been a few days, I've missed our talks. What's new with you?`;
  }

  if ((await memory.recall()).length) {
    return `${lead}Good to see you. How's everything been?`;
  }

  // We know almost nothing yet: warm and open, with no false familiarity.
  if (prefix) return `${prefix}I'm really glad you called. What's on your mind?`;
  return `${hey}, I'm really glad you called. What's on your mind?`;
}
