/**
 * Native microphone capture, driven by the WebView.
 *
 * The page asks for capture ({t:'mic:start'} / {t:'mic:stop'}); this records,
 * transcribes, and hands the text back for the page's normal chat path. Capture is
 * native because the WebView runs from file://, where browser microphone access is
 * not reliably available.
 *
 * Reuses MicRecorder from src/audio.ts, which the M0 spike proved on device and
 * which carries the fix for the rate the recorder reports versus the rate it
 * actually delivers.
 */

import { MicRecorder } from '../audio';
import { transcribe } from '../core/turn';

export type MicSend = (msg: unknown) => void;

export function createMic(send: MicSend) {
  const recorder = new MicRecorder();
  let recording = false;

  async function start(): Promise<void> {
    if (recording) return;
    try {
      await recorder.start();
      recording = true;
      send({ t: 'mic:state', state: 'recording' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Almost always a denied permission. Reported rather than swallowed, or the
      // button looks broken with nothing explaining why.
      send({ t: 'mic:error', message });
    }
  }

  async function stop(): Promise<void> {
    if (!recording) return;
    recording = false;
    send({ t: 'mic:state', state: 'transcribing' });
    try {
      const pcm = await recorder.stop();
      if (!pcm || pcm.length === 0) {
        send({ t: 'mic:transcript', text: '' });
        return;
      }
      const text = await transcribe(pcm);
      // The diagnostic goes to the log, not the page: it explains a wrong
      // transcript without putting anyone's words on screen.
      console.log('[mic]', MicRecorder.lastDiagnostic);
      send({ t: 'mic:transcript', text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send({ t: 'mic:error', message });
    }
  }

  return {
    /** Returns true if the message was a microphone message. */
    async handle(msg: { t?: string; on?: boolean }): Promise<boolean> {
      if (msg.t === 'mic:start') {
        await start();
        return true;
      }
      if (msg.t === 'mic:stop') {
        await stop();
        return true;
      }
      if (msg.t === 'vad:set') {
        // Auto-listen is P2 polish: the native VAD is not wired yet, so this is
        // acknowledged and ignored rather than silently pretending to work.
        console.log(`[mic] auto-listen requested (${msg.on ? 'on' : 'off'}); not wired yet`);
        return true;
      }
      return false;
    },
    async release(): Promise<void> {
      if (recording) await recorder.stop().catch(() => {});
      recording = false;
    },
  };
}
