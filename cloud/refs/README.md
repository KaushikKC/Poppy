# Character voice reference clips

Drop one clean **~10 second, single-speaker WAV** per character here. Chatterbox
clones the voice from it, so this clip *is* the character's voice.

Expected filenames (mapped in `voice_server.py` -> `SPEAKER_REFS`):

| File | Character |
|---|---|
| `poppy.wav` | Poppy |
| `luna.wav`  | Luna |
| `zoe.wav`   | Zoe |
| `leo.wav`   | Leo |
| `kai.wav`   | Kai |
| `ravi.wav`  | Ravi |

Guidelines for a good reference clip:
- ~10s, one speaker, no background music or noise, natural speaking tone.
- Mono or stereo WAV is fine; 24 kHz+ preferred.
- The voice must be **ours to use** (generated or licensed), not scraped.

A character with no clip here still works — it falls back to Chatterbox's built-in
default voice. Check which clips the server sees at `GET /health` -> `refs_present`.

**Do not commit real voice clips to git** (size + rights). They live on the box.
