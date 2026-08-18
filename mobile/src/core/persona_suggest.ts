/**
 * Suggesting a mood that fits how they are talking — the port of
 * backend/persona_suggest.py.
 *
 * Classifies conversational *register* from the transcript: a precise, task-shaped
 * register suggests `partner`, a high-energy one suggests `hype`, and the neutral
 * baseline is `friend`. `calm` is a deliberate end-of-day choice rather than a way of
 * speaking, so it is never auto-suggested.
 *
 * Evidence accumulates across turns as a running average, so a suggestion only fires
 * once there is enough of it. One offhand exclamation mark should not change who she
 * is mid-conversation.
 *
 * Text only, and unrelated to spoken-accent detection.
 */

const PROFESSIONAL = new Set([
  'please', 'regarding', 'schedule', 'meeting', 'report', 'analysis', 'summary',
  'deadline', 'proposal', 'review', 'document', 'request', 'however', 'therefore',
  'additionally', 'furthermore', 'kindly', 'appreciate', 'regards', 'objective',
  'priority', 'strategy',
]);

const PLAYFUL = new Set([
  'lol', 'haha', 'hehe', 'omg', 'lmao', 'yay', 'woohoo', 'cool', 'awesome', 'epic',
  'vibes', 'dude', 'bro', 'wanna', 'gonna', 'gotta', 'yeah', 'yep', 'nah', 'super',
  'totally', 'literally', 'fun', 'love', 'amazing',
]);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;

type Scores = { partner: number; hype: number; friend: number };

function score(text: string): Scores {
  const lower = text.toLowerCase();
  const tokens: string[] = lower.match(/[a-z']+/g) ?? [];
  const n = Math.max(tokens.length, 1);

  let profHits = 0;
  let playHits = 0;
  for (const t of tokens) {
    if (PROFESSIONAL.has(t)) profHits++;
    if (PLAYFUL.has(t)) playHits++;
  }

  const exclaims: number = (text.match(/!/g) ?? []).length;
  const emojis: number = (text.match(EMOJI) ?? []).length;
  const avgLen = tokens.reduce((s: number, t: string) => s + t.length, 0) / n;

  let partner = profHits / n;
  // Longer average word length nudges toward the precise register.
  if (avgLen >= 5) partner += 0.05;

  const hype = (playHits + exclaims + emojis * 2) / n;

  // friend is the neutral baseline: it wins when neither signal is strong.
  return { partner, hype, friend: 0.04 };
}

const REASONS: Record<string, string> = {
  partner: 'sounds like you want to think something through',
  hype: "you're bringing energy",
  friend: 'sounds like you just want to talk',
};

export type Suggestion = { persona: string; confidence: number; reason: string };

class Suggester {
  private ema: Scores = { partner: 0, hype: 0, friend: 0.04 };
  private turns = 0;

  constructor(private alpha = 0.5, private minConfidence = 0.08) {}

  observe(text: string, currentPersona: string): Suggestion | null {
    if (!text || !text.trim()) return null;

    this.turns += 1;
    const s = score(text);
    for (const k of Object.keys(s) as Array<keyof Scores>) {
      this.ema[k] = this.alpha * s[k] + (1 - this.alpha) * this.ema[k];
    }

    const entries = Object.entries(this.ema) as Array<[string, number]>;
    entries.sort((a, b) => b[1] - a[1]);
    const [leader, top] = entries[0];
    const runnerUp = entries[1][1];
    const margin = top - runnerUp;

    // At least two turns, a clear leader, and a meaningful margin. Suggesting a mode
    // change on the strength of one sentence is worse than never suggesting one.
    if (this.turns < 2 || leader === currentPersona || margin < this.minConfidence) {
      return null;
    }

    return {
      persona: leader,
      confidence: Math.round(Math.min(margin * 4, 1) * 100) / 100,
      reason: REASONS[leader] ?? 'this might fit you better',
    };
  }

  reset(): void {
    this.ema = { partner: 0, hype: 0, friend: 0.04 };
    this.turns = 0;
  }
}

// One user, one local app: a single module-level suggester is enough.
const suggester = new Suggester();

export function observe(text: string, currentPersona: string): Suggestion | null {
  return suggester.observe(text, currentPersona);
}

export function reset(): void {
  suggester.reset();
}
