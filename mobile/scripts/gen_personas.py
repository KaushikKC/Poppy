#!/usr/bin/env python3
"""Regenerate mobile/src/core/personas.ts from backend/personas.py.

The mood modes are voice: each one's system prompt is what makes her sound like a
friend rather than a hype coach. A paraphrase would change her personality with
nothing to catch it, so they are generated and the Python stays the source of truth.

    python3 mobile/scripts/gen_personas.py
"""
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
os.environ.setdefault("POPPY_DATA_DIR", tempfile.mkdtemp())
sys.path.insert(0, str(ROOT / "backend"))

import personas  # noqa: E402

built = {}
for key, vibe in personas.PERSONAS.items():
    built[key] = {
        "key": key,
        "name": vibe["name"],
        "description": vibe["description"],
        "tagline": vibe["tagline"],
        # The assembled prompt, not the flavour fragment: this is the string the
        # turn loop actually sends.
        "system_prompt": personas._system_prompt(vibe),
        # The stance on its own, without the shared core in front of it. The turn
        # loop builds its prompt character-first, the way ws_handler.py does, so it
        # needs the vibe without a second copy of the core glued to the front.
        "flavor": vibe["flavor"],
        # The picker colours each button from this and does not check first
        # (persona_picker.js reads p.avatar.outline straight off the row), so leaving
        # it out of GET /personas does not degrade the picker, it throws inside it.
        "avatar": vibe["avatar"],
    }

HEADER = '''/**
 * The mood modes, generated from backend/personas.py.
 *
 * The UI sends the chosen mode with every turn, and this is what makes it change how
 * she actually talks rather than only how the button looks. Generated because each
 * prompt is her voice: a paraphrase would change her personality silently.
 *
 * GENERATED — change backend/personas.py and re-run scripts/gen_personas.py.
 */

export type Persona = {
  key: string;
  name: string;
  description: string;
  tagline: string;
  system_prompt: string;
  /** The stance alone. Appended after the character's own prompt; see socket.ts. */
  flavor: string;
  avatar: { face: string; gradient: string; eyes: string; outline: string; glow: string };
};

'''

FOOTER = '''
/** What GET /personas returns: no system prompts, which are hers not the UI's. */
export const UI_LIST = Object.values(PERSONAS).map((p) => ({
  key: p.key,
  name: p.name,
  description: p.description,
  tagline: p.tagline,
  avatar: p.avatar,
}));

export function get(key: string | null | undefined): Persona {
  return (key && PERSONAS[key]) || PERSONAS[DEFAULT_PERSONA];
}
'''

body = (
    f"export const DEFAULT_PERSONA = {json.dumps(personas.DEFAULT_PERSONA)};\n\n"
    f"export const PERSONAS: Record<string, Persona> = {json.dumps(built, indent=2)};\n"
)

target = ROOT / "mobile" / "src" / "core" / "personas.ts"
target.write_text(HEADER + body + FOOTER)
print(f"wrote {target.relative_to(ROOT)}: {len(built)} modes ({', '.join(built)})")
