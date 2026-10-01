/**
 * Hello, answered by code.
 *
 * ── Why this is not the model's job ───────────────────────────────────────────
 *
 * Three attempts to make the 0.6B answer "Hi" like a person:
 *
 *   1. A forty-token cap on greetings. Fixed the length, not the subject: "Hi" came
 *      back as "The sun's just beginning to set, and the world is still a blur of
 *      color." Short scenery instead of long scenery.
 *   2. Removing the clause that invited her to bring her own day in unprompted.
 *      Helped elsewhere, not here.
 *   3. An explicit instruction: greet them back, ask how they are, do not describe
 *      where you are. A 3B follows it exactly ("Hi! How are you?"). The 0.6B followed
 *      half of it on one turn ("How's the day been, my friend? It was a big one. I've
 *      been enjoying myself at that corner market…") and none of it on the next.
 *
 * The instruction reaches the model — that was verified on desktop — so this is not a
 * wording problem. A model this size does not hold an instruction reliably, and the
 * constraint that it must stay this size is a real one: a bigger model on a phone means
 * a longer download, a hotter device and a slower first token.
 *
 * So the turn that must never be wrong stops being a generation. Hello is the first
 * thing a new user ever sees, it has exactly one correct shape, and that shape does not
 * need a language model. Everything else still goes to her.
 *
 * What this deliberately does NOT do: canned answers for ordinary conversation. The
 * pattern here is narrow on purpose — an exact-match greeting and nothing else — because
 * the moment it starts guessing at intent it becomes a worse model than the one it is
 * standing in front of.
 */

/** Two of anything is a pattern, so there are enough that it is not one. */
const RETURNING: string[] = [
  'Hey! How are you doing?',
  'Hi you. How has your day been?',
  'Hey, good to hear from you. How are you?',
  'Hi! What have you been up to?',
  'Hey. How are you doing today?',
];

const MORNING: string[] = [
  'Morning! How did you sleep?',
  'Hey, good morning. How are you feeling today?',
];

const EVENING: string[] = [
  'Hey. How was your day?',
  'Evening! How did today treat you?',
];

const LATE: string[] = [
  'Hey, you are up late. How are you doing?',
  'Hi. Still awake? How are you?',
];

/**
 * The first hello of all, which is the only one that gets to say her name.
 *
 * Every later greeting that introduced her again would be a small tell that nothing is
 * being remembered, which is the opposite of the thing being sold.
 */
function firstEver(name: string): string[] {
  return [
    `Hey, I'm ${name}. Good to finally hear from you. How are you doing?`,
    `Hi! I'm ${name}. How are you?`,
  ];
}

/**
 * Never the same line twice running.
 *
 * Reported from a phone: three greetings in a row came back word for word identical,
 * which reads as a recording rather than a person. Random choice from five lines
 * repeats about one time in five, and a repeat is exactly the tell this screen cannot
 * afford.
 */
let last = '';

function pick(list: string[]): string {
  const fresh = list.filter((l) => l !== last);
  const from = fresh.length ? fresh : list;
  last = from[Math.floor(Math.random() * from.length)];
  return last;
}

/**
 * A greeting in her voice, or null when this turn is not a greeting after all.
 *
 * `hour` and `first` are passed in rather than read here so the whole thing stays a
 * pure function: the same inputs give the same range of outputs, and a test can ask for
 * three in the morning without waiting until three in the morning.
 */
export function greetingReply(name: string, hour: number, first: boolean): string {
  if (first) return pick(firstEver(name || 'Poppy'));
  if (hour >= 22 || hour < 5) return pick(LATE);
  if (hour < 11) return pick(MORNING);
  if (hour >= 17) return pick(EVENING);
  return pick(RETURNING);
}
