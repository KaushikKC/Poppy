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
  color: CharacterColor;
  photo: string;
};

/** Exactly what GET /characters returns (backend/characters.py ui_list()). */
export const CAST: Character[] = '''

FOOTER = '''

export function traitsFor(key: string) {
  return TRAITS[key] ?? TRAITS.poppy;
}
'''

out = (
    HEADER
    + json.dumps(data, indent=2)
    + ";\n\n/** Voice + gender per character, for the profile written at onboarding. */\n"
    + "export const TRAITS: Record<string, { voice: string; gender: string; name: string }> =\n  "
    + json.dumps(traits, indent=2)
    + ";"
    + FOOTER
)
target = ROOT / "mobile" / "src" / "core" / "characters.ts"
target.write_text(out)
print(f"wrote {target.relative_to(ROOT)} ({len(data)} characters)")
