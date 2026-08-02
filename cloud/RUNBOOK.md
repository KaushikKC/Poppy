# Poppy Cloud — full test runbook (voice + avatar + real cost)

Goal: run the realistic voice and avatar on an AWS GPU, hear/see them from the
desktop app, and get **real** cost numbers (AWS's own $/hr × measured seconds/call,
confirmed in Cost Explorer). Keep the box running only while testing.

There are two tracks:
- **Track A — Voice.** Works immediately, no extra model setup. Do this first.
- **Track B — Avatar.** Needs MuseTalk installed + `musetalk_render.sh` wired.

---

## 0. Before you launch (5 min, no cost)
1. AWS Console → **Billing → Budgets** → create a budget with an email alert at $25
   and $50 of spend. (So a forgotten box can't drain your $500.)
2. Decide the region closest to you (lower latency to the desktop).

## 1. Launch the GPU box (10 min)
1. EC2 → **Launch instance**.
2. **Instance type:** start with **g4dn.xlarge** (cheapest GPU). *Note the exact
   On-Demand $/hr AWS shows for your region — that is the real price.*
   - Optional cheaper: request it as a **Spot** instance (~60-70% off, fine for a test).
3. **AMI:** *AWS Deep Learning AMI (Ubuntu)* — CUDA + PyTorch preinstalled.
4. **Storage:** 100 GB gp3.
5. **Key pair:** your SSH key.
6. **Security group** (open only to *your* IP):
   - `22` (SSH), `8600` (voice), `8601` (avatar).
   - Do **not** use `0.0.0.0/0`.
7. Launch. Copy the instance's **public IP** and **instance id**.

## 2. Get the code on the box (2 min)
```bash
ssh -i <key.pem> ubuntu@<ec2-ip>
git clone <your repo>            # or:  scp -r cloud/ ubuntu@<ec2-ip>:~/cloud
cd private-companion/cloud       # (or ~/cloud if you scp'd just this folder)
```

---

## Track A — Voice (do this first)

### 3A. Start the voice server (one command)
```bash
./setup.sh                       # installs deps, starts voice_server on :8600
curl http://127.0.0.1:8600/health   # {"ok":true,"loaded":true,...}
```
(No reference clips yet → Chatterbox default voice. Add `refs/<name>.wav` later for
per-character voices; see `refs/README.md`.)

### 4A. Measure real per-call time (from your laptop)
```bash
python bench.py --n 20 --voice-url http://<ec2-ip>:8600 --rate <the $/hr from step 1>
```
- Prints min/median/max **seconds per voice call** (cold first call shown separately),
  calls-per-hour, and $/call from *your* rate.
- On the box, watch load in another SSH shell: `nvidia-smi dmon`.

### 5A. Hear it in the actual app (optional but convincing)
On your Mac:
```bash
TTS_BACKEND=cloud CLOUD_GPU_URL=http://<ec2-ip>:8600 ./run.sh
```
Every character reply is now synthesized on the GPU in a realistic voice.

---

## Track B — Avatar (after voice works)

### 3B. Install + wire MuseTalk (one-time, ~20-30 min)
```bash
git clone https://github.com/TMElyralab/MuseTalk ~/MuseTalk
# follow MuseTalk's README: its env + download weights into models/
```
Edit `cloud/musetalk_render.sh` → replace the TODO with the real MuseTalk call for
that version (it takes `<image> <audio> <output.mp4>`). Add one front-facing portrait
per character in `portraits/` (`poppy.png`, …; see `portraits/README.md`).

### 4B. Start both servers
```bash
./stop.sh 2>/dev/null; ./setup.sh --avatar     # voice :8600 + avatar :8601
curl http://127.0.0.1:8601/health              # check portraits_present
```

### 5B. Measure avatar per-call time (from your laptop)
```bash
python bench.py --n 10 --avatar-url http://<ec2-ip>:8601 --rate <your $/hr>
```

### 6B. See it in the app
On your Mac:
```bash
AVATAR_BACKEND=video CLOUD_AVATAR_URL=http://<ec2-ip>:8601 \
CLOUD_GPU_URL=http://<ec2-ip>:8600 ./run.sh
```
Each reply comes back as that character's real face speaking, in their voice.

---

## 7. STOP THE BOX (do not skip)
```bash
./stop.sh                                       # stops the servers
aws ec2 stop-instances --instance-ids <id>      # stops BILLING (or console → Stop)
```
You pay per running-hour. Stopped = not billed (except a few cents of disk).

## 8. Read the REAL dollars (the proof)
Next day (billing lags a few hours):
- Billing → **Cost Explorer**, group by *Usage Type*, hourly → exact $ for your run.
- Billing → **Credits** → credits consumed.

Now you have: real $/hr (AWS), real seconds/call (bench), real total (Cost Explorer).
Repeat steps 1-8 on **g6.xlarge** (L4) or **g5.xlarge** (A10G) to compare hardware.

---

## Quick reference
| Action | Command |
|---|---|
| Start voice | `./setup.sh` |
| Start voice + avatar | `./setup.sh --avatar` |
| Health | `curl http://<ip>:8600/health` / `:8601/health` |
| Benchmark | `python bench.py --n 20 --voice-url http://<ip>:8600 --avatar-url http://<ip>:8601 --rate <$/hr>` |
| Stop servers | `./stop.sh` |
| Stop billing | `aws ec2 stop-instances --instance-ids <id>` |
| Desktop, cloud voice | `TTS_BACKEND=cloud CLOUD_GPU_URL=http://<ip>:8600 ./run.sh` |
| Desktop, cloud voice+face | `AVATAR_BACKEND=video CLOUD_AVATAR_URL=http://<ip>:8601 CLOUD_GPU_URL=http://<ip>:8600 ./run.sh` |
