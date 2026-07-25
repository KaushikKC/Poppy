import RNFS from 'react-native-fs';

/**
 * Where the spike looks for model files. Nothing is bundled in the app — you
 * push these onto the device once (see README "Get the models onto the device").
 *
 * Layout under the app's Documents directory:
 *   models/llm/model.gguf                 <- any small instruct GGUF (1B/3B Q4)
 *   models/whisper/ggml-base.en.bin       <- whisper.cpp ggml model
 *   models/kokoro/                        <- sherpa-onnx Kokoro dir (model.onnx,
 *                                            voices.bin, tokens.txt, espeak-ng-data/)
 */
export const MODELS_ROOT = `${RNFS.DocumentDirectoryPath}/models`;

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
    out.push({ label, path, present: await RNFS.exists(path) });
  }
  return out;
}

export async function allModelsPresent(): Promise<boolean> {
  return (await checkModels()).every((m) => m.present);
}
