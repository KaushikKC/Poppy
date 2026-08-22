/**
 * Characters the user writes themselves — the port of backend/custom_characters.py.
 *
 * The generated cast in characters.ts is six people we chose. This is the other half:
 * a name, a voice and a paragraph describing who they are, written by the user and
 * sitting in the picker beside ours.
 *
 * A custom character is a `personality` paragraph and little else. That paragraph goes
 * into the system prompt in exactly the slot a built-in's own personality line occupies
 * (see characters.systemPromptFor), so it is assembled by the same function and the
 * model cannot tell the difference.
 *
 * The caps are the reason this is not a free-text field: the paragraph rides in the
 * prompt on every turn, and the prompt is the largest part of the wait before the
 * first word. On a phone that matters more than it does on the desktop, not less.
 *
 * The values here are held in step with the Python by tests/test_custom_characters.js
 * rather than by generation: unlike the prompt fragments, none of this is wording the
 * model reads.
 */

import { CAST, PERSONALITY, systemPromptFor, traitsFor } from './characters';
import { readJson, writeJson } from './store';

const FILE = 'characters_custom.json';

export const PREFIX = 'custom:';

// The prompt-bearing fields, and what they cost. `personality` is the character; the
// rest is presentation.
export const NAME_MAX_CHARS = 40;
export const TAGLINE_MAX_CHARS = 60;
export const PERSONALITY_MAX_CHARS = 700;
export const GREETING_MAX_CHARS = 200;

export type Voice = { key: string; label: string; gender: string };

// The voices the TTS actually has a speaker id for. Offering anything else would
// silently fall back to a default voice, which reads as the app ignoring the choice.
export const VOICES: Voice[] = [
  { key: 'af_heart', label: 'Warm', gender: 'female' },
  { key: 'af_bella', label: 'Bright', gender: 'female' },
  { key: 'af_nicole', label: 'Soft', gender: 'female' },
  { key: 'am_adam', label: 'Easy', gender: 'male' },
  { key: 'am_fenrir', label: 'Deep', gender: 'male' },
  { key: 'am_michael', label: 'Steady', gender: 'male' },
];

const VOICE_KEYS: Record<string, Voice> = Object.fromEntries(VOICES.map((v) => [v.key, v]));

export const DEFAULT_VOICE = 'af_heart';

export type CustomCharacter = {
  key: string;
  name: string;
  voice: string;
  gender: string;
  accent: string;
  tagline: string;
  personality: string;
  greeting: string;
  color: { face: string; gradient: string; eyes: string; outline: string; glow: string };
  custom: true;
};

// Picked for the user rather than asked for. A colour picker is a decision nobody
// wants to make about someone they are inventing, and every one of these already
// reads against the app's cream and sky.
export const PALETTE: CustomCharacter['color'][] = [
  { face: '#2d1b3d', gradient: '#4a2d5f', eyes: '#c9a5f0', outline: '#a06fd6', glow: '160,111,214' },
  { face: '#1b2d3d', gradient: '#2d4a5f', eyes: '#8fd4f0', outline: '#4fa8d6', glow: '79,168,214' },
  { face: '#3d2b1b', gradient: '#5f452d', eyes: '#f0c98f', outline: '#d6994f', glow: '214,153,79' },
  { face: '#1b3d2b', gradient: '#2d5f45', eyes: '#8ff0b5', outline: '#4fd68a', glow: '79,214,138' },
  { face: '#3d1b28', gradient: '#5f2d42', eyes: '#f08fae', outline: '#d64f7d', glow: '214,79,125' },
];

function trimTo(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function newKey(name: string): string {
  const slug =
    (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'character';
  // Two characters called "Kai" must not overwrite one another, so the key carries a
  // short random tail rather than being the slug alone.
  const tail = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${PREFIX}${slug}-${tail}`;
}

async function load(): Promise<CustomCharacter[]> {
  const rows = await readJson<CustomCharacter[]>(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

/** Coerce whatever came off the wire into something safe to prompt with. */
export function normalise(
  payload: Record<string, unknown>,
  existing?: CustomCharacter | null,
): CustomCharacter {
  const old = (existing ?? {}) as Partial<CustomCharacter>;
  const name = trimTo(payload.name ?? old.name, NAME_MAX_CHARS);
  let voice = String(payload.voice ?? old.voice ?? DEFAULT_VOICE);
  if (!VOICE_KEYS[voice]) voice = DEFAULT_VOICE;
  return {
    key: old.key ?? newKey(name),
    name,
    voice,
    // Gender follows the voice rather than being asked separately: it only exists to
    // choose an avatar and a set of pronouns, and a voice the user picked is a better
    // signal than a question they did not want to answer.
    gender: VOICE_KEYS[voice].gender,
    accent: 'american',
    tagline: trimTo(payload.tagline ?? old.tagline, TAGLINE_MAX_CHARS),
    personality: trimTo(payload.personality ?? old.personality, PERSONALITY_MAX_CHARS),
    greeting: trimTo(payload.greeting ?? old.greeting, GREETING_MAX_CHARS),
    color: old.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
    custom: true,
  };
}

export async function allCharacters(): Promise<CustomCharacter[]> {
  return load();
}

export async function get(key: string): Promise<CustomCharacter | null> {
  if (!key || !key.startsWith(PREFIX)) return null;
  return (await load()).find((c) => c.key === key) ?? null;
}

/** Create, or update in place when the payload carries a key we already hold. */
export async function save(payload: Record<string, unknown>): Promise<CustomCharacter> {
  const rows = await load();
  const key = payload.key as string | undefined;
  const existing = key ? rows.find((c) => c.key === key) ?? null : null;
  const row = normalise(payload, existing);
  if (!row.name) throw new Error('a character needs a name');
  const next = existing ? rows.map((c) => (c.key === row.key ? row : c)) : [...rows, row];
  await writeJson(FILE, next);
  return row;
}

export async function remove(key: string): Promise<boolean> {
  const rows = await load();
  const kept = rows.filter((c) => c.key !== key);
  if (kept.length === rows.length) return false;
  await writeJson(FILE, kept);
  return true;
}

// ── Resolving a character, whoever wrote it ─────────────────────────────────

export type ResolvedCharacter = {
  key: string;
  name: string;
  voice: string;
  gender: string;
  greeting: string;
  /** True for a character the user wrote. The retention scaffolding checks this. */
  custom: boolean;
  /** The core plus their personality: what the model is told it is. */
  system_prompt: string;
};

/**
 * The twin of characters.get() in Python, and the one place that knows how a
 * character is turned into a prompt on this platform.
 *
 * An unknown key resolves to the default rather than throwing, which is what happens
 * when a custom character is deleted while the profile still points at it.
 */
export async function resolve(key: string | null | undefined): Promise<ResolvedCharacter> {
  const custom = key ? await get(key) : null;
  if (custom) {
    return {
      key: custom.key,
      name: custom.name,
      voice: custom.voice,
      gender: custom.gender,
      greeting: custom.greeting,
      custom: true,
      system_prompt: systemPromptFor(custom.name, custom.personality),
    };
  }
  const builtIn = key && PERSONALITY[key] ? key : 'poppy';
  const t = traitsFor(builtIn);
  return {
    key: builtIn,
    name: t.name,
    voice: t.voice,
    gender: t.gender,
    greeting: '',
    custom: false,
    system_prompt: systemPromptFor(t.name, PERSONALITY[builtIn]),
  };
}

/**
 * What GET /characters returns: our cast first, then theirs. No photo path on a
 * custom character — there is no portrait to find, and asking the picker for one only
 * produces a failed request per character on every render.
 */
export async function uiList(): Promise<Record<string, unknown>[]> {
  // CAST already carries custom: false, generated from the same ui_list() the desktop
  // serves, so ours go out exactly as generated.
  const ours: Record<string, unknown>[] = CAST.map((c) => ({ ...c }));
  const theirs = (await load()).map((c) => ({
    key: c.key,
    name: c.name,
    gender: c.gender,
    tagline: c.tagline || '',
    color: c.color,
    photo: null,
    custom: true,
  }));
  return [...ours, ...theirs];
}
