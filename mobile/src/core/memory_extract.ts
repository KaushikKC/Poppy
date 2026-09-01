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

/**
 * Examples, not instructions.
 *
 * The old prompt described what a fact was — "a short third-person fact" — and a 0.6B
 * answered with keywords: {"text": "John"}, {"text": "dinner"}, {"text": "cinema"}.
 * Saved, that becomes a memory block reading "- John / - dinner / - cinema", which
 * tells the model nothing, so she could not say who was coming or what you were doing.
 * Measured on the base model too, so this is the prompt's fault and not the fine-tune's.
 *
 * Three worked examples fixed it: the same message came back as "Their friend is coming
 * today", "They are going to have dinner with John", "They are going to the cinema".
 * A small model imitates far better than it follows.
 */
const SYSTEM =
  "You extract durable facts about the USER from a message, for a companion's memory.\n" +
  'Output ONLY a JSON array. Each item is {"text": a full third-person sentence about ' +
  'the user, "category": profile|goals|people|ongoing|temporary}.\n' +
  'Each text must be a COMPLETE SENTENCE starting with "They" or "Their". Never a ' +
  'single word, and never "I" or "my" — the fact is about them, not about you.\n\n' +
  'Message: "my sister Priya is visiting next week and we are going to Goa"\n' +
  '[{"text": "Their sister is called Priya.", "category": "people"}, ' +
  '{"text": "Priya is visiting them next week.", "category": "temporary"}, ' +
  '{"text": "They are going to Goa with Priya.", "category": "temporary"}]\n\n' +
  'Message: "I work as an accountant and I hate spreadsheets"\n' +
  '[{"text": "They work as an accountant.", "category": "profile"}, ' +
  '{"text": "They hate spreadsheets.", "category": "profile"}]\n\n' +
  'Message: "what do you think"\n[]';

const QUESTION =
  /^\s*(who|what|when|where|why|how|do|does|did|is|are|can|could|would|will|should|have|has|any)\b|\?\s*$/i;

/** Worth asking the model about at all. Questions are skipped. */
/**
 * Worth asking the model about at all.
 *
 * Questions are skipped, because "what should I do today" holds nothing to remember.
 * But a message is not a question just because it ends in one, and that distinction
 * was missing: "Today I went to the gym, I met a friend, his name is Sam and we are
 * planning to go to the cinema today. What do you think?" was thrown away whole — the
 * only message in the conversation that carried a fact, discarded for its last six
 * words. The Memory tab stayed empty and she could not say who Sam was.
 *
 * So a message qualifies if any sentence in it is a statement worth reading, whatever
 * the sentence after it does.
 */
export function worthExtracting(text: string): boolean {
  const t = (text || '').trim();
  if (t.split(/\s+/).length < 3) return false;
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.some(
    (s) => s.split(/\s+/).length >= 4 && !QUESTION.test(s.trim()),
  );
}

/** The user's own sentence, tidied into something she can read back later. */
function asFact(text: string): string {
  const t = (text || '').split(/\s+/).join(' ').slice(0, 140).replace(/[ ,.;]+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

type Candidate = { text: string; category: memory.Category };

/**
 * Pull the JSON array out of whatever the model wrapped it in.
 *
 * Including when it did not wrap it at all. The fine-tuned 0.6B answers this prompt
 * with the objects and no enclosing brackets:
 *
 *     {"text": "Sam is a childhood friend", "category": "people"}, {"text": …}
 *
 * which is correct in every way that matters and parsed as nothing, because the old
 * version keyed on indexOf('['). Every extracted fact was silently discarded, so the
 * memory block was always empty, so she never remembered anything — and the model then
 * took the blame for it. The facts were being found and thrown away.
 */
export function parseCandidates(raw: string): Candidate[] {
  let slice: string | null = null;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start >= 0 && end > start) {
    slice = raw.slice(start, end + 1);
  } else {
    // No array wrapper: take everything from the first brace to the last and supply
    // the brackets ourselves. One bare object parses the same way.
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) slice = `[${raw.slice(first, last + 1)}]`;
  }
  if (!slice) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Candidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as Record<string, unknown>).text ?? '').trim();
    if (!text) continue;
    // "John" is not a fact. Fragments were what the old prompt produced, and a bad
    // memory is worse than a missing one: it is handed to the model as established
    // truth on every turn afterwards, and only a person noticing ever removes it.
    if (text.split(/\s+/).length < 3) continue;
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
  if (!clean || !worthExtracting(clean)) return [];

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
