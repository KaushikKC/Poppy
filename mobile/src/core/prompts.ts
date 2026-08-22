/**
 * Prompt fragments, generated from backend/config.py.
 *
 * These are the words that shape how she responds when someone is struggling.
 * Generated rather than retyped so the wording cannot drift between platforms:
 * a paraphrase here would change her behaviour in the moments that matter most,
 * silently.
 *
 * GENERATED — change backend/config.py and re-run scripts/gen_prompts.py.
 */

/** Appended to every persona's system prompt. */
export const SAFETY_ADDENDUM = "";

/** Added only when the safety layer flags the acute tier. */
export const CRISIS_ADDENDUM = " The user may be in serious emotional distress. Respond with warmth and calm. Acknowledge their pain without minimizing it, do not lecture, and gently encourage them to contact a crisis line or someone they trust. Keep your reply short, caring, and human. Never provide any means or methods of self-harm. You are not a therapist and should gently say so if it matters, while staying present.";

/** Added for the softer, non-acute tier: support without alarm. */
export const DISTRESS_ADDENDUM = " The user sounds like they're having a hard time. Slow down, listen, and validate what they're feeling without trying to fix it. If it feels right, gently suggest leaning on someone they trust. Stay warm and unhurried.";

/**
 * The three switches, as this build was generated.
 *
 * On desktop these are environment variables read at startup. A phone has no
 * environment to read, so they are baked in at generation time and the build is the
 * decision: the App Store build regenerates with POPPY_ADULT=0 rather than shipping a
 * runtime toggle, which is the thing that gets an app rejected rather than rated.
 *
 * ADULT is not only prompt wording here. It also decides which weights the phone
 * downloads (model_tier.ts): an unrestricted prompt on a stock model still refuses,
 * which is a state nobody would guess from reading the prompt.
 */
export const ADULT = true;
export const GUARDRAILS = false;
export const CRISIS_LAYER = true;
