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
