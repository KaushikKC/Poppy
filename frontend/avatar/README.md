# Full-page video avatar — how to make the clips

The avatar is a **full-page video presence** rendered by `frontend/video_avatar.js`:
two looping, muted video layers of the same person in the same chair/background —
an **idle** loop and a **talking** loop. While the assistant's voice plays, the
app crossfades to the talking loop, then back to idle. It runs 100% locally and
costs nothing per reply.

> The lips do **not** match the exact words — word-accurate lip-sync to live LLM
> replies needs a GPU/cloud model and would break the offline/private design.
> This trades perfect lips for a genuine "real person sitting with you" feel.

Until you add clips, the app shows the static poster (`face.jpg`), so it never
looks broken.

## Workflow: image first, then two videos

The most consistent way is to **generate one portrait image, then animate that
same image** into the two clips (image-to-video). That guarantees the idle and
talk loops are the exact same person, lighting, and background.

1. Generate the portrait image (prompt below) → save it.
2. In Veo 3.1 / Google Flow / Runway / Kling, use **image-to-video** with that
   image and the **idle** prompt → `idle.mp4`.
3. Same image again with the **talk** prompt → `talk.mp4`.

Aim for **9:16 vertical** (fills the screen best), **6–12 s** each, designed to
**loop seamlessly** (start and end on the same neutral pose).

---

### Step 1 — Portrait image prompt

Customize the bracketed bits to the companion you want. Keep the mouth closed and
the gaze on camera — the videos add the motion.

```
Photorealistic portrait of a [warm, friendly woman in her late 20s], [soft
shoulder-length wavy brown hair], natural skin texture, gentle genuine
closed-mouth smile, looking directly into the camera. Seated in a cozy, softly
lit living room — warm bokeh background with a glowing lamp, a few green plants,
and a neutral wall. Cinematic soft key light from the front-left, subtle rim
light, shallow depth of field. Head-and-shoulders framing, centered, at eye
level, facing forward. Calm, kind expression. Professional portrait photography,
8K, sharp focus on the eyes. Vertical 9:16 composition.

Negative / avoid: text, watermark, logo, hands near face, open mouth, teeth,
looking away, harsh shadows, distorted features, extra people.
```

Save the result as the poster too:
```
frontend/avatar/face.jpg
```

### Step 2 — Idle clip prompt (image-to-video from that portrait)

```
Animate this portrait. The person sits calmly and naturally: soft, slow
breathing, occasional gentle blink, very subtle head and shoulder micro-movements,
a faint warm smile. Eyes stay softly on the camera. Mouth stays CLOSED — she is
NOT talking. The background stays steady with only gentle ambient motion (soft
light flicker, a slight plant sway). Static, locked-off camera. Same lighting and
framing as the source image. Photorealistic, smooth, lifelike motion, calm and
welcoming mood. 8–10 seconds. Seamless loop — start and end on the same neutral
resting pose.

Avoid: talking, big movements, camera motion, zooming, changing background.
```
Save as `frontend/avatar/idle.mp4` (or `idle.webm`).

### Step 3 — Talk clip prompt (image-to-video from the SAME portrait)

```
Animate this portrait. The same person speaks warmly and naturally to the camera,
with clear visible mouth movement as if having a friendly conversation. Gentle,
expressive delivery: small natural head nods, light eyebrow movement, occasional
blink, engaged and kind eye contact. Keep the EXACT same person, lighting,
background, and framing as the idle clip. Static, locked-off camera.
Photorealistic, smooth natural lip and jaw motion. 8–10 seconds. Seamless loop —
start and end on the same neutral pose so it can crossfade cleanly with idle.

Avoid: camera motion, background changes, exaggerated cartoonish mouth, hands
covering the face.
```
Save as `frontend/avatar/talk.mp4` (or `talk.webm`).

---

## Drop them in

```
frontend/avatar/idle.mp4    (or idle.webm)
frontend/avatar/talk.mp4    (or talk.webm)
```

Both layers should share the same dimensions. `.mp4` (H.264) is the safe default;
`.webm` (VP9) is smaller. Reload the app (`Cmd+Shift+R`) and the person comes to
life — idle when listening/thinking, talking while the voice plays.

### Notes & fallbacks
- **Only `idle.mp4`?** It plays always, with a subtle brightness/zoom cue while
  speaking (no separate talk loop).
- **No clips at all?** The static `face.jpg` poster shows.
- Keep files reasonably small (a few MB). They're gitignored (private + large).
- Make both clips from the **same source image** so the crossfade is invisible.

## Optional: word-accurate lip-sync (online mode, not built)
If you ever want exact lips, that's a cloud talking-head API (HeyGen / D-ID /
Tavus / OmniHuman) called per reply — photoreal but online, paid, and sends
audio off-device. Ask and it can be added as an opt-in "online" toggle.
