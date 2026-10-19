#!/usr/bin/env python3
"""Merge a LoRA into LFM2 / LFM2.5 without `mlx_lm fuse`, which breaks this architecture.

`mlx_lm fuse` writes LFM2's short-convolution weights in MLX's own layout, so llama.cpp
refuses the GGUF ("blk.0.shortconv.conv.weight has wrong shape"), and transposing them
back still leaves a model that only says <|pad|>. The adapter itself is fine: loaded on
top of the base, it answers in character.

So this merges by hand. Load the base with the adapter, fuse each LoRA layer, and write
only the tensors that changed over Liquid's original safetensors. Everything the LoRA did
not touch is the untouched original file, in the layout convert_hf_to_gguf expects.

    python3 training/fuse_lfm.py training/adapters-lfm1 training/fused-lfm1
    python3 ~/llama.cpp/convert_hf_to_gguf.py training/fused-lfm1 --outfile poppys-lfm-f16.gguf
    ~/llama.cpp/build/bin/llama-quantize poppys-lfm-f16.gguf poppys-lfm-q4_k_m.gguf Q4_K_M
"""
import os
import shutil
import sys

import mlx.core as mx
from huggingface_hub import snapshot_download
from mlx.utils import tree_flatten, tree_unflatten
from mlx_lm import load

BASE = os.environ.get("BASE", "LiquidAI/LFM2.5-1.2B-Instruct")


def main(adapters: str, out: str) -> None:
    base = snapshot_download(BASE) if not os.path.isdir(BASE) else BASE
    model, _ = load(base, adapter_path=adapters)
    fused = [(n, m.fuse()) for n, m in model.named_modules() if hasattr(m, "fuse")]
    model.update_modules(tree_unflatten(fused))
    new = dict(tree_flatten(model.parameters()))

    ref = mx.load(os.path.join(base, "model.safetensors"))
    weights, changed = {}, 0
    for k, v in ref.items():
        nv = new.get(k)
        if nv is not None and nv.shape == v.shape and not mx.array_equal(nv.astype(mx.float32), v.astype(mx.float32)).item():
            weights[k] = nv.astype(v.dtype)
            changed += 1
        else:
            weights[k] = v
    # Every fused layer should account for exactly one changed tensor. Anything else
    # means the names no longer line up, and the "merge" would be the base model.
    if changed != len(fused):
        sys.exit(f"{len(fused)} layers fused but {changed} tensors changed; not writing")

    os.makedirs(out, exist_ok=True)
    for f in os.listdir(base):
        if f != "model.safetensors" and os.path.isfile(os.path.join(base, f)):
            shutil.copy(os.path.join(base, f), os.path.join(out, f))
    mx.save_safetensors(os.path.join(out, "model.safetensors"), weights, metadata={"format": "pt"})
    print(f"{changed} tensors merged into {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
