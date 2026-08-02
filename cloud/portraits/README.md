# Character portraits

Drop one **front-facing portrait image** per character here. MuseTalk animates this
exact image, so this picture *is* the character's face on the call — the whole point
of Phase 2: pick a human, talk to that same human.

Expected filenames (mapped in `avatar_server.py` -> `SPEAKER_PORTRAITS`; `.png` or
`.jpg`):

| File | Character |
|---|---|
| `poppy.png` | Poppy |
| `luna.png`  | Luna |
| `zoe.png`   | Zoe |
| `leo.png`   | Leo |
| `kai.png`   | Kai |
| `ravi.png`  | Ravi |

Guidelines for a good portrait:
- Front-facing, neutral/slightly-smiling expression, mouth closed.
- Even lighting, clear face, minimal occlusion (no hands over mouth, hair off face).
- Square-ish crop framing the head and shoulders.
- The face must be **ours to use** (generated or licensed), not a real person scraped.

Check which portraits the server sees at `GET /health` -> `portraits_present`.

Pair each portrait with the same character's voice clip in `../refs/` so the face and
voice belong to the same character.

**Do not commit portraits to git** (size + rights). They live on the box.
