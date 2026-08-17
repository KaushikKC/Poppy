#!/usr/bin/env python3
"""Regenerate mobile/src/core/prompts.ts from backend/config.py.

The safety addenda are the words that shape her replies when someone is
struggling. A paraphrase would change behaviour in the moments that matter most,
with nothing to catch it, so they are generated rather than retyped.

    python3 mobile/scripts/gen_prompts.py
"""
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
os.environ.setdefault("POPPY_DATA_DIR", tempfile.mkdtemp())
sys.path.insert(0, str(ROOT / "backend"))

import config  # noqa: E402

TEMPLATE = """/**
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
export const SAFETY_ADDENDUM = %s;

/** Added only when the safety layer flags the acute tier. */
export const CRISIS_ADDENDUM = %s;

/** Added for the softer, non-acute tier: support without alarm. */
export const DISTRESS_ADDENDUM = %s;
"""

target = ROOT / "mobile" / "src" / "core" / "prompts.ts"
target.write_text(TEMPLATE % (
    json.dumps(config.SAFETY_ADDENDUM),
    json.dumps(config.CRISIS_ADDENDUM),
    json.dumps(config.DISTRESS_ADDENDUM),
))
print(f"wrote {target.relative_to(ROOT)}")
