/**
 * Whether a finished reply is worth hearing rather than reading.
 *
 * The default is set by how the message arrived: speak to her and she speaks back,
 * type and she types back. This is the one refinement on top of that — a spoken "how
 * are you" does not deserve a four-second recording, and forcing one would teach
 * people that speaking is the slow way to use the app.
 *
 * Deterministic, and deliberately not another model pass. This runs on every turn and
 * the model is the thing on the critical path to her first word; a second inference to
 * decide the shape of the first would cost more than the decision is worth.
 *
 * It needs the finished reply, which voice mode already has in hand before it
 * synthesises anything, so it costs nothing at all.
 */

/**
 * Below this, a recording costs more than the words are worth.
 *
 * Measured on device: synthesis runs at roughly 0.9s of fixed per-call cost plus 46ms
 * a character. Sixty characters is therefore about 3.7 seconds of waiting for
 * something that can be read at a glance — the wrong trade. Past it the reply is long
 * enough that hearing it is the better experience, and the wait reads as her taking a
 * moment rather than the app being slow.
 */
export const MIN_SPOKEN_CHARS = 60;

/**
 * A greeting is a greeting at any length.
 *
 * "Hey, good to see you. How has your week been?" is seventy characters of nothing in
 * particular, and nobody wants to wait five seconds to hear it. Anchored to the start
 * and capped, so it only catches a reply that *opens* as a pleasantry and stays short
 * — a greeting followed by something real runs past the cap and is spoken.
 */
const OPENS_WITH_PLEASANTRY =
  /^[\s"']*(?:hi|hey|hello|hiya|morning|afternoon|evening|good (?:morning|afternoon|evening|to see you))\b/i;
const PLEASANTRY_MAX_CHARS = 110;

/** True when the reply should be spoken; false when it should simply be read. */
export function speakIt(reply: string): boolean {
  const text = (reply ?? '').trim();
  if (!text) return false;
  if (text.length < MIN_SPOKEN_CHARS) return false;
  if (text.length <= PLEASANTRY_MAX_CHARS && OPENS_WITH_PLEASANTRY.test(text)) return false;
  return true;
}

/**
 * "say it out loud" — the twin of reply_shape.wants_voice.
 *
 * How the message arrived is a good default, not a rule. Someone typing at their desk
 * can still want to *hear* the answer, and asking for it in the message is the obvious
 * way to say so; there is no menu for it and there should not be.
 *
 * Two cues have to appear together: something that names voice, and something that
 * makes it a request. Either alone is a false positive waiting to happen — "I love
 * your voice" names voice and asks for nothing, and "can you tell me about Lisbon" is
 * a request about nothing audible.
 */
const VOICE_CUE =
  /(?:\bout\s+loud\b|\baloud\b|\b(?:in|with|using)\s+(?:your|ur)\s+(?:\w+\s+){0,2}voice\b|\bvoice\s*(?:note|message|msg|memo|reply|recording)\b|\baudio\s*(?:note|message|msg|clip|reply|recording)?\b|\b(?:record|say)\s+(?:it|that|this)\b|\blet\s+me\s+hear\b|\bwanna\s+hear\b|\bwant\s+to\s+hear\b)/i;
const ASK_CUE =
  /\b(?:say|tell|read|reply|replies|answer|respond|send|record|speak|talk|can|could|would|will|please|plz|wanna|want|let|give)\b/i;

/**
 * True when the user asked for this reply to be spoken. Overrides the arrival default,
 * and skips the length floor with it: if someone asks to hear it, "yes, obviously" is
 * still worth hearing even though it is nowhere near MIN_SPOKEN_CHARS.
 */
export function wantsVoice(userText: string): boolean {
  const text = (userText ?? '').trim();
  if (!text) return false;
  return VOICE_CUE.test(text) && ASK_CUE.test(text);
}


/**
 * A greeting deserves a greeting, not a biography.
 *
 * Measured on the fine-tuned 0.6B: five of twelve "Hi"s came back as a paragraph about
 * her own afternoon — "I'm sitting in my office in Seattle, working on a new bridge
 * design. The room's a little too quiet…" Nobody answers hello like that, and it is the
 * first thing a new user sees.
 *
 * The cap is the fix rather than the prompt, because a model this size drifts into its
 * own life whenever it has room to and cannot reliably be told not to. Given forty
 * tokens it says one sentence, and turn.ts drops a sentence the cap cut mid-phrase.
 */
const GREETING = /^\s*(hi|hey|hello|yo|hiya|good (morning|afternoon|evening)|how are you|how'?s it going|what'?s up|sup)\b[\s!,.?]*$/i;

export function isGreeting(userText: string): boolean {
  return GREETING.test((userText || '').trim());
}

/**
 * They turned the question back on her: "good what about u", "wbu", "you tell me
 * about u". Rewritten, for the model only, into the direct question she can answer.
 *
 * A tester asked it four times in one conversation and got four questions back and
 * nothing about her ("I'm all set. What's going on with you today?"). The training set
 * has 3419 user turns and not one of them is this bounce: she was only ever asked
 * about herself out of the blue ("what are you up to?"), never after answering.
 *
 * An instruction in the system prompt was tried first. It worked on a short prompt on
 * the Mac (8 of 12) and did nothing on the phone (0 of 3), where it sat at the end of
 * the full prompt. The rewrite puts the question where the model is looking: replayed
 * on v7a with Luna's card, 15 of 15 answered from her own life, against about 3 of 10
 * as typed.
 *
 * Written for how people text: u, abt, bout, waht, wbu, hbu.
 */
const ABOUT_HER =
  /\b(?:you )?tell me about (?:you|u|urself|yourself)\b\s*\??|\b(?:what|wat|waht|how|and|n)\s*(?:about|abt|bout)\s*(?:you|u|urself|yourself)\b\s*\??|\b(?:wbu|hbu)\b\s*\??|\b(?:and|n)\s+(?:you|u)\s*\??\s*$/i;

export function asDirectQuestion(userText: string): string {
  const t = (userText || '').trim();
  if (!ABOUT_HER.test(t)) return userText;
  const rest = t.replace(ABOUT_HER, '').trim().replace(/^[\s,.?]+|[\s,.?]+$/g, '');
  return (rest ? `${rest}. ` : '') + 'How about you, what have you been doing today?';
}
