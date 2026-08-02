# Poppy Cloud GPU — setup & run

The heavy, realistic models run here on an AWS **g5** GPU (paid with your $500
credits), not on the Mac. Phase 1 = **voice** (Chatterbox, per-character cloned
voices). Phase 2 (avatar) is added later. Full plan: `POPPY_CLOUD_PLAN.md`.

> **Golden rule: stop the instance when you're done.** You're billed per running
> hour (~$1/hr for g5.xlarge), not for existing. Stop-when-idle makes $500 last
> months. `aws ec2 stop-instances --instance-ids <id>` (or the console Stop button).

---

## Phase 0 — launch the box (once)

1. **Launch an EC2 instance**
   - Type: **g5.xlarge** (NVIDIA A10G 24 GB). Fallback: g4dn.xlarge (cheaper, slower).
   - AMI: **AWS Deep Learning AMI (Ubuntu)** — CUDA + PyTorch preinstalled.
   - Disk: 100 GB gp3 (model weights need room).
   - Key pair: your SSH key.

2. **Security group** — open only what you need, only to your IP:
   - SSH `22` from *your IP*.
   - App port `8600` (voice) from *your IP*. (Later: `8601` for avatar.)
   - Do **not** open `0.0.0.0/0`.

3. **Budget guardrails** (AWS Budgets, one-time):
   - Alert at $50 / $100 / $250 of spend to your email, so credits can't drain silently.

---

## Deploy the voice server (on the box)

```bash
ssh -i <key.pem> ubuntu@<ec2-ip>

git clone <this repo>            # or scp just the cloud/ folder
cd private-companion/cloud
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # torch is already on the DL AMI

# add per-character reference clips (see refs/README.md); optional to start
python voice_server.py            # loads Chatterbox, serves 0.0.0.0:8600
```

Sanity check from your laptop:
```bash
curl http://<ec2-ip>:8600/health
# {"ok":true,"loaded":true,"sample_rate":24000,"speakers":[...],"refs_present":[...]}
```

Tip: keep it running across SSH drops with `tmux` (or a systemd unit later).

---

## Point the desktop app at it

Run the Poppy backend with the cloud voice selected:

```bash
TTS_BACKEND=cloud CLOUD_GPU_URL=http://<ec2-ip>:8600 ./run.sh
```

Now every character reply is synthesized on the GPU in that character's cloned
voice. No reference clip yet for a character → Chatterbox default voice (still
realistic, just not that character's). Add clips in `refs/` and restart the server.

If the box is stopped/unreachable, cloud synthesis errors per phrase (the reply text
still streams); switch back to local instantly with `TTS_BACKEND=kokoro`.

---

## Per-character voices
Each character = one `refs/<name>.wav` (~10s, clean, single speaker). Mapping lives
in `voice_server.py` → `SPEAKER_REFS`. See `refs/README.md`.

---

## Phase 2 — the avatar (MuseTalk talking-head)

Gives each character a **real photoreal face** that speaks the reply, driven by a
portrait + the cloned voice. Runs on the same g5, next to the voice server.

1. **Install MuseTalk** on the box (separate from this repo):
   ```bash
   git clone https://github.com/TMElyralab/MuseTalk ~/MuseTalk
   # follow its README: create its env, download weights into models/
   ```

2. **Wire the render wrapper** — edit `musetalk_render.sh` and replace the TODO with
   the real MuseTalk inference call for the version you installed (it takes
   `<image> <audio> <output.mp4>`). Kept as a wrapper so `avatar_server.py` stays
   independent of any one MuseTalk release.

3. **Add portraits** — one front-facing image per character in `portraits/`
   (`poppy.png`, `luna.png`, …). See `portraits/README.md`.

4. **Open port `8601`** in the security group (to your IP only).

5. **Run both servers** (voice first, then avatar — the avatar server calls the
   voice server on localhost for audio):
   ```bash
   python voice_server.py &                    # 8600
   AVATAR_RENDER_CMD='./musetalk_render.sh {image} {audio} {output}' \
     python avatar_server.py                    # 8601
   ```
   Check: `curl http://<ec2-ip>:8601/health` → lists `portraits_present`.

6. **Point the desktop at it** (video avatar mode):
   ```bash
   AVATAR_BACKEND=video \
   CLOUD_AVATAR_URL=http://<ec2-ip>:8601 \
   CLOUD_GPU_URL=http://<ec2-ip>:8600 ./run.sh
   ```
   Now each reply comes back as that character's face speaking, in their voice. In
   video mode the clip carries the audio, so the phrase-by-phrase voice stream is
   skipped. If a portrait/render is missing the reply still completes (the UI keeps
   the local avatar). Switch back anytime with `AVATAR_BACKEND=3d`.

## Measure the REAL cost (no estimates)

Two real numbers give you true cost, and neither is a guess:

1. **$/hour** — AWS's own price. You see it at launch (EC2 → instance type shows the
   On-Demand rate for your region) and again in the bill. That number is real; nobody
   needs to estimate it.
2. **seconds per call** — only the hardware can tell you. Run the benchmark on the box:
   ```bash
   python bench.py --n 20                 # times voice + avatar, 20 calls each
   # in another shell, watch the GPU:  nvidia-smi dmon
   ```
   It prints min/median/max seconds per voice synth and per avatar render (dropping
   the cold first call), and calls-per-running-hour. Pass `--rate <your $/hr>` to also
   see $/call from *your* real rate.

3. **The proof in dollars** — stop the box, then AWS Console → **Billing → Cost
   Explorer** (group by Usage Type, hourly granularity) shows exactly what your test
   run cost; **Billing → Credits** shows credits consumed. That is the ground truth.

**Cheapest way to run this test:**
- Start on the smallest GPU box (**g4dn.xlarge**, T4) just to prove it works and get
  seconds/call. Try **g6.xlarge** (L4) / **g5.xlarge** (A10G) after, to see if faster
  hardware is worth it.
- Use a **Spot** instance for the test (~60-70% cheaper than On-Demand; fine for a
  benchmark that can be interrupted).
- **Stop** the instance the second you're done. You pay per running-hour only.
- Set an AWS **Budgets** alert first so a forgotten box can't drain credits.

## Ports
| Port | Server | Purpose |
|---|---|---|
| 8600 | `voice_server.py` | Chatterbox cloned voices |
| 8601 | `avatar_server.py` | MuseTalk talking-head clips (calls 8600) |

## Per-character faces
Each character = one `portraits/<name>.png` front-facing image. Mapping lives in
`avatar_server.py` → `SPEAKER_PORTRAITS`. See `portraits/README.md`.

## Cost cheat-sheet
| Instance | GPU | ~$/hr | $500 covers |
|---|---|---|---|
| g5.xlarge | A10G 24GB | ~$1.01 | ~500 hrs |
| g4dn.xlarge | T4 16GB | ~$0.53 | ~950 hrs |

Stop when idle. Watch spend in AWS Budgets.
