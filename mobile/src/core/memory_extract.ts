/**
 * Proposing facts worth remembering — the port of backend/memory_extract.py.
 *
 * The model reads one message and returns durable facts about the user. Two things
 * about this were learned the hard way on desktop and are kept:
 *
 * **Six candidates, not three.** A single spoken turn often carries several things
 * ("I ran a marathon today and I have an interview Friday"), and the lower cap was
 * quietly dropping the rest.
 *
 * **A last-resort keeper.** When the model returns nothing but the sentence was
 * clearly substantial, the user's own words are kept as the fact. That change took
 * capture from 3 of 6 real messages to 6 of 6. Losing something the user said is the
 * bigger mistake; a slightly awkwardly-worded memory is editable.
 */

import { awaitEngines } from './engines';
import * as memory from './memory_store';

const MAX_CANDIDATES = 6;

const SYSTEM =
  'You extract durable facts about the USER from a single message, for a warm ' +
  'companion\'s long-term memory. Output ONLY a JSON array, nothing else. Each item ' +
  'is {"text": a short third-person fact, "category": one of ' +
  'profile|goals|people|ongoing|temporary}. ' +
  'Return EVERY distinct fact in the message, not just the first one: one turn often carries several. ' +
  'Only include things genuinely worth remembering in future conversations: their ' +
  'name, stable preferences, the people in their life, their goals, and ongoing ' +
  'situations. Do NOT include questions, small talk, feelings about you, or generic ' +
  'statements. If there is nothing worth remembering, output []. ' +
  'Categories: profile = stable identity or preference; goals = something they want ' +
  'or are working toward; people = a person in their life; ongoing = a current ' +
  'situation like a trip or interview; temporary = a short-lived reminder.\n' +
  'Message: "my name is Nina and I\'m training for a marathon" -> ' +
  '[{"text":"Name: Nina","category":"profile"},{"text":"Training for a marathon","category":"goals"}]\n' +
  'Message: "how are you doing today?" -> []\n' +
  'Message: "my sister Ava is visiting this weekend" -> ' +
  '[{"text":"Sister Ava is visiting this weekend","category":"people"}]\n' +
  'Message: "I ran a marathon today and I have an interview on Friday" -> ' +
  '[{"text":"Ran a marathon","category":"ongoing"},' +
  '{"text":"Has an interview on Friday","category":"ongoing"}]';

const QUESTION =
  /^\s*(who|what|when|where|why|how|do|does|did|is|are|can|could|would|will|should|have|has|any)\b|\?\s*$/i;

/** Worth asking the model about at all. Questions are skipped. */
function worthLlm(text: string): boolean {
  const t = (text || '').trim();
  if (t.split(/\s+/).length < 3) return false;
  if (QUESTION.test(t)) return false;
  return true;
}

/** The user's own sentence, tidied into something she can read back later. */
function asFact(text: string): string {
  const t = (text || '').split(/\s+/).join(' ').slice(0, 140).replace(/[ ,.;]+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

type Candidate = { text: string; category: memory.Category };

/** Pull the JSON array out of whatever the model wrapped it in. */
function parseCandidates(raw: string): Candidate[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Candidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as Record<string, unknown>).text ?? '').trim();
    if (!text) continue;
    const rawCat = String((item as Record<string, unknown>).category ?? 'ongoing');
    const category = (memory.CATEGORIES as readonly string[]).includes(rawCat)
      ? (rawCat as memory.Category)
      : 'ongoing';
    out.push({ text: asFact(text), category });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = c.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Extract and store. Returns what was actually saved, which is what the UI shows as
 * a receipt: it is already kept, so this is not a request for permission. A prompt
 * mid-conversation interrupted the thing the app exists for, and anything not tapped
 * in time was lost.
 */
export async function extractAndSave(text: string): Promise<Array<{ text: string; category: string }>> {
  const clean = (text || '').trim();
  if (!clean || !worthLlm(clean)) return [];

  const suppressed = new Set(await memory.suppressedCategories());
  let candidates: Candidate[] = [];

  try {
    const { llm } = await awaitEngines();
    let raw = '';
    await llm.complete(SYSTEM, [{ role: 'user', content: `Message: "${clean}" ->` }], (tok) => {
      raw += tok;
    });
    candidates = parseCandidates(raw);
  } catch {
    // The model being unavailable must not lose the message; the keeper below
    // still runs.
    candidates = [];
  }

  // Nothing is kept when the model extracted nothing.
  //
  // There used to be a fallback here: if no JSON came back but the sentence looked
  // substantial, the user's own words were saved verbatim rather than "lost". That is
  // a reasonable trade with a model that usually succeeds. With the 1B it fails
  // often, and what it saved instead was raw speech-to-text — read back from a real
  // phone: "I think you are not sending", "So, you are a character which you will not
  // speak right", "I don't know really what kind of activities I can think".
  //
  // Those are not facts, and the damage is not merely untidy. They are handed to the
  // model every single turn under "Things you remember about the user", so it reads
  // half-transcribed meta-chatter as established truth about the person, mirrors that
  // register back, and answers questions about the conversation instead of the
  // question. They also cost ~150 tokens of prompt on every turn, for ever.
  //
  // A memory not taken is one conversation slightly poorer. A wrong memory is every
  // conversation after it slightly wrong, and there is nothing that removes it but a
  // person noticing.

  const saved: Array<{ text: string; category: string }> = [];
  for (const c of dedupe(candidates)) {
    if (suppressed.has(c.category)) continue;
    const rec = await memory.remember(c.text, c.category);
    if (rec) saved.push({ text: rec.text, category: rec.category });
  }
  return saved;
}
