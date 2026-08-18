// The @dr.pogodin fork, not plain react-native-fs. Both are forks of the same
// source and their native halves declare the same Objective-C classes
// (RNFSDownloader, RNFSUploader, ...), so linking both fails outright with
// duplicate symbols. sherpa-onnx requires this one as a peer dependency, so it
// is the one that stays, and the API used here is identical.
// Named exports, not a default export, unlike the package it replaces.
import { DocumentDirectoryPath, exists } from '@dr.pogodin/react-native-fs';

/**
 * Where the spike looks for model files. Nothing is bundled in the app — you
 * push these onto the device once (see README "Get the models onto the device").
 *
 * These paths are the contract between the downloader (core/model_tier.ts) and
 * the engines. Both sides must agree, so they are declared once, here.
 *
 * Layout under the app's Documents directory:
 *   models/llm/model.gguf                 <- any small instruct GGUF (1B/3B Q4)
 *   models/whisper/ggml-base.en.bin       <- whisper.cpp ggml model
 *   models/kokoro/                        <- sherpa-onnx Kokoro dir (model.onnx,
 *                                            voices.bin, tokens.txt, espeak-ng-data/)
 */
export const MODELS_ROOT = `${DocumentDirectoryPath}/models`;

export const LLM_PATH = `${MODELS_ROOT}/llm/model.gguf`;
export const WHISPER_PATH = `${MODELS_ROOT}/whisper/ggml-base.en.bin`;
export const KOKORO_DIR = `${MODELS_ROOT}/kokoro`;

export type ModelCheck = { label: string; path: string; present: boolean };

/** Report which model files are actually on the device, for the setup screen. */
export async function checkModels(): Promise<ModelCheck[]> {
  const targets: Array<[string, string]> = [
    ['LLM (GGUF)', LLM_PATH],
    ['Whisper', WHISPER_PATH],
    ['Kokoro (dir)', KOKORO_DIR],
  ];
  const out: ModelCheck[] = [];
  for (const [label, path] of targets) {
    out.push({ label, path, present: await exists(path) });
  }
  return out;
}

export async function allModelsPresent(): Promise<boolean> {
  return (await checkModels()).every((m) => m.present);
}
