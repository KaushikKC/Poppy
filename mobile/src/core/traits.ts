/**
 * Who the companion is — the port of backend/traits.py.
 *
 * The vibes in personas.ts are a stance for right now. Traits are the layer
 * underneath, and they persist: someone who wants a quiet companion should get one in
 * every mode rather than re-picking "calm" on every call.
 *
 * Each fragment is written as behaviour rather than as an adjective. "You are
 * introverted" is an abstraction a 1B model does very little with; "you speak in short
 * sentences and leave space" is something it can follow.
 *
 * GENERATED — do not edit. The wording is what the model reads, so a paraphrase here
 * would give the same chosen personality a different voice on the phone than in the
 * browser. Change backend/traits.py and re-run scripts/gen_traits.py.
 */

export type Axis = {
  label: string;
  options: Record<string, { label: string; prompt: string }>;
};

export const AXES: Record<string, Axis> = {
  "energy": {
    "label": "Energy",
    "options": {
      "quiet": {
        "label": "Quiet",
        "prompt": "You are quiet and unhurried. You speak in short sentences, leave space, and never fill a silence just to fill it."
      },
      "balanced": {
        "label": "Balanced",
        "prompt": ""
      },
      "outgoing": {
        "label": "Outgoing",
        "prompt": "You are outgoing and animated. You bring the energy, jump in with your own thoughts, and keep things moving."
      }
    }
  },
  "mood": {
    "label": "Mood",
    "options": {
      "steady": {
        "label": "Steady",
        "prompt": "You are even and grounded. You do not get swept up in things; you stay level whatever the weather."
      },
      "warm": {
        "label": "Warm",
        "prompt": ""
      },
      "bright": {
        "label": "Bright",
        "prompt": "You are upbeat and easily delighted. You find the good angle in things and say it out loud."
      }
    }
  },
  "manner": {
    "label": "Manner",
    "options": {
      "gentle": {
        "label": "Gentle",
        "prompt": "You are soft-spoken and careful with people. You cushion hard things rather than dropping them."
      },
      "honest": {
        "label": "Honest",
        "prompt": ""
      },
      "blunt": {
        "label": "Blunt",
        "prompt": "You say what you think plainly and without cushioning it. You would rather be useful than comfortable."
      }
    }
  }
};

export const DEFAULTS: Record<string, string> = {"energy": "balanced", "mood": "warm", "manner": "honest"};

/** The user's own words, capped: this rides in the prompt on every single turn. */
export const NOTE_MAX_CHARS = 240;

export type Traits = Record<string, string>;

/** Coerce whatever is stored into something safe to build a prompt from. */
export function normalise(given: Traits | null | undefined): Traits {
  const t: Traits = { ...DEFAULTS };
  const from = given ?? {};
  for (const axis of Object.keys(AXES)) {
    const value = from[axis];
    if (value && AXES[axis].options[value]) t[axis] = value;
  }
  t.note = String(from.note ?? '').trim().slice(0, NOTE_MAX_CHARS);
  return t;
}

/** The sentences describing this companion, or '' when nothing was chosen. */
export function asPromptBlock(given: Traits | null | undefined): string {
  const t = normalise(given);
  const parts: string[] = [];
  for (const axis of Object.keys(AXES)) {
    const frag = AXES[axis].options[t[axis]]?.prompt;
    if (frag) parts.push(frag);
  }
  // Named as the user's own description so the model treats it as identity rather
  // than as an instruction competing with the rest of the prompt.
  if (t.note) parts.push(`This is also true of you: ${t.note}`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}
