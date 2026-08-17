#!/usr/bin/env python3
"""Regenerate mobile/src/core/safety.ts from backend/safety.py.

The patterns and the resource text are safety-critical content. A typo while
retyping them could mean a missed crisis signal or a wrong helpline number, and
neither would raise an error anywhere. So they are generated from the Python,
which stays the single source of truth, and tests/test_safety.js then diffs the
two implementations over a corpus.

    python3 mobile/scripts/gen_safety.py
"""
import json
import os
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
os.environ.setdefault("POPPY_DATA_DIR", tempfile.mkdtemp())
sys.path.insert(0, str(ROOT / "backend"))

import safety  # noqa: E402

HEADER = '''/**
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

'''

FOOTER = '''
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
'''


def js_regex(source: str) -> str:
    """A Python pattern source as a JS RegExp literal body."""
    # The patterns use only constructs JavaScript shares: \b, (?:...), ?, |, [^...].
    # Forward slashes would need escaping in a literal; none are present, but check.
    if "/" in source:
        raise SystemExit(f"pattern contains a slash, escaping needed: {source!r}")
    return source


crisis = "|".join(safety._CRISIS_PATTERNS)
distress = "|".join(safety._DISTRESS_PATTERNS)
negated = safety._NEGATED.pattern

body = (
    "/** Self-harm and suicidal ideation: the acute tier. */\n"
    f"const CRISIS_RE = /{js_regex(crisis)}/i;\n\n"
    "/** Non-acute distress: the softer tier. */\n"
    f"const DISTRESS_RE = /{js_regex(distress)}/i;\n\n"
    "/** Rough negation guard: \"I don't want to kill myself\". */\n"
    f"const NEGATED_RE = /{js_regex(negated)}/i;\n\n"
    "/** Offline signposting, India first, then international. */\n"
    f"export const CRISIS_RESOURCES = {json.dumps(safety.CRISIS_RESOURCES)};\n"
)

target = ROOT / "mobile" / "src" / "core" / "safety.ts"
target.write_text(HEADER + body + FOOTER)
print(f"wrote {target.relative_to(ROOT)}")
print(f"  crisis patterns  : {len(safety._CRISIS_PATTERNS)}")
print(f"  distress patterns: {len(safety._DISTRESS_PATTERNS)}")
