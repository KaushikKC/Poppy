/**
 * Which models this phone gets — the mobile counterpart of backend/model_tier.py.
 *
 * ## Why Qwen2.5 1.5B is the default
 *
 * Researched August 2026. The 2026 write-ups favour Qwen3 1.7B on quality, and it is
 * genuinely better at structured output, which this app needs twice (memory
 * extraction and naming a loop topic, both JSON).
 *
 * It is still not the pick, because Qwen3 is a hybrid reasoning model and disabling
 * thinking through llama.cpp is unreliable (ggml-org/llama.cpp#20182: it stays on
 * despite enable_thinking:false). In a text app a leaked <think> block is untidy. In
 * a voice app it is *spoken aloud*. The tags could be stripped, but the latency
 * cannot: thinking tokens land before her first word, and first-audio is the number
 * this whole pipeline is tuned around.
 *
 * Gemma 3 1B is smaller and faster but lags at structured output, which is half the
 * workload here.
 *
 * Llama 3.2 3B is better but 1.9 GB. On a 6 GB iPhone, weights plus KV cache is
 * ~2.2 GB, and Whisper (~150 MB), Kokoro (~350 MB), the WebView and React Native sit
 * alongside it. That is roughly 3.4 GB and iOS terminates the app. It is an 8 GB-only
 * option.
 *
 * ## Apple's Foundation Models
 *
 * iOS 26 exposes Apple's own ~3B on-device model to third-party apps: no download, no
 * memory we manage, no cost. It requires A17 Pro or newer, which excludes the iPhone
 * 15, 14, 13 and 12, so it cannot be the foundation. Worth adding later as a fast path
 * on newer phones.
 */

import DeviceInfo from 'react-native-device-info';

export type Tier = '1b' | '1_5b' | '3b';

/**
 * Sizes are the real Content-Length of each URL, checked rather than estimated: the
 * progress bar reads from them, and a non-archive shorter than 98% of its size is
 * treated as truncated and deleted.
 */
export type ModelSpec = {
  /** Where it lands, relative to Documents. Must match src/models.ts. */
  path: string;
  url: string;
  bytes: number;
  label: string;
  /** tar.bz2 archives are extracted into `path` after download. */
  archive?: boolean;
};

const LLM: Record<Tier, ModelSpec> = {
  '1b': {
    path: 'models/llm/model.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    bytes: 807_690_000,
    label: 'Llama 3.2 1B',
  },
  '1_5b': {
    path: 'models/llm/model.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    bytes: 986_000_000,
    label: 'Qwen2.5 1.5B',
  },
  '3b': {
    path: 'models/llm/model.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    bytes: 2_019_000_000,
    label: 'Llama 3.2 3B',
  },
};

/** Whisper and Kokoro are the same on every tier: neither is the memory problem. */
const WHISPER: ModelSpec = {
  path: 'models/whisper/ggml-base.en.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  bytes: 147_950_000,
  label: 'Speech recognition',
};

/**
 * Kokoro v1.0, not v0.19.
 *
 * v0.19 was the first pick and it was wrong: her voice sounded robotic on device, and
 * the reason is that the characters' voices do not exist in it. Desktop uses af_heart
 * for Poppy and am_fenrir for Kai, both of which arrived in Kokoro v1.0, so v0.19 fell
 * back to speaker 0 — a blend, and the flattest voice in the set.
 *
 * v1.0 carries all 53 voices including every one the characters use, so the phone now
 * sounds like the desktop app rather than approximating it. It costs 30 MB more.
 */
const KOKORO: ModelSpec = {
  path: 'models/kokoro',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2',
  bytes: 349_418_188,
  label: 'Her voice',
  archive: true,
};

/** Total physical RAM in GB, or a conservative 4 if it cannot be read. */
export async function totalRamGb(): Promise<number> {
  try {
    const bytes = await DeviceInfo.getTotalMemory();
    if (!bytes || bytes <= 0) return 4;
    return bytes / 1e9;
  } catch {
    // Detection failure picks the small tier rather than crashing, same rule as
    // desktop: guessing high is what gets the app killed.
    return 4;
  }
}

export function tierForRam(gb: number): Tier {
  if (gb < 5) return '1b'; // 4 GB: iPhone 12, 13
  if (gb < 7) return '1_5b'; // 6 GB: iPhone 14, 15, 16
  return '3b'; // 8 GB: 15 Pro, 16/17 Pro
}

let cached: Tier | null = null;

/** A saved choice wins, so a future setting survives restarts. */
export async function chosenTier(saved?: Tier | null): Promise<Tier> {
  if (saved && LLM[saved]) return saved;
  if (cached) return cached;
  cached = tierForRam(await totalRamGb());
  return cached;
}

export async function requiredModels(saved?: Tier | null): Promise<ModelSpec[]> {
  const tier = await chosenTier(saved);
  return [LLM[tier], WHISPER, KOKORO];
}

export async function describe(saved?: Tier | null): Promise<string> {
  const gb = await totalRamGb();
  const tier = await chosenTier(saved);
  return `${LLM[tier].label} (${gb.toFixed(0)} GB device)`;
}

export function specsForTier(tier: Tier): ModelSpec[] {
  return [LLM[tier], WHISPER, KOKORO];
}
