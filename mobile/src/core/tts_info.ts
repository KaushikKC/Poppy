/**
 * What the voice engine reported when it loaded.
 *
 * Its own module with no native imports, so anything that wants to *read* it — the
 * settings endpoint, the home screen — does not drag llama.rn and sherpa-onnx into a
 * file that has to run in plain node. Putting it in native_engines.ts made the whole
 * router untestable, which is the second time that layering has bitten.
 *
 * `native_engines.ts` fills it in; everyone else only reads it.
 */
export const ttsDiagnostic: {
  /** Speakers the loaded model exposes. 1 means every character sounds identical. */
  speakers: number;
  sampleRate: number;
  modelType: string;
} = { speakers: -1, sampleRate: -1, modelType: 'not loaded' };
