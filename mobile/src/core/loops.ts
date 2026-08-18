/**
 * Open loops — the port of backend/loops.py.
 *
 * The unanswered thing she is still curious about, which is what gives the home
 * screen a reason to exist and slot 1 of the daily three its content.
 *
 * Three rules carried across intact:
 *
 *  - **Exactly one is shown, everywhere.** Two competing hooks read as an app with
 *    a to-do list rather than someone who remembers a conversation.
 *  - **At most two are live**, the rest go to a backlog, so she never accumulates
 *    a pile of things you owe her.
 *  - **A decayed loop softens rather than repeats.** Past its decay point she stops
 *    asking as though an answer were owed. That is the whole difference between a
 *    companion and a nag: "I don't even know if it happened, but I'm still curious",
 *    never "you never told me".
 */

import * as companion from './companion';

export const TYPES = ['event', 'question', 'reveal', 'serial', 'ritual', 'callback'] as const;
export type LoopType = (typeof TYPES)[number];

const HALF_LIFE_HOURS: Record<string, number> = {
  event: 36, // until the event has happened, plus a day and a half
  question: 48, // "think about it and tell me tomorrow"
  reveal: 72, // she has something of her own to share
  serial: 120, // an ongoing multi-session thread
  ritual: 26, // "same time tomorrow?" — just over a day
  callback: 48,
};

// Base pull before recency and urgency. Reveals are strongest because the payoff is
// hers to give; rituals are weakest individually because the habit carries them.
const BASE_STRENGTH: Record<string, number> = {
  event: 0.85,
  question: 0.7,
  reveal: 0.9,
  serial: 0.75,
  ritual: 0.4,
  callback: 0.8,
};

const DEFAULT_TYPE: LoopType = 'question';
const MAX_LIVE = 2;
const EXPIRE_MULTIPLIER = 2;
const MAX_STORED = 40;
export const LIVE_STATES = ['open', 'surfaced'];

export type Loop = {
  id: string;
  type: LoopType;
  hook_text: string;
  state: 'open' | 'surfaced' | 'resolved' | 'expired' | 'declined';
  created_at: string;
  decay_at: string | null;
  expires_at: string | null;
  due_at: string | null;
  strength: number | null;
  backlog?: boolean;
  announced?: boolean;
};

function now(): Date {
  return new Date();
}

function parse(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function all(): Promise<Loop[]> {
  return ((await companion.profile()).loops ?? []) as unknown as Loop[];
}

async function save(list: Loop[]): Promise<void> {
  await companion.update({ loops: list.slice(-MAX_STORED) as unknown as Record<string, unknown>[] });
}

/** strength x recency x time-sensitivity, with a boost for one mid-payoff. */
function score(loop: Loop): number {
  const kind = loop.type ?? DEFAULT_TYPE;
  const halfLife = HALF_LIFE_HOURS[kind] ?? 48;
  const strength = loop.strength ?? BASE_STRENGTH[kind] ?? 0.6;

  const created = parse(loop.created_at) ?? now();
  const ageH = Math.max((now().getTime() - created.getTime()) / 3600_000, 0);
  // Recency decays across the loop's own half-life, so a two-day-old question and
  // a five-day-old serial thread are compared fairly.
  const recency = Math.max(1 - ageH / (halfLife * EXPIRE_MULTIPLIER), 0.05);

  // Shortest half-life in the table is the ritual loop at 26h; scale against it, so
  // "same time tomorrow?" does not sit behind a thread that can wait a week.
  const timeSensitivity = Math.min(26 / halfLife, 1) * 0.5 + 0.5;

  // A loop she already opened on outranks everything: it is mid-payoff.
  const surfacedBoost = loop.state === 'surfaced' ? 1.5 : 1.0;

  return strength * recency * timeSensitivity * surfacedBoost;
}

/** Expire what is past its window, and keep at most two live. */
async function sweep(): Promise<Loop[]> {
  const list = await all();
  const t = now();
  let changed = false;

  for (const l of list) {
    if (!LIVE_STATES.includes(l.state)) continue;
    const expires = parse(l.expires_at);
    if (expires && t >= expires) {
      l.state = 'expired';
      changed = true;
    }
  }

  const live = list.filter((l) => LIVE_STATES.includes(l.state));
  const ranked = [...live].sort((a, b) => score(b) - score(a));
  ranked.forEach((l, i) => {
    const shouldBacklog = i >= MAX_LIVE;
    if (Boolean(l.backlog) !== shouldBacklog) {
      l.backlog = shouldBacklog;
      changed = true;
    }
  });

  if (changed) await save(list);
  return list;
}

/** This character's active loops, strongest first. */
export async function liveLoops(): Promise<Loop[]> {
  const list = await sweep();
  const t = now();
  const active = list.filter(
    (l) =>
      LIVE_STATES.includes(l.state) &&
      !l.backlog &&
      // A loop waiting for its moment is not shown yet. This is what makes a reveal
      // arrive on its own rather than the instant the call ends.
      (parse(l.due_at) ?? t).getTime() <= t.getTime(),
  );
  return active.sort((a, b) => score(b) - score(a));
}

/** The single loop to show. Exactly one, everywhere. */
export async function top(): Promise<Loop | null> {
  return (await liveLoops())[0] ?? null;
}

export async function get(id: string): Promise<Loop | null> {
  return (await all()).find((l) => l.id === id) ?? null;
}

export async function add(
  hookText: string,
  type: LoopType = DEFAULT_TYPE,
  opts: { dueInHours?: number; strength?: number } = {},
): Promise<Loop | null> {
  const hook = (hookText || '').trim();
  if (!hook) return null;
  const kind = (TYPES as readonly string[]).includes(type) ? type : DEFAULT_TYPE;
  const halfLife = HALF_LIFE_HOURS[kind] ?? 48;
  const t = now();

  const loop: Loop = {
    id: newId(),
    type: kind,
    hook_text: hook,
    state: 'open',
    created_at: t.toISOString(),
    decay_at: new Date(t.getTime() + halfLife * 3600_000).toISOString(),
    expires_at: new Date(t.getTime() + halfLife * EXPIRE_MULTIPLIER * 3600_000).toISOString(),
    due_at: opts.dueInHours
      ? new Date(t.getTime() + opts.dueInHours * 3600_000).toISOString()
      : null,
    strength: opts.strength ?? null,
  };

  const list = await all();
  list.push(loop);
  await save(list);
  await sweep();
  return loop;
}

async function setState(id: string, state: Loop['state']): Promise<Loop | null> {
  const list = await all();
  const l = list.find((x) => x.id === id);
  if (!l) return null;
  l.state = state;
  await save(list);
  return l;
}

export async function markSurfaced(id: string): Promise<Loop | null> {
  return setState(id, 'surfaced');
}

export async function resolve(id: string): Promise<Loop | null> {
  return setState(id, 'resolved');
}

export async function decline(id: string): Promise<Loop | null> {
  return setState(id, 'declined');
}

export function isDecayed(loop: Loop): boolean {
  const decay = parse(loop.decay_at);
  return Boolean(decay && now().getTime() >= decay.getTime());
}

/**
 * How a loop softens once it has decayed. Each entry is the lead-in she says instead
 * of asking again, plus whether the original hook still follows it. Reveal and ritual
 * loops carry no detail of the user's, so their softened form stands alone rather
 * than repeating the same sentence twice.
 */
const SOFTENED: Record<string, [string, boolean]> = {
  event: ["I don't even know if it happened. Still curious whenever you want to tell me.", true],
  question: ['No pressure on this one. Still curious whenever you feel like it.', true],
  reveal: ["I've still got that thing I've been meaning to tell you, whenever you're around.", false],
  serial: ["We never did finish this. It's still here whenever you want it.", true],
  ritual: ["No schedule, no pressure. I'm around whenever.", false],
  callback: ['I got it straight eventually. No rush on it.', true],
};

/** The line to actually say, softened if the loop has decayed. */
export function surfaceText(loop: Loop | null): string | null {
  if (!loop) return null;
  const hook = (loop.hook_text ?? '').trim();
  if (!hook) return null;
  if (!isDecayed(loop)) return hook;

  const [lead, keepHook] = SOFTENED[loop.type] ?? SOFTENED[DEFAULT_TYPE];
  // Hooks are authored lowercase-casual so they sound spoken; following a lead-in
  // sentence the hook starts a new one, so it needs the capital.
  return keepHook ? `${lead} ${hook[0].toUpperCase()}${hook.slice(1)}` : lead;
}

/** A short label for the loop, for the Today list. */
export function label(loop: Loop | null): string | null {
  if (!loop) return null;
  return (
    {
      event: 'something coming up',
      question: 'a question of hers',
      reveal: 'something she wants to tell you',
      serial: 'where you left off',
      ritual: 'your usual time',
      callback: 'something she remembered',
    }[loop.type] ?? null
  );
}

/** Loops whose moment has just arrived, announced once. */
export async function newlyDue(): Promise<Loop[]> {
  const list = await all();
  const t = now();
  const due = list.filter(
    (l) =>
      LIVE_STATES.includes(l.state) &&
      !l.announced &&
      l.due_at &&
      (parse(l.due_at) as Date).getTime() <= t.getTime(),
  );
  if (due.length) {
    for (const l of due) l.announced = true;
    await save(list);
  }
  return due;
}
