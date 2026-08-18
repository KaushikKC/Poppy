/**
 * The daily three — the port of backend/quests.py.
 *
 * Slot 1 is always the open loop, so the day's first task is her own unanswered
 * line. Slots 2 and 3 are seeded by the date, so pulling to refresh cannot reroll
 * them into something easier, and at least one always needs a deliberate act — the
 * set can never be completed just by turning up.
 *
 * Completion comes from signals about what actually happened, never from the user
 * ticking a box. A quest that ticks itself when you did not do it is worse than one
 * that never ticks.
 */

import * as companion from './companion';
import * as streak from './streak';

export const SLOTS = 3;
export const FRAGMENTS_PER_QUEST = 1;

type Quest = {
  id: string;
  signal: string;
  text: string;
  pinned?: boolean;
};

const PASSIVE: Quest[] = [
  { id: 'call_5min', signal: 'call_5min', text: 'Have a call longer than 5 minutes' },
  { id: 'ritual_time', signal: 'ritual_time', text: 'Show up at your ritual time' },
  { id: 'good_thing', signal: 'good_thing', text: 'Tell her one thing that went well today' },
];

// These need a deliberate act, which is what keeps the set from being decorative.
// The memory edit is the highest-value one and looks like a chore: editing what she
// remembers is the IKEA effect, and it raises how much the companion is valued.
const ACTIVE: Quest[] = [
  { id: 'memory_saved', signal: 'memory_saved', text: 'Save something worth remembering' },
  { id: 'memory_edited', signal: 'memory_edited', text: 'Fix something she remembers' },
  { id: 'mood_new', signal: 'mood_new', text: "Try a mood you haven't used" },
];

/**
 * "Tell her one thing that went well" is detected from what was said, like every
 * other signal. On desktop it was read from a field the frontend never sent, so the
 * quest could not be completed at all. Deterministic rather than another model pass,
 * because this runs on every call close.
 */
const GOOD_THING =
  /\b(went (?:really |pretty |so )?(?:well|great|good)|(?:good|great|nice|lovely|better|productive) day|(?:i )?(?:got|finished|finally|managed to|nailed|passed|aced)\b|proud of (?:myself|me)|(?:it|that) worked out|good news|felt (?:really |so )?(?:good|great|happy))\b/i;

export function detectGoodThing(turns: Array<{ role?: string; content?: string }>): boolean {
  return turns.some((t) => t.role === 'user' && GOOD_THING.test(t.content ?? ''));
}

function today(): string {
  return streak.streakDay();
}

/** Deterministic per-day pick, so a refresh cannot reroll the set. */
function seeded(day: string): () => number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) | 0;
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
}

async function loopQuest(): Promise<Quest> {
  const p = await companion.profile();
  const loop = p.open_loop as { hook_text?: string } | null;
  const hook = (loop?.hook_text ?? '').trim().replace(/[?.! ]+$/, '');
  if (hook) {
    // Her line, turned into the day's first task without losing whose it is.
    return { id: 'open_loop', signal: 'loop_resolved', text: `Answer her: ${hook}`, pinned: true };
  }
  return {
    id: 'open_loop',
    signal: 'loop_resolved',
    text: 'Pick up where you left off with her',
    pinned: true,
  };
}

function pick(day: string): Quest[] {
  const rnd = seeded(day);
  const active = ACTIVE[Math.floor(rnd() * ACTIVE.length)];
  const pool = [...PASSIVE, ...ACTIVE].filter((q) => q.id !== active.id);
  const other = pool[Math.floor(rnd() * pool.length)];
  const picked = [active, other];
  if (rnd() > 0.5) picked.reverse();
  return picked;
}

type QuestState = { day: string; done: string[] };

async function state(): Promise<QuestState> {
  const p = await companion.profile();
  const s = (p.quests as unknown as QuestState) ?? null;
  if (!s || s.day !== today()) return { day: today(), done: [] };
  return { day: s.day, done: s.done ?? [] };
}

export async function todayQuests(): Promise<Array<Quest & { done: boolean; slot: number }>> {
  const day = today();
  const done = new Set((await state()).done);
  const all = [await loopQuest(), ...pick(day)];
  return all.slice(0, SLOTS).map((q, i) => ({ ...q, done: done.has(q.id), slot: i + 1 }));
}

/** Mark any quest whose signal fired. Returns the newly completed ids. */
export async function complete(signals: Record<string, unknown>): Promise<string[]> {
  const s = await state();
  const done = new Set(s.done);
  const newly: string[] = [];
  for (const q of await todayQuests()) {
    if (done.has(q.id)) continue;
    if (signals[q.signal]) {
      done.add(q.id);
      newly.push(q.id);
    }
  }
  if (newly.length) {
    await companion.update({
      quests: { day: today(), done: [...done].sort() } as unknown as Record<string, unknown>[],
    });
    await streak.addFragment(newly.length * FRAGMENTS_PER_QUEST);
  }
  return newly;
}

export async function status(): Promise<Record<string, unknown>> {
  const quests = await todayQuests();
  return {
    day: today(),
    quests,
    done: quests.filter((q) => q.done).length,
    total: quests.length,
    // All three done is worth marking, but it is not a level and carries no score.
    all_done: quests.length > 0 && quests.every((q) => q.done),
  };
}
