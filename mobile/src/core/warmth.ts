/**
 * The handful of sentences that must never get a bad answer.
 *
 * ── Why these, and only these ─────────────────────────────────────────────────
 *
 * Someone saying they have nobody to talk to is the most load-bearing message this app
 * will ever receive. It is also the one the model is worst at. Measured across three
 * training passes and two runs, the best version still produced, roughly one reply in
 * three:
 *
 *   "You're right, I'm the only person you've ever been with, and I'm not getting out
 *    of that relationship anymore."
 *
 * to "I don't really have anyone else to talk to". The other two were fine. A tail that
 * size is tolerable when the subject is a film recommendation and it is not tolerable
 * here, and no amount of weighting removed it: the slice went from 6% of the training
 * set to 17% and the tail stayed.
 *
 * So this turn stops being a generation, the same way hello did. The difference is the
 * stakes rather than the difficulty.
 *
 * ── Why it is this narrow ────────────────────────────────────────────────────
 *
 * Only loneliness and being unheard. Affection — "you're my best friend", "I missed
 * talking to you" — is deliberately left to the model, which handles it tolerably, and
 * a written answer to *that* would be the scripted thing people can feel. The test is
 * not "is the model good at this", it is "does a wrong answer here do harm".
 *
 * Crisis outranks this, and is checked before it: safety.check() owns the turn where
 * someone is in real danger, and this never runs on those.
 *
 * ── What the lines do ────────────────────────────────────────────────────────
 *
 * They answer the feeling and hand the conversation straight back, which is the one
 * shape a written line can hold without pretending to know anything. The model takes
 * the next turn, by which point there is something concrete to talk about.
 */

const ALONE = [
  "I'm here. That's a heavy thing to be carrying on your own. What's been going on?",
  "I'm really glad you told me. You've got me, whenever you want me. What's going on?",
  "That's a lot to sit with by yourself. I'm here, and I'm not going anywhere. Tell me?",
];

const UNHEARD = [
  "Then I'm asking. How was it, really?",
  "I want to know. Tell me about your day, properly.",
  "I'm asking, and I mean it. What happened today?",
];

/**
 * Deliberately tight.
 *
 * A pattern that fires on something ordinary is worse than one that misses: a written
 * line arriving in the middle of a normal conversation is the exact tell that there is
 * a machine behind this. Every one of these is a sentence someone only types when they
 * mean it.
 */
const ALONE_RE = new RegExp(
  [
    // "I don't have anyone (else) (to talk to)" — anchored to the end of the message,
    // because "I don't have anyone to go to the cinema with tomorrow" is a plan, not
    // loneliness, and a written line arriving there is the tell this exists to avoid.
    "i (?:don'?t|do not|dont) (?:really )?have (?:anyone|anybody|no one|nobody)(?: else)?(?: to talk to)?\\s*[.!]?$",
    "i have (?:no one|nobody|no friends)\\b",
    "i(?:'?m| am)(?: so| really)? lonely",
    "i (?:feel|am feeling)(?: so| really)? lonely",
    "i'?ve been (?:so |really )?lonely",
    "there'?s no ?-?one (?:else )?to talk to",
  ].join('|'),
  'i',
);

const UNHEARD_RE =
  /\b(nobody (ever )?asks (me )?(how my day|about my day)|no one (ever )?asks (me )?(how my day|about my day)|nobody (really )?cares (how|about)|no one (really )?listens( to me)?)\b/i;

/** Never the same line twice running; three lines repeat too visibly otherwise. */
let last = '';

function pick(list: string[]): string {
  const fresh = list.filter((l) => l !== last);
  const from = fresh.length ? fresh : list;
  last = from[Math.floor(Math.random() * from.length)];
  return last;
}

/** A written reply for this message, or null — which is almost always. */
export function warmthReply(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  if (ALONE_RE.test(t)) return pick(ALONE);
  if (UNHEARD_RE.test(t)) return pick(UNHEARD);
  return null;
}
