/**
 * Which model this app runs — the mobile counterpart of backend/model_tier.py.
 *
 * v1 ships exactly one, Llama 3.2 1B, on every phone. See SHIPPED below for why the
 * tiering and the picker went away. The research that produced these four candidates
 * is kept because it is what any future change to that decision has to argue with.
 *
 * ## Why Qwen2.5 1.5B was the default
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

export type Tier = 'gemma1b' | '1b' | '1_5b' | '3b';

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

/**
 * Each model lives at its own path, so switching between them does not re-download
 * anything already fetched. Trying three models to find the one that runs coolest is
 * only reasonable if going back is instant.
 */
const LLM: Record<Tier, ModelSpec> = {
  // The smallest and coolest option. Weakest at structured output, which this app needs
  // for memory extraction and naming a loop topic, so it is offered for the heat
  // comparison rather than recommended.
  gemma1b: {
    path: 'models/llm/gemma-3-1b-q4.gguf',
    url: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    bytes: 806_000_000,
    label: 'Gemma 3 1B',
  },
  '1b': {
    path: 'models/llm/llama-3.2-1b-q4.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    bytes: 807_690_000,
    label: 'Llama 3.2 1B',
  },
  '1_5b': {
    path: 'models/llm/qwen2.5-1.5b-q4.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    bytes: 986_000_000,
    label: 'Qwen2.5 1.5B',
  },
  '3b': {
    path: 'models/llm/llama-3.2-3b-q4.gguf',
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

/**
 * What each phone would get if the model were chosen by its memory. Kept, because it
 * is the right answer and the reasoning above it is still true — it is simply not what
 * v1 ships. See SHIPPED below.
 */
export function tierForRam(gb: number): Tier {
  if (gb < 5) return '1b'; // 4 GB: iPhone 12, 13
  if (gb < 7) return '1_5b'; // 6 GB: iPhone 14, 15, 16
  return '3b'; // 8 GB: 15 Pro, 16/17 Pro
}

/**
 * v1 ships one model, on every phone.
 *
 * The tiering and the picker existed to answer a question — which of these actually
 * runs, and how hot does it get — and that question has been answered. Shipping the
 * choice as a product surface costs a decision on the first screen, a second download
 * for anyone who changes their mind, and three more configurations to support for
 * every bug report that arrives.
 *
 * Llama 3.2 1B is 808 MB and the coolest-running of the credible options, which on a
 * phone that is also holding Whisper, Kokoro, a WebView and React Native is what
 * matters most.
 *
 * Everything else here stays: the specs, ALL_TIERS and specsForTier are what let the
 * app find and delete a model it no longer wants, which anyone who already downloaded
 * a different one needs. Changing which model ships is this one constant.
 */
const SHIPPED: Tier = '1b';

/**
 * The model this build uses. The argument is accepted and ignored: a tier saved by an
 * older build must not resurrect a model this one no longer ships, or the app would
 * ask for a download nothing is going to use.
 */
export async function chosenTier(_saved?: Tier | null): Promise<Tier> {
  return SHIPPED;
}

export async function requiredModels(saved?: Tier | null): Promise<ModelSpec[]> {
  const tier = await chosenTier(saved);
  return [LLM[tier], WHISPER, KOKORO];
}

/** What the first-run screen names, so the download is never an unlabelled 800 MB. */
export async function describe(saved?: Tier | null): Promise<string> {
  return LLM[await chosenTier(saved)].label;
}

/** Every tier, for finding models on disk that are no longer wanted. */
export const ALL_TIERS: Tier[] = ['gemma1b', '1b', '1_5b', '3b'];

export function specsForTier(tier: Tier): ModelSpec[] {
  return [LLM[tier], WHISPER, KOKORO];
}

/** Where the chosen model's weights are, for the engine to load. */
export async function llmPath(saved?: Tier | null): Promise<string> {
  return LLM[await chosenTier(saved)].path;
}
