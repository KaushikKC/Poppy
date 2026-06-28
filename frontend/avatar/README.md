# Full-page video avatar

The avatar is a **full-page video presence** rendered by `frontend/video_avatar.js`:
two looping, muted video layers of the same person in the same chair/background —
an **idle** loop and a **talking** loop. While the assistant's voice plays, the
app crossfades to the talking loop, then back to idle. It runs 100% locally and
costs nothing per reply.

> The lips do **not** match the exact words — word-accurate lip-sync to live
> LLM replies needs a GPU/cloud model and would break the offline/private design.
> This trades perfect lips for a genuine "real person sitting with you" feel.

Until you add clips, the app shows the static poster (`face.jpg`), so it never
looks broken.

## 1. Generate two clips (once, offline)

Use **Veo 3.1 / Google Vids**, Runway, Kling, or any video generator. Make both
clips with the **same person, framing, lighting, and background** so the
crossfade is invisible. Vertical (9:16) or square fills the screen best.

Recommended length: **6–12 s each**, and design them to **loop seamlessly**
(start and end on the same pose; or have the tool make a loop).

Suggested prompts:

- **idle.mp4** — *"A person sitting in a softly lit room, looking warmly at the
  camera, calm and attentive, gentle natural breathing, occasional blink and
  tiny head movement, mouth closed and relaxed, no talking. Static camera,
  consistent framing. Seamless loop."*
- **talk.mp4** — *"The same person in the same room and framing, speaking warmly
  to the camera with natural mouth movement and small expressive head gestures,
  engaged and friendly. Static camera. Seamless loop."*

## 2. Drop them in

Save into this folder (the app auto-detects them):

```
frontend/avatar/idle.mp4    (or idle.webm)
frontend/avatar/talk.mp4    (or talk.webm)
```

`.webm` (VP9) is preferred for smaller files and clean alpha if you ever want a
transparent background; `.mp4` (H.264) is the safe default from most tools.
Both layers should share the same dimensions.

Reload the app (`Cmd+Shift+R`) and the person comes to life — idle when
listening/thinking, talking while the voice plays.

### Notes & fallbacks
- **Only `idle.mp4`?** It plays always, with a subtle brightness/zoom cue while
  speaking (no separate talk loop).
- **No clips at all?** The static `face.jpg` poster shows.
- **A background scene**: bake it into the clips, or generate the person on a
  green/transparent background and composite — simplest is to just include the
  room in the prompt.
- Keep files reasonably small (a few MB). They're gitignored (private + large).

## Optional: word-accurate lip-sync (online mode, not built)
If you ever want exact lips, that's a cloud talking-head API (HeyGen / D-ID /
Tavus / OmniHuman) called per reply — photoreal but online, paid, and sends
audio off-device. Ask and it can be added as an opt-in "online" toggle.
