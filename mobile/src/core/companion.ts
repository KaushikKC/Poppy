/**
 * The companion profile — the port of backend/companion.py.
 *
 * Only the fields P1 needs are declared so far; the rest arrive with the modules
 * that own them (streak, garden, loops). The declaration list matters for the same
 * reason it does on desktop: `update()` writes only keys it knows about, and a
 * field missing from here is silently dropped. That exact bug cost a day on
 * desktop when every streak write vanished, so new fields go in _DEFAULTS first.
 */

import { traitsFor } from './characters';
import { readJson, writeJson } from './store';

const FILE = 'companion.json';

export type Profile = {
  onboarded: boolean;
  character: string;
  companion_name: string;
  gender: string;
  voice: string;
  vibe: string;
  avatar: string;
  created_at: string | null;
  last_call_date: string | null;
  current_streak: number;
  longest_streak: number;
  total_calls: number;
  update_check_off?: boolean;
  update_seen?: Record<string, unknown>;

  // Streak state, owned by streak.ts. Declared here because update() writes only
  // keys it knows about: on desktop every streak_* write vanished for a day
  // because of exactly that rule.
  streak_last_date?: string | null;
  streak_freezes?: number;
  streak_fragments?: number;
  streak_freeze_mark?: number;
  streak_freeze_notice?: number;
  streak_frozen_days?: string[];
  streak_met_days?: string[];
  streak_broken_at?: string | null;
  streak_broken_from?: number;
  streak_repair_month?: string | null;
  long_year_marked?: boolean;

  // The open loop and the daily layer.
  open_loop?: Record<string, unknown> | null;
  loops?: Record<string, unknown>[];
  quests_day?: string | null;
  quests?: Record<string, unknown>[];
  daily_goal?: string | null;
  daily_layer_off?: boolean;
  bloom_points?: number;
  bloom_day?: Record<string, unknown> | null;
  bloom_today?: number;
  garden?: Record<string, unknown>[];
  ritual_kind?: string | null;
  ritual_time?: string | null;
  ritual_dismissed_day?: string | null;
  ritual_pact_asked_on?: string | null;
  ritual_pact_asks?: number;
  ritual_pact_declined?: boolean;
  pact?: Record<string, unknown> | null;
  closeness?: number;
  plan?: string;
  model_tier?: string | null;
  calls_day?: Record<string, unknown> | null;
};

export const DEFAULTS: Profile = {
  onboarded: false,
  character: 'poppy',
  companion_name: 'Poppy',
  gender: 'female',
  voice: 'af_heart',
  vibe: 'friend',
  avatar: 'brunette',
  created_at: null,
  last_call_date: null,
  current_streak: 0,
  longest_streak: 0,
  total_calls: 0,
  streak_last_date: null,
  streak_freezes: 1, // one in hand from the start, so a first miss is soft
  streak_fragments: 0,
  streak_freeze_mark: 0,
  streak_freeze_notice: 0,
  streak_frozen_days: [],
  streak_met_days: [],
  streak_broken_at: null,
  streak_broken_from: 0,
  streak_repair_month: null,
  long_year_marked: false,
  open_loop: null,
  loops: [],
  quests_day: null,
  quests: [],
  daily_goal: null,
  daily_layer_off: false,
  bloom_points: 0,
  bloom_day: null,
  bloom_today: 0,
  garden: [],
  ritual_kind: null,
  ritual_time: null,
  ritual_dismissed_day: null,
  ritual_pact_asked_on: null,
  ritual_pact_asks: 0,
  ritual_pact_declined: false,
  pact: null,
  closeness: 0,
  plan: 'plus',
  model_tier: null,
  calls_day: null,
};

export async function profile(): Promise<Profile> {
  const saved = await readJson<Partial<Profile>>(FILE, {});
  // Defaults first so a profile written by an older build gains new fields
  // instead of returning undefined for them.
  return { ...DEFAULTS, ...saved };
}

/** Write only known keys, exactly like desktop. Unknown keys are dropped. */
export async function update(patch: Partial<Profile>): Promise<Profile> {
  const current = await profile();
  const next = { ...current };
  for (const key of Object.keys(patch) as Array<keyof Profile>) {
    if (key in DEFAULTS || key === 'update_check_off' || key === 'update_seen') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = patch[key];
    }
  }
  await writeJson(FILE, next);
  return next;
}

/** Onboard: pick a character, and take their name, gender and voice with it. */
export async function create(character = 'poppy'): Promise<Profile> {
  const t = traitsFor(character);
  return update({
    onboarded: true,
    character,
    companion_name: t.name,
    gender: t.gender,
    voice: t.voice ?? DEFAULTS.voice,
    created_at: new Date().toISOString(),
  });
}

export async function setCharacter(character: string): Promise<Profile> {
  const t = traitsFor(character);
  return update({
    character,
    companion_name: t.name,
    gender: t.gender,
    voice: t.voice ?? DEFAULTS.voice,
  });
}

// ── Closeness ────────────────────────────────────────────────────────────────

/**
 * How well she knows the user, as a stage.
 *
 * Endowed progress: once onboarding is done this never reads "New". The user starts
 * at "Getting to know you" because they have in fact already started, and a first
 * sight of zero is the single most anti-retention thing a surface can show.
 *
 * Driven by memories and calls, deliberately not by minutes — that is the metric
 * that ends up optimising for time-on-app instead of for the person.
 */
export const CLOSENESS_STAGES = [
  'New',
  'Getting to know you',
  'Knows you',
  'Knows you well',
  'Knows you better than most people do',
];

/** [stage, calls needed, memories needed] */
const CLOSENESS_THRESHOLDS: Array<[number, number, number]> = [
  [2, 5, 3],
  [3, 15, 8],
  [4, 40, 20],
];

export async function closeness(memoryCount = 0): Promise<{ stage: number; label: string }> {
  const p = await profile();
  if (!p.onboarded) return { stage: 0, label: CLOSENESS_STAGES[0] };
  const calls = p.total_calls ?? 0;
  let stage = 1;
  for (const [idx, needCalls, needMemories] of CLOSENESS_THRESHOLDS) {
    if (calls >= needCalls && memoryCount >= needMemories) stage = idx;
  }
  return { stage, label: CLOSENESS_STAGES[stage] };
}
