/**
 * Writing the hook to plant at the end of a call — the port of
 * backend/loop_author.py.
 *
 * This is the module that makes every other retention surface work. Without it no
 * loop is ever created, and the home strip, slot 1 of the daily three and the outro
 * card all silently fall back forever.
 *
 * The division of labour is the important part, and it is deliberate: **the model
 * only names a topic; the templates own the sentence.** Asked to write her line
 * directly, the on-device model produces something ungrammatical or off-voice often
 * enough to matter. Asked for a noun phrase, it is reliable, and the phrasing is then
 * copy that can be read and approved.
 *
 * It always returns a hook. A call with no unresolved beat is the one outcome the
 * design does not allow, so every failure path lands on the reveal fallback.
 */

import { getEngines } from './engines';
import * as boundaries from './boundaries';
import { isHealthy } from './nudges';

const MAX_TURNS = 8;
const MAX_TOPIC_WORDS = 8;

export type Authored = { type: 'event' | 'question' | 'serial' | 'reveal'; hook: string };

const SYSTEM =
  'You read the end of a conversation and name what it was about, so a warm ' +
  'companion can follow up next time. Output ONLY a JSON object, nothing else: ' +
  '{"topic": a short noun phrase}.\n' +
  'The topic:\n' +
  '- Names the ONE thing most worth following up on.\n' +
  '- Is a NOUN PHRASE of 2 to 6 words, not a sentence, with no verb tense.\n' +
  "- Is written in the third person about the other person's life. Never use " +
  "'I', 'my', 'me', 'we' or 'you'.\n" +
  '- Uses only things actually said. Never invent a detail.\n' +
  '- Is empty if nothing specific enough came up.\n' +
  'Examples:\n' +
  'They mention an interview on Thursday -> {"topic":"the Thursday interview"}\n' +
  'They go back and forth about quitting a well paid job -> {"topic":"the decision about quitting"}\n' +
  'They are upset about what their sister Anjali said -> {"topic":"what Anjali said at dinner"}\n' +
  'They said almost nothing -> {"topic":""}';

// The type sets the half-life and the phrasing, so it is inferred from the
// transcript rather than asked for: the small model answers "serial" almost every
// time regardless of content, while these markers read the signal directly.
const DATED =
  /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:week|weekend|evening|afternoon|morning)|in\s+a\s+(?:few\s+)?(?:days?|weeks?)|later\s+this\s+week)\b/i;

const UNDECIDED =
  /\b(should\s+i|not\s+sure|unsure|torn|deciding|decide|whether|or\s+not|back\s+and\s+forth|can'?t\s+decide|thinking\s+about\s+(?:quitting|leaving|moving|taking)|considering|debating|two\s+minds)\b/i;

/**
 * A call where the user said almost nothing has no topic to name.
 *
 * Three words, not twelve. Twelve was badly wrong for a voice product: people speak
 * in short sentences, so "I'm having an interview on Friday" is a perfectly hookable
 * call that never reached the model at all. Invention is guarded by isGrounded below,
 * which is the right tool for it.
 */
const MIN_USER_WORDS = 3;

// Two variants per type: enough not to feel canned, few enough that every one can be
// read as copy. Each frame has to read correctly with ANY noun phrase, because the
// type comes from the whole transcript while the topic comes from one thread in it.
const TEMPLATES: Record<string, string[]> = {
  event: [
    'tell me what happened with {topic}, I want the whole thing.',
    'how did {topic} turn out?',
  ],
  question: [
    'have a think about {topic}. I want to hear where you land.',
    'tell me next time what you decide about {topic}.',
  ],
  serial: [
    "we're not done talking about {topic}. next time?",
    'I want to pick {topic} back up next time.',
  ],
};

/**
 * The fallback is a reveal: it needs no detail from the call, it is always true, and
 * a call with no hook is not allowed.
 *
 * Several variants because a single fixed line meant the same sentence could end
 * three calls running, and it stopped reading as her having something to say and
 * started reading as a bug — which is exactly how it was reported in testing.
 */
const FALLBACKS = [
  "there's something I've been meaning to tell you. next time, okay?",
  "I've got something to tell you, but not tonight. next time.",
  "remind me to tell you something next time. it's not bad, I promise.",
  "there's a thing I keep not saying. I'll get to it next time.",
  "I'll tell you the other thing when we next talk.",
  "something occurred to me earlier. it'll keep until next time.",
];

/**
 * A reveal hook, varied so the same sentence does not come back twice running.
 * Seeded by what was said rather than by chance, so the same conversation always
 * produces the same line and re-running a call cannot reshuffle it.
 */
function fallback(userLines: string[] = []): Authored {
  const text = userLines.join('|');
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed += (i + 1) * text.charCodeAt(i);
  return { type: 'reveal', hook: FALLBACKS[seed % FALLBACKS.length] };
}

const STOP = new Set(
  ('the a an of to and or but is am are was were be been do does did have has had my me ' +
   'we us our your it its this that these those for on in at with as so if then than about ' +
   'from by he she they them his her their what when where who how why not no yes just ' +
   'really very much some any thing things').split(' '),
);

function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of (text || '').toLowerCase().match(/[a-z0-9']+/g) ?? []) {
    if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/**
 * Is the topic built from something the user actually said?
 *
 * This is the real guard against invention. Asked to name a topic for "not much
 * today, just tired", a small model happily returns "the long conversation"; none of
 * those content words appear in what was said, so it is rejected here and the call
 * falls back to the reveal instead.
 */
function isGrounded(topic: string, userLines: string[]): boolean {
  const said = new Set<string>();
  for (const line of userLines) for (const w of contentWords(line)) said.add(w);
  const topicWords = contentWords(topic);
  if (topicWords.size === 0) return false;
  for (const w of topicWords) if (said.has(w)) return true;
  return false;
}

/** Her line must not just parrot a sentence back. */
function isEcho(hook: string, userLines: string[]): boolean {
  const h = hook.toLowerCase();
  return userLines.some((l) => {
    const t = l.toLowerCase().trim();
    return t.length > 12 && h.includes(t);
  });
}

const WRONG_PERSON = /\b(i|i'm|my|me|mine|myself|we|our|us)\b/i;
const REDUNDANT_LEAD = /^(?:the\s+)?(?:thing|topic|subject|matter)\s+(?:of|about)\s+/i;

function cleanTopic(raw: string): string | null {
  let t = (raw || '').trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '');
  t = t.replace(REDUNDANT_LEAD, '').trim();
  if (!t) return null;
  if (t.split(/\s+/).length > MAX_TOPIC_WORDS) return null;
  // First person means it wrote as the user or as herself, not about them.
  if (WRONG_PERSON.test(t)) return null;
  return t.toLowerCase();
}

function parseTopic(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as { topic?: unknown };
    return cleanTopic(String(obj.topic ?? ''));
  } catch {
    return null;
  }
}

/** Dated beats undecided: something on Thursday is more specific and shorter-fused. */
function inferType(transcript: string): 'event' | 'question' | 'serial' {
  if (DATED.test(transcript)) return 'event';
  if (UNDECIDED.test(transcript)) return 'question';
  return 'serial';
}

/**
 * Build her line. The variant is chosen by the topic itself, so the same subject
 * always comes back phrased the same way.
 */
function compose(kind: string, topic: string): string {
  const variants = TEMPLATES[kind];
  let sum = 0;
  for (const c of topic) sum += c.charCodeAt(0);
  return variants[sum % variants.length].replace('{topic}', topic);
}

/**
 * The tail of the call as a transcript, plus the user's own lines for the echo check.
 * Speakers are labelled from the reader's point of view, not hers, so the model is
 * never invited to write as "you".
 */
function transcriptOf(turns: Array<{ role?: string; content?: string }>): [string, string[]] {
  const tail = (turns ?? []).filter((t) => t.content).slice(-MAX_TURNS);
  const lines: string[] = [];
  const userLines: string[] = [];
  for (const t of tail) {
    const content = String(t.content).trim();
    if (t.role === 'user') {
      lines.push(`Person: ${content}`);
      userLines.push(content);
    } else {
      lines.push(`Companion: ${content}`);
    }
  }
  return [lines.join('\n'), userLines];
}

// The guilt guard lives in one place. This module used to carry its own smaller copy
// of the pattern list, which is exactly how two guards drift apart and the weaker one
// starts letting things through.
export { isHealthy } from './nudges';

export async function author(
  turns: Array<{ role?: string; content?: string }> = [],
): Promise<Authored> {
  const [transcript, userLines] = transcriptOf(turns);
  if (!transcript.trim()) return fallback(userLines);
  const words = userLines.reduce((n, l) => n + l.split(/\s+/).length, 0);
  if (words < MIN_USER_WORDS) return fallback(userLines);

  let raw = '';
  try {
    const { llm } = getEngines();
    await llm.complete(
      SYSTEM,
      [{ role: 'user', content: `Conversation:\n${transcript}\n\nName the follow-up topic.` }],
      (tok) => {
        raw += tok;
      },
    );
  } catch (err) {
    console.log(`[loops] hook authoring failed, using fallback: ${err}`);
    return fallback(userLines);
  }

  const topic = parseTopic(raw);
  if (!topic) return fallback(userLines);

  // The topic has to come from something they actually said, not from the model's
  // sense of what a conversation usually contains.
  if (!isGrounded(topic, userLines)) return fallback(userLines);

  // She was told not to raise this. The reveal keeps the call ending on an
  // unresolved beat without reopening the subject.
  if (await boundaries.isBlocked(topic)) return fallback(userLines);

  const kind = inferType(transcript);
  const hook = compose(kind, topic);
  if (isEcho(hook, userLines)) return fallback(userLines);
  if (!isHealthy(hook)) return fallback(userLines);

  return { type: kind, hook };
}
