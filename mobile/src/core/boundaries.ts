/**
 * "Never ask me about X" — the port of backend/boundaries.py.
 *
 * Two kinds of standing rule: subjects to avoid, and things to always do. Only the
 * avoid side has teeth, and it has them in more than one place, because a prompt
 * instruction alone was measured and found insufficient: with a memory about the
 * subject in her context, the on-device 3B raised it in 3 of 4 replies anyway.
 * Withholding the memory from the prompt is what actually worked.
 *
 * Matching is on the topic's own words appearing in the text. Deliberately blunt:
 * over-blocking costs a hook that could have been used, under-blocking means raising
 * the one thing the user asked her not to.
 */

import { readJson, writeJson } from './store';

const FILE = 'boundaries.json';

export type Rules = { avoid: string[]; always: string[] };

const EMPTY: Rules = { avoid: [], always: [] };

export async function get(): Promise<Rules> {
  const r = await readJson<Rules>(FILE, EMPTY);
  return { avoid: r.avoid ?? [], always: r.always ?? [] };
}

const STOP = new Set(['it', 'that', 'this', 'anything', 'things', 'stuff', 'them', 'there']);
const STRIP = /^(?:the|my|our|that|this|about|it|any)\s+/i;

function clean(topic: string): string | null {
  let t = (topic || '').trim().toLowerCase().replace(/[.!?,]+$/, '');
  t = t.replace(STRIP, '').trim();
  if (!t || STOP.has(t)) return null;
  return t;
}

function tokens(text: string): Set<string> {
  return new Set((text || '').toLowerCase().match(/[a-z0-9']+/g) ?? []);
}

export async function add(kind: 'avoid' | 'always', topic: string): Promise<Rules> {
  const t = clean(topic);
  const rules = await get();
  if (!t) return rules;
  if (!rules[kind].includes(t)) {
    rules[kind].push(t);
    await writeJson(FILE, rules);
  }
  return rules;
}

export async function remove(kind: 'avoid' | 'always', topic: string): Promise<Rules> {
  const rules = await get();
  const t = (topic || '').trim().toLowerCase();
  rules[kind] = rules[kind].filter((x) => x !== t);
  await writeJson(FILE, rules);
  return rules;
}

/** Does this touch something she was told to leave alone? */
export async function isBlocked(text: string): Promise<boolean> {
  if (!text) return false;
  const words = tokens(text);
  const { avoid } = await get();
  for (const topic of avoid) {
    const topicWords = tokens(topic);
    if (topicWords.size === 0) continue;
    let all = true;
    for (const w of topicWords) {
      if (!words.has(w)) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/** The rules, as a prompt fragment. */
export async function asPromptBlock(): Promise<string> {
  const { avoid, always } = await get();
  const lines: string[] = [];
  for (const t of avoid) lines.push(`- Never bring up ${t}.`);
  for (const t of always) lines.push(`- Always ${t}.`);
  if (!lines.length) return '';
  return `\n\nRules the user set:\n${lines.join('\n')}`;
}
