#!/usr/bin/env python3
"""Regenerate mobile/src/core/characters.ts from backend/characters.py.

The cast is content: colour values, taglines, names. Retyping it into TypeScript
invites typos that show up as a wrong-looking avatar rather than an error, so it
is generated. Run this after changing the Python.

    python3 mobile/scripts/gen_characters.py
"""
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
os.environ.setdefault("POPPY_DATA_DIR", tempfile.mkdtemp())
sys.path.insert(0, str(ROOT / "backend"))

import characters  # noqa: E402

data = characters.ui_list()

# The shared taste layer, with the name lifted back out into a placeholder. It is
# prompt content and it now differs by build (adult mode replaces the platonic steer
# and drops the length rule), so it is generated with the rest rather than retyped
# into TypeScript where it would quietly disagree with the Python.
_SENTINEL = "\x00NAME\x00"
core_template = characters._core(_SENTINEL).replace(_SENTINEL, "{name}")

# The half of a character that is not presentation. Every built-in personality goes
# into the same slot a character the user wrote does, which is what makes the two
# indistinguishable to the model.
# personality_text(), not the raw field: the manner plus the life, assembled by the
# Python so the phone cannot end up with a character who has no story on it.
personalities = {k: characters.personality_text(v) for k, v in characters.CHARACTERS.items()}
traits = {
    k: {"voice": v.get("voice"), "gender": v["gender"], "name": v["name"]}
    for k, v in characters.CHARACTERS.items()
}

HEADER = '''/**
 * The companion cast, generated from backend/characters.py.
 *
 * Generated rather than retyped: the colour values and taglines are content, and
 * a typo here would surface as a wrong-looking avatar rather than an error. To
 * update, change the Python and re-run scripts/gen_characters.py.
 */

export type CharacterColor = {
  face: string;
  gradient: string;
  eyes: string;
  outline: string;
  glow: string;
};

export type Character = {
  key: string;
  name: string;
  gender: string;
  tagline: string;
  /** One line of who they are, shown in the picker before you choose. */
  blurb: string;
  color: CharacterColor;
  photo: string;
  /** False for all of these. The picker uses it to offer an edit affordance. */
  custom: boolean;
};

/** Exactly what GET /characters returns (backend/characters.py ui_list()). */
export const CAST: Character[] = '''

FOOTER = '''

export function traitsFor(key: string) {
  return TRAITS[key] ?? TRAITS.poppy;
}

/** The shared taste layer, with this character's name in it. */
export function core(name: string): string {
  return CORE_TEMPLATE.split('{name}').join(name);
}

/**
 * What the model is told it is. Assembled the same way for a character we wrote and
 * one the user wrote: the same core, then their personality paragraph in the same
 * slot, so the model cannot tell which is which.
 */
export function systemPromptFor(name: string, personality: string): string {
  return `${core(name)} ${personality}`.trim();
}
'''

out = (
    HEADER
    + json.dumps(data, indent=2)
    + ";\n\n/** The name-agnostic taste layer (backend/characters.py _core()). */\n"
    + "const CORE_TEMPLATE =\n  "
    + json.dumps(core_template)
    + ";\n\n/** Each built-in's own personality, the half that is not presentation. */\n"
    + "export const PERSONALITY: Record<string, string> =\n  "
    + json.dumps(personalities, indent=2)
    + ";\n\n/** Voice + gender per character, for the profile written at onboarding. */\n"
    + "export const TRAITS: Record<string, { voice: string; gender: string; name: string }> =\n  "
    + json.dumps(traits, indent=2)
    + ";"
    + FOOTER
)
target = ROOT / "mobile" / "src" / "core" / "characters.ts"
target.write_text(out)
print(f"wrote {target.relative_to(ROOT)} ({len(data)} characters)")
