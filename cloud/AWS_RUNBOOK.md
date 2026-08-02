# AWS runbook — launch a GPU box and test Ditto + MuseTalk

Full path from the AWS console to a talking-head video. Region: **eu-west-2 (London)**,
the one your GPU quota was approved in. Instance: **g4dn.xlarge** (NVIDIA T4).

Replace these placeholders as you go:
- `KEY.pem` = your SSH key file
- `IP` = the instance's public IPv4 address
- `ID` = the instance id

---

## PART A — Launch the instance (AWS Console)

1. Sign in, and **top-right region selector → Europe (London) eu-west-2**. (Your quota
   is region-specific; the wrong region shows 0.)
2. Search bar → **EC2** → left menu **Instances** → **Launch instances** (top right).
3. **Name:** `poppy-gpu`.
4. **Application and OS Image (AMI):**
   - Click **Browse more AMIs**.
   - Search **Deep Learning**.
   - Pick **Deep Learning OSS Nvidia Driver AMI (Ubuntu 22.04)** (CUDA + drivers + conda
     preinstalled). Select it.
5. **Instance type:** click the box, search **g4dn.xlarge**, select it.
6. **Key pair (login):**
   - Existing key → pick it. Otherwise **Create new key pair** → name `poppy-key`, RSA,
     `.pem` → **Create** (it downloads `poppy-key.pem` — keep it safe).
7. **Network settings → Edit:**
   - **Auto-assign public IP:** Enable.
   - **Firewall / security groups:** Create security group, add rules:
     - **SSH** — port `22` — Source **My IP**  (required)
     - **Custom TCP** — port `8600` — Source **My IP**  (for the voice server later)
     - **Custom TCP** — port `8601` — Source **My IP**  (for the avatar server later)
8. **Configure storage:** change to **100 GiB**, **gp3** (models are several GB each).
9. Right panel **Summary → Launch instance**.
10. Click the instance link → wait for **Instance state: Running** and **Status checks 2/2**.
11. Copy the **Public IPv4 address** (= `IP`) and the **Instance ID** (= `ID`).

---

## PART B — Connect and copy your test files

On your **Mac terminal**:

```bash
# make the key private (first time only)
chmod 400 ~/Downloads/poppy-key.pem

# copy a portrait + a voice clip up to the box (run from the repo folder)
scp -i ~/Downloads/poppy-key.pem \
    frontend/avatar/characters/poppy.jpg \
    cloud/refs/poppy.wav \
    ubuntu@IP:~/

# log in
ssh -i ~/Downloads/poppy-key.pem ubuntu@IP
```
Type `yes` at the first prompt. You're now on the box; your two files are in `~/`.

Quick check the GPU is there:
```bash
nvidia-smi          # should list a Tesla T4
```

---

## PART C — Test Ditto (do this first — best fit for a live call)

```bash
# 1. get the code
git clone https://github.com/antgroup/ditto-talkinghead
cd ditto-talkinghead

# 2. Use Ditto's OWN tested conda env (CUDA 12.1 + torch 2.5.1 + cuDNN 9 + numpy 2).
#    Do NOT hand-roll a pip torch install — a CUDA-version mismatch causes NumPy-2 and
#    libcudnn/libnvrtc crashes. conda sets the CUDA library paths correctly.
#    First strip the tensorrt pins (no wheel exists, and the PyTorch model doesn't need it):
sed -i '/tensorrt/d' environment.yaml
conda env create -f environment.yaml     # ~10 min; downloads the CUDA 12.1 stack
# (if the conda env already exists from a failed run: `conda env update -n ditto -f environment.yaml`)
conda activate ditto

# 3. Add the packages the yaml is missing (required by the PyTorch inference path)
pip install einops omegaconf onnxruntime-gpu mediapipe
# ^ this onnxruntime-gpu (latest) is built for CUDA 12 + numpy 2, matching the env.
#   If any run still reports "No module named X", just: pip install X  and re-run.

# 4. download the model checkpoints from HuggingFace
git lfs install
git clone https://huggingface.co/digital-avatar/ditto-talkinghead checkpoints

# 5a. sanity run on Ditto's OWN example (proves the install works)
python inference.py \
  --data_root ./checkpoints/ditto_pytorch \
  --cfg_pkl ./checkpoints/ditto_cfg/v0.4_hubert_cfg_pytorch.pkl \
  --audio_path ./example/audio.wav \
  --source_path ./example/image.png \
  --output_path ./tmp/example.mp4

# 5b. now YOUR character (time it)
time python inference.py \
  --data_root ./checkpoints/ditto_pytorch \
  --cfg_pkl ./checkpoints/ditto_cfg/v0.4_hubert_cfg_pytorch.pkl \
  --audio_path ~/poppy.wav \
  --source_path ~/poppy.jpg \
  --output_path ./tmp/poppy.mp4
```

Notes:
- We use the **PyTorch** model (`ditto_pytorch`), **not** the TensorRT one — the prebuilt
  TensorRT engines are "Ampere_Plus" and the T4 is Turing, so PyTorch is the T4-safe path.
- If a package is missing when you run, `pip install <name>` and re-run step 5.
- The `time` command prints how long it took — that's your real speed number.

---

## PART D — Test MuseTalk (banao recipe, in its own Python 3.10 env)

```bash
cd ~
git clone https://huggingface.co/spaces/banao-tech/musetalk-avatar
cd musetalk-avatar

conda create -n musetalk python=3.10 -y
conda activate musetalk

# GPU torch first (so mmcv matches), then banao's deps minus the CPU pins
pip install numpy==1.26.4
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
pip install --upgrade "setuptools==68.2.2" wheel cython poetry-core
pip install --no-build-isolation chumpy==0.70
pip install mmcv==2.0.1 -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0.0/index.html
grep -vE '^-f |^torch==|^torchvision==|^torchaudio==|^mmcv==|^numpy==' requirements.txt > reqs_gpu.txt
pip install -r reqs_gpu.txt

# weights
export MODEL_DIR=$PWD/models
bash download_weights.sh

# put your files where the config points, then run banao's exact command
mkdir -p data/custom && cp ~/poppy.jpg ~/poppy.wav data/custom/
cat > configs/inference/test.yaml <<'YAML'
space_avatar:
  video_path: "data/custom/poppy.jpg"
  audio_path: "data/custom/poppy.wav"
  bbox_shift: 0
YAML

time python -m scripts.inference \
  --inference_config configs/inference/test.yaml \
  --result_dir results/test \
  --unet_model_path $MODEL_DIR/musetalkV15/unet.pth \
  --unet_config $MODEL_DIR/musetalkV15/musetalk.json \
  --version v15 --fps 15 --batch_size 4 --bbox_shift 0 \
  --parsing_mode jaw --left_cheek_width 90 --right_cheek_width 90
```

This is the exact recipe that only failed on Colab because Colab was Python 3.12. Here,
in a real Python 3.10 conda env, it installs cleanly.

---

## PART E — Look at the results (download to your Mac)

From your **Mac terminal**:
```bash
scp -i ~/Downloads/poppy-key.pem ubuntu@IP:~/ditto-talkinghead/tmp/poppy.mp4 ~/Downloads/ditto_poppy.mp4
scp -i ~/Downloads/poppy-key.pem ubuntu@IP:'~/musetalk-avatar/results/test/*.mp4' ~/Downloads/musetalk_poppy.mp4
open ~/Downloads/ditto_poppy.mp4
open ~/Downloads/musetalk_poppy.mp4
```
Judge: does the face look like your character, is the lip-sync clean, does the head move
(Ditto should; MuseTalk won't), and how long did each take (the `time` output).

---

## PART F — STOP the box (do not skip)

Console → EC2 → Instances → select `poppy-gpu` → **Instance state → Stop instance**.
(You pay per running hour; credits cover it, but stopped = not billed. **Start** later
reuses everything; only the public IP changes.)

```bash
# or from the Mac, if you have the AWS CLI configured:
aws ec2 stop-instances --instance-ids ID --region eu-west-2
```

---

## What we're deciding from this
- **Ditto** quality + head-motion + speed on the T4 → is it the live-call avatar?
- **MuseTalk** as the fast lip-sync comparison.
- Whether our **painterly** portraits work, or we need **photoreal** faces (test one of each).
- LongCat-Video is skipped here — it's a 13.6B model that needs an A100-class GPU and is
  minutes-per-clip (offline), so it can't run on this T4 box.
