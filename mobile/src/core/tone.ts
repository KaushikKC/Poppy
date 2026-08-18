/**
 * Tone shaping — generated from backend/emotion.py and backend/accent.py.
 *
 * ## Why detection is not shipped on iOS v1
 *
 * On desktop the emotion in someone's voice is read by a wav2vec2 classifier, and the
 * accent by another. Together those are ~1.1 GB of models, for a feature that is OFF
 * by default on desktop because it adds seconds to every turn.
 *
 * Shipping them here would roughly double the first-run download and push a 6 GB
 * iPhone past what it can hold alongside the language model, Whisper and Kokoro. So
 * the detection does not ship, and `/settings` reports `detection: false` honestly
 * rather than offering a toggle that does nothing.
 *
 * Accent mapping is not carried across: on desktop she speaks in her character's
 * own fixed voice rather than one chosen from the user's accent, so the mapping has
 * no job here.
 *
 * The emotion *mapping* ships, because it is small and because the shaping is the valuable
 * half: if an emotion ever arrives from anywhere — a future ONNX classifier, or the UI
 * — the tone instruction is already correct. With no emotion the tone is neutral and
 * nothing is added to the prompt, which is exactly the desktop default.
 *
 * GENERATED — change the Python and re-run scripts/gen_tone.py.
 */

export const NEUTRAL = 'neutral';

/** Whether voice-based detection is available on this platform. */
export const DETECTION_AVAILABLE = false;

/** Raw classifier label -> our canonical emotion. */
export const RAW_TO_EMOTION: Record<string, string> = {
  "neu": "neutral",
  "hap": "happy",
  "ang": "angry",
  "sad": "sad"
};

/** Tone guidance appended to the system prompt. Neutral adds nothing. */
export const EMOTION_TONE: Record<string, string> = {
  "neutral": "",
  "happy": "The user sounds upbeat and happy. Warmly match their positive energy.",
  "sad": "The user sounds sad or low. Be especially gentle and reassuring; acknowledge how they feel before anything else, and keep a soft, unhurried tone.",
  "angry": "The user sounds frustrated or upset. Stay calm and validating; acknowledge their frustration without getting defensive, and help them feel heard."
};

/** Supported accents, and the Kokoro voice each maps to. */
export const ACCENT_VOICE: Record<string, unknown> = {};

/**
 * The tone line for an emotion, or "" for neutral and anything unrecognised.
 * Uncertainty falls back to no tone change rather than a guess.
 */
export function toneFor(emotion: string | null | undefined): string {
  if (!emotion) return '';
  return EMOTION_TONE[emotion] ?? '';
}

/** Map a raw classifier label onto our set. */
export function canonical(raw: string | null | undefined): string {
  if (!raw) return NEUTRAL;
  return RAW_TO_EMOTION[raw] ?? NEUTRAL;
}
