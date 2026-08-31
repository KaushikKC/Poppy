/**
 * Durable memory — the port of backend/memory_store.py.
 *
 * Facts she remembers about the user: categorised, editable, deletable, capped, and
 * with a TTL on the temporary ones so they expire on their own.
 *
 * ## On encryption, honestly
 *
 * Desktop encrypts the file with Fernet and keeps the key beside it, which protects
 * against casual inspection rather than a determined local attacker, since anyone
 * who can read the data can read the key.
 *
 * Here the file lives in the app's container, which iOS encrypts with Data
 * Protection: unreadable while the device is locked, and inaccessible to other apps
 * at any time by the sandbox. For a phone that is a stronger guarantee than a key
 * next to the ciphertext, so this does not reimplement Fernet.
 *
 * It is a deliberate difference, not an oversight. If we later want the file
 * unreadable even while the device is unlocked, the key belongs in the Keychain,
 * and `Cipher` below is the seam for that — no caller changes.
 */

import { readJson, writeJson } from './store';
import * as boundaries from './boundaries';

export const CATEGORIES = [
  'profile',
  'goals',
  'people',
  'ongoing',
  'temporary',
  'sensitive',
] as const;
export type Category = (typeof CATEGORIES)[number];

const DEFAULT_CATEGORY: Category = 'ongoing';
const TEMPORARY_TTL_DAYS = 14;
const MAX_FACTS = 60;

/** How many facts reach the prompt. A cap protects time-to-first-token. */
const PROMPT_FACTS = 15;

export type Record = {
  id: string;
  text: string;
  category: Category;
  why: string | null;
  created_at: string;
  expires_at: string | null;
  sensitive: boolean;
};

type Store = {
  records: Record[];
  suppressed: Category[];
};

const EMPTY: Store = { records: [], suppressed: [] };

/** Per character, like desktop: switching companions must not leak memories. */
let character = 'poppy';

export function setCharacter(key: string): void {
  character = key || 'poppy';
}

function file(): string {
  return `memory_${character}.json`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function load(): Promise<Store> {
  const store = await readJson<Store>(file(), EMPTY);
  const records = store.records ?? [];
  const now = Date.now();
  const live = records.filter(
    (r) => !r.expires_at || new Date(r.expires_at).getTime() > now,
  );
  if (live.length !== records.length) {
    // Expired facts are dropped on read and the pruning is persisted, so a
    // temporary fact cannot come back after a restart.
    const pruned: Store = { records: live, suppressed: store.suppressed ?? [] };
    await writeJson(file(), pruned);
    return pruned;
  }
  return { records: live, suppressed: store.suppressed ?? [] };
}

export async function records(): Promise<Record[]> {
  return (await load()).records;
}

export async function recall(): Promise<string[]> {
  return (await records()).map((r) => r.text);
}

export async function suppressedCategories(): Promise<Category[]> {
  return (await load()).suppressed;
}

export async function remember(
  text: string,
  category: Category = DEFAULT_CATEGORY,
  why: string | null = null,
  sensitive = false,
): Promise<Record | null> {
  const clean = (text || '').trim();
  if (!clean) return null;
  const cat = (CATEGORIES as readonly string[]).includes(category)
    ? category
    : DEFAULT_CATEGORY;

  const store = await load();
  if (store.records.some((r) => r.text.toLowerCase() === clean.toLowerCase())) {
    return null; // duplicate
  }

  // A fact about *today* is false tomorrow, and fourteen days of it is a fortnight of
  // her telling you where you went. Reported from a phone: a day after mentioning the
  // beach, asked where he was going, she answered "You were at the beach today, right?"
  //
  // The wording is what dates it. "They are going to the beach today" cannot outlive
  // the day; "Priya is visiting next week" is exactly what the fortnight is for.
  const today = /\b(today|tonight|this (morning|afternoon|evening)|right now)\b/i.test(clean);
  const days = cat === 'temporary' ? (today ? 1 : TEMPORARY_TTL_DAYS) : 0;
  const expires = days ? new Date(Date.now() + days * 86400_000).toISOString() : null;

  const record: Record = {
    id: newId(),
    text: clean,
    category: cat,
    why: (why || '').trim() || null,
    created_at: nowIso(),
    expires_at: expires,
    sensitive: Boolean(sensitive),
  };

  store.records.push(record);
  store.records = store.records.slice(-MAX_FACTS);
  await writeJson(file(), store);
  return record;
}

export async function update(id: string, text: string): Promise<Record | null> {
  const clean = (text || '').trim();
  if (!clean) return null;
  const store = await load();
  const found = store.records.find((r) => r.id === id);
  if (!found) return null;
  found.text = clean;
  await writeJson(file(), store);
  return found;
}

export async function remove(id: string): Promise<boolean> {
  const store = await load();
  const before = store.records.length;
  store.records = store.records.filter((r) => r.id !== id);
  if (store.records.length === before) return false;
  await writeJson(file(), store);
  return true;
}

export async function suppressCategory(category: Category): Promise<void> {
  if (!(CATEGORIES as readonly string[]).includes(category)) return;
  const store = await load();
  if (!store.suppressed.includes(category)) {
    store.suppressed.push(category);
    await writeJson(file(), store);
  }
}

/** Forget everything for the current character only. */
export async function forgetAll(): Promise<void> {
  await writeJson(file(), { records: [], suppressed: [] });
}

// ── Prompt injection ─────────────────────────────────────────────────────────

const STOP = new Set(
  (
    "i you a an the to of and or but is am are was were be been being do does did " +
    'have has had my me we us our your it its this that these those for on in at with ' +
    'as so if then than out up down over just really also not no yes get got go going ' +
    'about into from by he she they them his her their what when where who how why'
  ).split(' '),
);

function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().match(/[a-z0-9']+/g) ?? []) {
    if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/**
 * The facts most worth injecting this turn. Identity facts are pinned; the rest are
 * ranked by word overlap with the message, recency breaking ties, so a turn that
 * matches nothing degrades to "most recent" rather than to nothing.
 */
export async function relevant(
  query: string | null,
  limit = PROMPT_FACTS,
): Promise<string[]> {
  // A subject she was asked never to raise is withheld from the prompt entirely.
  // Instructing her not to mention it is not enough: measured against the on-device
  // 3B, with the memory present she raised it in 3 of 4 replies. The memory block
  // handed her the topic while the instruction asked her to ignore it, and the
  // instruction lost. The fact is kept, because the rule may be lifted and deleting
  // it would be a second decision made on the user's behalf.
  const all = await records();
  const recs: Record[] = [];
  for (const r of all) {
    if (!(await boundaries.isBlocked(r.text))) recs.push(r);
  }
  if (recs.length <= limit) return recs.map((r) => r.text);

  const q = tokens(query || '');
  const index = new Map(recs.map((r, i) => [r.id, i]));

  const pinned = recs.filter((r) => r.category === 'profile');
  const others = recs.filter((r) => r.category !== 'profile');
  others.sort((a, b) => {
    const d = overlap(q, tokens(b.text)) - overlap(q, tokens(a.text));
    if (d !== 0) return d;
    return (index.get(b.id) as number) - (index.get(a.id) as number);
  });

  const chosen: Record[] = [];
  const seen = new Set<string>();
  for (const r of [...pinned, ...others]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    chosen.push(r);
    if (chosen.length >= limit) break;
  }
  // Chronological again, so the prefix stays stable between turns and the prompt
  // cache is not invalidated by reordering.
  chosen.sort((a, b) => (index.get(a.id) as number) - (index.get(b.id) as number));
  return chosen.map((r) => r.text);
}

export async function asPromptBlock(query: string | null = null): Promise<string> {
  const facts = await relevant(query);
  if (!facts.length) return '';
  return `\n\nThings you remember about the user:\n${facts.map((f) => `- ${f}`).join('\n')}`;
}
