#!/bin/bash
#
# Train the companion model. Qwen3 0.6B, decided by measurement — see
# POPPY_FINETUNE_PLAN.md section 0 for why this base and not the Llama 1B.
#
# The point of this script is that it can be stopped. Training a LoRA takes under an
# hour, but the laptop cannot be handed over for a whole evening on demand, so the run
# is cut into chunks: it saves every 50 iterations and picks up from the last adapter
# it finds. Run it tonight, run it again tomorrow, and nothing is lost in between.
#
#   training/train.sh          # one chunk of 200 iterations
#   ITERS=400 training/train.sh
#   training/train.sh fuse     # merge, convert and quantise when the loss stops falling
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/training/data"
ADAPTERS="$ROOT/training/adapters"
FUSED="$ROOT/training/fused"

# Stock instruct, not an abliterated fork. Abliteration adds instability at this size
# and never bought the compliance it promised — the abliterated 1B refused 2 of 2
# explicit prompts anyway. That behaviour comes from the dataset now.
BASE="${BASE:-Qwen/Qwen3-0.6B}"
ITERS="${ITERS:-200}"

if [ "${1:-train}" = "fuse" ]; then
  [ -f "$ADAPTERS/adapters.safetensors" ] || { echo "no adapter at $ADAPTERS — train first"; exit 1; }
  echo "== fusing $BASE + adapters =="
  python3 -m mlx_lm fuse --model "$BASE" --adapter-path "$ADAPTERS" --save-path "$FUSED"
  echo
  echo "Fused into $FUSED. Convert with llama.cpp, not MLX's own GGUF export — that"
  echo "one only handles Llama-style architectures and Qwen3 is not one:"
  echo
  echo "  python llama.cpp/convert_hf_to_gguf.py $FUSED --outfile poppys-0.6b-f16.gguf"
  echo "  llama.cpp/build/bin/llama-quantize poppys-0.6b-f16.gguf poppys-0.6b-q4_k_m.gguf Q4_K_M"
  exit 0
fi

[ -f "$DATA/train.jsonl" ] || { echo "no $DATA/train.jsonl — run gen_dataset.py then split_dataset.py"; exit 1; }

# Resuming and starting fresh differ by one flag, and getting it wrong silently throws
# away last night's work, so the script decides rather than the person typing it.
resume=()
if [ -f "$ADAPTERS/adapters.safetensors" ]; then
  echo "== resuming from $ADAPTERS/adapters.safetensors =="
  resume=(--resume-adapter-file "$ADAPTERS/adapters.safetensors")
else
  echo "== fresh run =="
fi

echo "base $BASE, $ITERS iterations, saving every 50"
echo

# --mask-prompt trains on her words only. With a system message this long, repeated on
# every example, training on the prompt teaches the model to recite it.
python3 -m mlx_lm lora \
  --model "$BASE" \
  --train --data "$DATA" \
  --fine-tune-type lora \
  --num-layers 16 --batch-size 4 \
  --iters "$ITERS" --save-every 50 \
  --learning-rate 1e-5 --max-seq-length 2048 \
  --mask-prompt \
  "${resume[@]}" \
  --adapter-path "$ADAPTERS"

echo
echo "Stop when validation loss stops falling. An over-trained LoRA on a model this"
echo "small gets repetitive and starts ignoring the system prompt."
echo "Another chunk: training/train.sh   Done: training/train.sh fuse"
