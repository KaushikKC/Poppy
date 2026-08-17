/**
 * The /ws/chat protocol — what backend/ws_handler.py sends, spoken to the WebView.
 *
 * The UI's contract, read off frontend/chat.js:
 *
 *   in   {type:"chat", text, persona?, accent?, gender?, emotion?}
 *   out  {type:"config", sampleRate}   before any audio
 *        {type:"token",  text}         one per token, as they arrive
 *        {type:"safety", resources}    when distress is detected
 *        {type:"done",   sessionId?}   end of turn
 *        {type:"error",  message}
 *
 * One deliberate divergence: **no binary audio frames.** On desktop the server
 * streams WAV bytes and the page plays them. Here playback is native, because the
 * WebView is loaded from file:// (where browser audio capture is not reliably
 * available) and because pushing WAV through a JSON bridge as base64 would spend
 * the latency the chunker was tuned to save. The UI's audio path simply never
 * receives a binary frame, and its `event.data instanceof ArrayBuffer` branch does
 * not fire.
 *
 * `config` is still sent, because the UI uses it to know a reply has started.
 */

import { runTurn } from './turn';
import type { SocketHandler, SocketReply } from '../bridge/host';
import * as companion from './companion';

/** Kept small on purpose: replies are 2-4 spoken sentences. */
const SYSTEM_PROMPT =
  'You are {name}, a warm, calm voice companion. Reply in 2 to 4 short spoken ' +
  'sentences. Be gentle and natural, never clinical.';

type Session = {
  reply: SocketReply;
  abort: AbortController;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const sessions = new Map<number, Session>();

/** Conversation history for the current session, oldest first. */
const MAX_HISTORY_TURNS = 6;

export function createSocketHandler(): SocketHandler {
  return {
    open(id, url, reply) {
      // Only the chat socket exists so far. Anything else is refused rather than
      // silently accepted, so a typo in a URL fails visibly.
      if (!url.includes('/ws/chat')) return false;
      sessions.set(id, { reply, abort: new AbortController(), history: [] });
      return true;
    },

    async message(id, data, reply) {
      const session = sessions.get(id);
      if (!session) return;

      let msg: { type?: string; text?: string };
      try {
        msg = JSON.parse(data);
      } catch {
        reply.text(JSON.stringify({ type: 'error', message: 'malformed frame' }));
        return;
      }

      if (msg.type !== 'chat' || !msg.text) {
        reply.text(JSON.stringify({ type: 'error', message: 'expected {type:"chat", text}' }));
        return;
      }

      const profile = await companion.profile();
      const system = SYSTEM_PROMPT.replace('{name}', profile.companion_name);

      try {
        const said = await runTurn(
          msg.text,
          {
            system,
            history: session.history.slice(-MAX_HISTORY_TURNS * 2),
            voice: profile.voice,
            signal: session.abort.signal,
          },
          {
            onConfig: (sampleRate) =>
              reply.text(JSON.stringify({ type: 'config', sampleRate })),
            onToken: (text) => reply.text(JSON.stringify({ type: 'token', text })),
            onError: (message) => reply.text(JSON.stringify({ type: 'error', message })),
          },
        );

        session.history.push({ role: 'user', content: msg.text });
        session.history.push({ role: 'assistant', content: said });
        reply.text(JSON.stringify({ type: 'done' }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.text(JSON.stringify({ type: 'error', message }));
        // Still send done: the UI re-enables its input on done, and without it the
        // mic stays stuck after any failed turn. That exact stranding was a bug on
        // desktop, fixed there by adding an onclose handler.
        reply.text(JSON.stringify({ type: 'done' }));
      }
    },

    close(id) {
      const session = sessions.get(id);
      if (!session) return;
      // Closing mid-reply is barge-in: abort generation and cut the audio.
      session.abort.abort();
      sessions.delete(id);
    },
  };
}

/** For tests. */
export function activeSessions(): number {
  return sessions.size;
}

export function resetSessions(): void {
  sessions.clear();
}
