# Photoreal avatar face

The avatar in the app is rendered by `frontend/photo_avatar.js`. It animates a
**single still portrait** into a talking head — no GPU, no ML at runtime, so it
runs on the same hardware as the rest of the pipeline. It works by:

- shifting the lower face down a few pixels (a jaw-drop) while you speak,
- compositing a dark mouth interior + teeth into the gap,
- choosing mouth width (round `O/U` vs wide `E/I`) from the audio spectrum,
- blinking with a skin-toned eyelid, and breathing subtly when idle.

If no face is set up here, the app automatically falls back to the cartoon
avatar (`avatar.js`) — nothing breaks.

## 1. Add a face

Drop a portrait in this folder named **`face.jpg`** (or `.png`):

- roughly **square**, head-and-shoulders, face centred and looking forward,
- neutral, **closed-mouth** expression (the engine opens the mouth itself),
- even lighting, plain-ish background.

Good sources (do this **once, offline** — it never runs at chat time):
- an AI headshot / Stable Diffusion portrait,
- a licensed stock photo,
- your own photo.

That's the only required step. Reload the app and the portrait will talk.

## 2. Calibrate the boxes (one time)

The engine needs to know where the mouth and eyes are. Defaults assume a
centred face; to fine-tune for your photo, open:

```
http://localhost:8000/?avatartune=1
```

Coloured boxes are drawn over the mouth (pink) and eyes (green/blue). Edit the
normalized coordinates in **`config.json`** until each box sits over the right
feature, then reload. All values are fractions of the canvas (0–1):

| key          | meaning                                    |
|--------------|--------------------------------------------|
| `cx`, `cy`   | box centre (x, y)                          |
| `w`, `h`     | box width / height                         |
| `jawDrop`    | max lower-face shift while speaking (~0.05) |
| `mouthScale` | audio→openness sensitivity (1.0 default)   |
| `skin`       | eyelid tint; `null` = auto-sample from photo |

## 3. (Optional) Maximum fidelity — pre-rendered visemes

The single-photo jaw-drop looks good and is the default. For sharper,
truly photoreal mouth shapes you can pre-render a set of mouth frames **once**,
offline, with a tool like [LivePortrait](https://github.com/KwaiVGI/LivePortrait)
or [SadTalker](https://github.com/OpenTalker/SadTalker) (these need a capable
GPU, so run them on another machine and copy the PNGs over). That sprite mode
is not wired up yet — open an issue / ask and it can be added as a `visemes/`
folder the engine crossfades between.
