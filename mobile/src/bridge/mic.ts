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

import { ContinuousMic, MicRecorder, TARGET_RATE } from '../audio';
import { transcribe } from '../core/turn';
import * as clips from '../core/clips';
import { playback } from '../core/playback';

export type MicSend = (msg: unknown) => void;

/** What to say when the audio held no speech, plus the reason when we know it. */
function heardNothing(): string {
  const d = MicRecorder.lastDiagnostic;
  return d.includes('REPORTED RATE IS WRONG')
    ? `I did not catch that. The microphone is reporting the wrong rate — ${d}`
    : 'I did not catch that. Try again a little closer to the microphone.';
}

/**
 * Nothing reached the microphone at all: no samples, or samples that are all silence.
 *
 * Seen on a tester's phone during a phone call. iOS keeps the microphone for the call,
 * so the recording comes back empty, and an empty transcript was dropped by the page
 * without a word: the voice note simply never appeared. Said out loud instead, because
 * "you are on a call" is the one cause nobody guesses.
 */
const NO_SOUND =
  "No sound reached the microphone. If you're on a call, iPhone keeps the microphone for the call. Try again after it ends.";

function silent(pcm: Float32Array): boolean {
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) > 1e-4) return false;
  return true;
}

/**
 * Keep what the user just recorded, and describe it to the page.
 *
 * A voice message shown as text throws away the thing that was actually sent. The
 * page cannot hold the audio here (capture is native), so it holds an id instead and
 * asks for it back when the bubble is tapped.
 */
function mine(pcm: Float32Array): { clipId: string; durationMs: number } {
  const clip = clips.keep('mine', pcm, TARGET_RATE);
  return { clipId: clip.id, durationMs: clip.durationMs };
}

export function createMic(send: MicSend) {
  const recorder = new MicRecorder();
  let recording = false;

  // Auto-listen. The mic stays open and each finished utterance is transcribed and
  // sent, so a conversation needs no button at all.
  const auto = new ContinuousMic(
    async (pcm) => {
      send({ t: 'mic:state', state: 'transcribing' });
      try {
        if (silent(pcm)) {
          send({ t: 'mic:error', message: NO_SOUND });
          if (auto.running) send({ t: 'mic:state', state: 'recording' });
          return;
        }
        const text = await transcribe(pcm);
        console.log('[mic]', MicRecorder.lastDiagnostic);
        if (!text) {
          send({ t: 'mic:error', message: heardNothing() });
        } else {
          send({ t: 'mic:transcript', text, ...mine(pcm) });
        }
      } catch (err) {
        send({ t: 'mic:error', message: err instanceof Error ? err.message : String(err) });
      }
      // Back to listening straight away: a hands-free conversation must not need a
      // tap between turns.
      if (auto.running) send({ t: 'mic:state', state: 'recording' });
    },
    () => send({ t: 'mic:state', state: 'recording' }),
    // Stand down while she is speaking.
    () => !playback.isPlaying,
  );

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
      if (!pcm || pcm.length === 0 || silent(pcm)) {
        send({ t: 'mic:error', message: NO_SOUND });
        return;
      }
      const text = await transcribe(pcm);
      console.log('[mic]', MicRecorder.lastDiagnostic);
      if (!text) {
        // Audio arrived but nothing in it was speech — quiet, noise, or the wrong
        // sample rate. Silence here reads as a broken button: the tester speaks,
        // taps stop, and the app does nothing at all with no idea why. The rate
        // line rides along only when it is the thing that went wrong, because that
        // is the one cause they cannot guess at.
        send({ t: 'mic:error', message: heardNothing() });
        return;
      }
      send({ t: 'mic:transcript', text, ...mine(pcm) });
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
        try {
          if (msg.on && !auto.running) {
            await auto.start();
            send({ t: 'mic:state', state: 'recording' });
          } else if (!msg.on && auto.running) {
            await auto.stop();
            send({ t: 'mic:state', state: 'idle' });
          }
        } catch (err) {
          send({ t: 'mic:error', message: err instanceof Error ? err.message : String(err) });
        }
        return true;
      }
      return false;
    },
    async release(): Promise<void> {
      if (recording) await recorder.stop().catch(() => {});
      if (auto.running) await auto.stop().catch(() => {});
      recording = false;
    },
  };
}
