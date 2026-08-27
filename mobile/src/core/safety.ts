/**
 * The safety layer, generated from backend/safety.py.
 *
 * Two tiers, offline and deliberately conservative:
 *
 *   crisis   — self-harm or suicidal signals. Surface help resources and shift the
 *              reply to calm, caring, non-directive support.
 *   distress — serious but non-acute struggle. No alarming resource card, just a
 *              softer reply and gentle encouragement toward real human support.
 *
 * Detection is simple phrase matching with a light negation guard, because the cost
 * of a false positive is low (a supportive tone and a helpline) and the cost of a
 * miss is high. This is signposting, never diagnosis.
 *
 * GENERATED — do not edit. The patterns and the helpline numbers are content, and
 * retyping them risks a missed signal or a wrong number with nothing to catch it.
 * Change backend/safety.py and re-run scripts/gen_safety.py.
 */

export type SafetyLevel = 'crisis' | 'distress' | null;

export type SafetyResult = {
  level: SafetyLevel;
  crisis: boolean;
  resources: string | null;
};

/** Self-harm and suicidal ideation: the acute tier. */
const CRISIS_RE = /\bkill(ing)? myself\b|\bend(ing)? (my life|it all|it|myself)\b|\bwant (it|this|everything) to (stop|end|be over)\b|\btake my (own )?life\b|\b(want|wanna|going) to die\b|\b(don'?t|do not) (really |even |think i )?want to (live|be alive|be here|wake up)\b|\b(don'?t|do not) want to (be around|exist|carry on)\b|\bno reason to (live|go on|be here)\b|\bbetter off (without me|dead|if i (was|were) gone)\b|\bcommit(ting)? suicide\b|\bsuicid(al|e)\b|\b(hurt|harm|cut|cutting|kill) (myself|my self)\b|\bself[- ]harm\b|\bno point (in )?(living|going on|life|anything)\b|\bcan'?t go on\b|\bgive up on life\b|\bend the pain\b/i;

/** Non-acute distress: the softer tier. */
const DISTRESS_RE = /\b(so|really|completely|utterly) (hopeless|worthless|empty|numb|alone)\b|\bnothing (matters|means anything)\b|\bcan'?t (cope|take it|do this) (anymore|any more)\b|\bat my (lowest|breaking point)\b|\bfalling apart\b|\bhate myself\b|\bwhat(?:'?s| is| was| even is) the point\b|\bgiving up\b/i;

/** Rough negation guard: "I don't want to kill myself". */
const NEGATED_RE = /\b(don'?t|do not|not|never|no)\b[^.!?]{0,20}\b(kill myself|die|suicid|hurt myself|end it)/i;

/** Offline signposting, India first, then international. */
export const CRISIS_RESOURCES = "If you're in immediate danger, call your local emergency number now (112 in India, 911 in the US, 999 in the UK).\nYou don't have to go through this alone. People are ready to listen, any time:\n\u2022 India: KIRAN 1800-599-0019 (24/7) \u00b7 Vandrevala 1860-2662-345 \u00b7 iCall 9152987821 \u00b7 AASRA +91-98204-66726\n\u2022 US: 988 Suicide & Crisis Lifeline (call or text 988)\n\u2022 UK & ROI: Samaritans \u2014 call 116 123\n\u2022 Crisis Text Line: text HOME to 741741 (US/CA), 85258 (UK)\nTalking to a real person can help, and you deserve that support.";

export function check(text: string): SafetyResult {
  if (!text) return { level: null, crisis: false, resources: null };

  if (CRISIS_RE.test(text) && !NEGATED_RE.test(text)) {
    return { level: 'crisis', crisis: true, resources: CRISIS_RESOURCES };
  }
  if (DISTRESS_RE.test(text)) {
    return { level: 'distress', crisis: false, resources: null };
  }
  return { level: null, crisis: false, resources: null };
}
