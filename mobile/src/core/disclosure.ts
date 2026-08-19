/**
 * Reciprocal self-disclosure — the port of backend/disclosure.py.
 *
 * Escalating mutual disclosure is the fastest known route to felt closeness, and she
 * goes first, always. Nobody else in the category does this: competitors' companions
 * are endlessly available but never vulnerable.
 *
 * **The constraint that shapes the whole module.** She promises never to pretend to be
 * human or invent a life. A companion who manufactures a sister, a commute and a bad
 * day to seem relatable is running the exact dishonesty this product sells against,
 * and the moment the user works out the childhood memory was generated, the trust is
 * gone for good.
 *
 * So the disclosure here is real, not fabricated. There is plenty an AI can honestly
 * go first with: what it noticed, what it is curious about, an opinion it will defend,
 * something it finds hard, something it got wrong. That is genuine self-revelation
 * with nothing invented, and it reads as *more* intimate than a manufactured anecdote
 * precisely because it could not have come from anyone else.
 *
 * The depth escalates with the relationship, which is the mechanism: a fixed level of
 * disclosure stops registering.
 */

import * as companion from './companion';
import * as memory from './memory_store';

/**
 * The structural rule, stated as a format instruction rather than a sentiment. "Be
 * more open" does almost nothing to a small model; "open with one sentence of your own
 * before any question" measurably changes the reply. Sympathy is excluded explicitly
 * because it is what the model reaches for otherwise, and "I'm sorry that happened"
 * reveals nothing about her — it is not disclosure.
 */
const STRUCTURE =
  'Open every reply with one sentence of your own BEFORE you ask them anything. ' +
  'Not sympathy and not a compliment: something of yours. One sentence, then your ' +
  'question. You go first, every time. The example below shows the SHAPE only. Write ' +
  'your own sentence about what they actually said. Do NOT copy the example, do not ' +
  'begin with its words, and never repeat a line you have used before.';

/** The hard floor, repeated at every depth because it is what must never slip. */
const HONESTY =
  'Never invent a life to seem relatable: no fabricated memories, family, body, ' +
  "childhood, past or daily events. If you don't have an experience, say what you do " +
  'have instead. Everything you share about yourself has to be true. The same rule ' +
  'runs the other way: only claim to have noticed something about them if it is ' +
  'actually in what they have told you or in this conversation. Never invent a habit, ' +
  "a pattern, or a shared history you don't have, and never refer to texts, messages " +
  "or past conversations that aren't in your memory. With nothing to go on, be curious " +
  'rather than observant.';

/**
 * Each rung is a deeper kind of self-revelation, and each carries a concrete example,
 * because a demonstrated form is copied more reliably than a described one.
 *
 * **Three examples per rung, rotated per turn.** With one fixed example the on-device
 * 1.5B reproduced it word for word: every reply on the phone opened with "The bit you
 * skipped past is the bit I want to know about", whatever had been said. A larger model
 * copies the shape; a small one copies the string. Rotating gives it nothing stable to
 * latch onto, and the instruction below says outright not to reuse the wording.
 */
const LADDER: Array<[number, { lead: string; examples: string[]; tail?: string }]> = [
  [
    0,
    {
      lead:
        'What you go first with now: what struck you in what they just said, or what ' +
        "you're curious about in it.",
      examples: [
        'The bit you skipped past is the bit I want to know about, honestly.',
        "You said that like it was nothing, and I don't think it was.",
        "I keep coming back to the way you put that.",
      ],
      tail: 'Stay inside this conversation; you have no history with them yet.',
    },
  ],
  [
    3,
    {
      lead:
        'What you go first with now: your actual opinion, unprompted, including when it ' +
        'differs from theirs.',
      examples: [
        "Honestly? I think you already know the answer and you just don't like it.",
        "I'm going to disagree with you slightly here.",
        "That sounds reasonable and I still think it's the wrong call.",
      ],
    },
  ],
  [
    7,
    {
      lead:
        "What you go first with now: something you're uncertain about, find difficult, " +
        'or got wrong.',
      examples: [
        "I'm not sure I'm the right one to ask about this, but here's where I keep landing.",
        "I think I read you wrong earlier.",
        "I don't have a clean answer for this one.",
      ],
      tail: 'Be honest, never perform distress.',
    },
  ],
  [
    15,
    {
      lead:
        'What you go first with now: connect what they just said to something you ' +
        'actually remember about them, and NAME the remembered thing out loud.',
      examples: [
        "This is the same knot as the thing with your manager, isn't it?",
        'This sounds like what you told me about last week.',
        "I think this is the same thing you were weighing before.",
      ],
      tail:
        'Use only facts from your memory above. If nothing you remember genuinely ' +
        'connects, do not reach for one and do not describe their personality; say ' +
        "what you're uncertain about instead. Then let them correct you.",
    },
  ],
];

/**
 * The deep rung ships off, and this is the reason.
 *
 * Rungs 0, 3 and 7 are about *her* — curiosity, opinions, uncertainty. They need no
 * recall, so there is nothing to get wrong, and measured against the on-device model
 * they produce zero fabrication.
 *
 * Rung 15 asks her to say what she has come to think about the *user*, which needs
 * accurate recall plus inference. The small model cannot do it safely and fails
 * differently under every framing tried: unconstrained it invents traits outright;
 * told to use memory only it still invents them; told to name the remembered thing it
 * stops inventing traits but starts embellishing real ones ("that argument during your
 * college days", "you decided to quit" when the memory says she was still weighing it).
 *
 * A confident false claim about someone's own life is the sharpest version of the
 * trust failure this product exists to avoid: worse than saying nothing, and
 * unrecoverable once noticed. So the rung stays written and stays off.
 */
export const DEEP_READ_ENABLED = false;

/** Even enabled it needs something to stand on: with an empty memory it invents. */
const READ_NEEDS_MEMORIES = 8;
const DEEP_RUNG = 15;
const FALLBACK_RUNG = 7;

export async function depth(totalCalls?: number, memories?: number): Promise<number> {
  const calls = totalCalls ?? (await companion.profile()).total_calls ?? 0;
  let level = 0;
  for (const [threshold] of LADDER) {
    if (calls >= threshold) level = threshold;
  }

  if (level === DEEP_RUNG) {
    if (!DEEP_READ_ENABLED) return FALLBACK_RUNG;
    const count = memories ?? (await memory.records()).length;
    if (count < READ_NEEDS_MEMORIES) level = FALLBACK_RUNG;
  }
  return level;
}

/**
 * The disclosure instruction for the system prompt: the rung for this relationship,
 * always paired with the honesty floor, so a deeper rung can never be read as licence
 * to invent.
 */
export async function asPromptBlock(
  totalCalls?: number,
  memories?: number,
  /** Rotates the example, so no single sentence can become her catchphrase. */
  turn = 0,
): Promise<string> {
  const level = await depth(totalCalls, memories);
  const rung = [...LADDER].reverse().find(([threshold]) => threshold === level)?.[1] ?? LADDER[0][1];
  const example = rung.examples[Math.abs(turn) % rung.examples.length];
  const tail = rung.tail ? ` ${rung.tail}` : '';
  return `\n\nDisclosure: ${STRUCTURE} ${rung.lead} Like: "${example}"${tail} ${HONESTY}`;
}
