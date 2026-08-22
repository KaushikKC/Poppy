#!/usr/bin/env python3
"""Regenerate mobile/src/core/traits.ts from backend/traits.py.

The fragments are prompt content: the exact wording is what the model follows, and a
paraphrase on one platform would give the same chosen personality a different voice on
the phone than in the browser, with nothing to catch it. So they are generated, the
same way the personas and the safety patterns are.

    python3 mobile/scripts/gen_traits.py
"""
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
os.environ.setdefault("POPPY_DATA_DIR", tempfile.mkdtemp())
sys.path.insert(0, str(ROOT / "backend"))

import traits  # noqa: E402

OUT = ROOT / "mobile" / "src" / "core" / "traits.ts"

axes = {
    axis: {
        "label": spec["label"],
        "options": {k: {"label": lbl, "prompt": frag} for k, (lbl, frag) in spec["options"].items()},
    }
    for axis, spec in traits.AXES.items()
}

ts = f'''/**
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

export type Axis = {{
  label: string;
  options: Record<string, {{ label: string; prompt: string }}>;
}};

export const AXES: Record<string, Axis> = {json.dumps(axes, indent=2, ensure_ascii=False)};

export const DEFAULTS: Record<string, string> = {json.dumps(traits.DEFAULTS, ensure_ascii=False)};

/** The user's own words, capped: this rides in the prompt on every single turn. */
export const NOTE_MAX_CHARS = {traits.NOTE_MAX_CHARS};

export type Traits = Record<string, string>;

/** Coerce whatever is stored into something safe to build a prompt from. */
export function normalise(given: Traits | null | undefined): Traits {{
  const t: Traits = {{ ...DEFAULTS }};
  const from = given ?? {{}};
  for (const axis of Object.keys(AXES)) {{
    const value = from[axis];
    if (value && AXES[axis].options[value]) t[axis] = value;
  }}
  t.note = String(from.note ?? '').trim().slice(0, NOTE_MAX_CHARS);
  return t;
}}

/** The sentences describing this companion, or '' when nothing was chosen. */
export function asPromptBlock(given: Traits | null | undefined): string {{
  const t = normalise(given);
  const parts: string[] = [];
  for (const axis of Object.keys(AXES)) {{
    const frag = AXES[axis].options[t[axis]]?.prompt;
    if (frag) parts.push(frag);
  }}
  // Named as the user's own description so the model treats it as identity rather
  // than as an instruction competing with the rest of the prompt.
  if (t.note) parts.push(`This is also true of you: ${{t.note}}`);
  return parts.length ? ` ${{parts.join(' ')}}` : '';
}}
'''

OUT.write_text(ts)
print(f"wrote {OUT.relative_to(ROOT)}: {len(axes)} axes")
