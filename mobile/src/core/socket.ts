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
 * Audio is spoken natively and the page is sent a loudness envelope for the orb, rather
 * than WAV frames to play itself. Sending frames matched the desktop server exactly and
 * was silent on device; see core/playback.ts. Capture is native too, because a file://
 * origin cannot reliably reach a microphone.
 */

import { runTurn } from './turn';
import { PhraseChunker } from './chunker';
import { awaitEngines } from './engines';
import { playback } from './playback';
import type { SocketHandler, SocketReply } from '../bridge/host';
import * as companion from './companion';
import * as safety from './safety';
import * as personas from './personas';
import * as disclosure from './disclosure';
import * as ritual from './ritual';
import * as tone from './tone';
import * as suggest from './persona_suggest';
import * as memory from './memory_store';
import * as boundaries from './boundaries';
import { CRISIS_ADDENDUM, DISTRESS_ADDENDUM, SAFETY_ADDENDUM } from './prompts';

/** Kept small on purpose: replies are 2-4 spoken sentences. */
const SYSTEM_PROMPT =
  'You are {name}, a warm, calm voice companion. Reply in 2 to 4 short spoken ' +
  'sentences. Be gentle and natural, never clinical.';

type Session = {
  reply: SocketReply;
  abort: AbortController;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Turns in this call, so the pact is raised at the right moment. */
  turns: number;
};

const sessions = new Map<number, Session>();

/**
 * Turns in the current call, counted here rather than per socket.
 *
 * chat.js opens a **new WebSocket for every message**, so a per-socket counter was
 * always 1. Two things broke silently on that: the disclosure example never rotated, so
 * every reply opened with the same sentence, and the ritual pact — which may only be
 * raised from turn two — could never be raised at all.
 */
let callTurns = 0;

/** Called when a call opens, so the count belongs to the call and not to the app. */
export function resetCallTurns(): void {
  callTurns = 0;
}

/** Conversation history for the current session, oldest first. */
const MAX_HISTORY_TURNS = 6;

/**
 * Speak a line she initiated herself: the opening line, or a sign-off. Text and audio,
 * no model turn. The whole line is revealed at once because it is already known, then
 * its audio streams phrase by phrase so the first sound still arrives quickly.
 */
async function say(text: string, reply: SocketReply): Promise<void> {
  const line = (text || '').trim();
  if (!line) {
    reply.text(JSON.stringify({ type: 'done' }));
    return;
  }
  const profile = await companion.profile();
  const { speech: engine } = await awaitEngines();

  reply.text(JSON.stringify({ type: 'config', sampleRate: engine.sampleRate }));
  reply.text(JSON.stringify({ type: 'token', text: line }));

  const chunker = new PhraseChunker();
  const phrases: string[] = [];
  for (const ch of line) {
    const phrase = chunker.push(ch);
    if (phrase) phrases.push(phrase);
  }
  const tail = chunker.flush();
  if (tail) phrases.push(tail);

  // One at a time and in order, the same rule as a reply: concurrent synthesis
  // thrashes and plays back scrambled.
  playback.reset();
  for (const phrase of phrases) {
    try {
      const out = await engine.synthesize(phrase, profile.voice);
      playback.push(out.samples, out.sampleRate);
    } catch (err) {
      console.log(`[tts] dropped phrase in say(): ${err}`);
    }
  }
  reply.text(JSON.stringify({ type: 'done' }));
}

export function createSocketHandler(): SocketHandler {
  return {
    open(id, url, reply) {
      // Only the chat socket exists so far. Anything else is refused rather than
      // silently accepted, so a typo in a URL fails visibly.
      if (!url.includes('/ws/chat')) return false;
      sessions.set(id, { reply, abort: new AbortController(), history: [], turns: 0 });
      return true;
    },

    async message(id, data, reply) {
      const session = sessions.get(id);
      if (!session) return;

      let msg: { type?: string; text?: string; persona?: string; emotion?: string };
      try {
        msg = JSON.parse(data);
      } catch {
        reply.text(JSON.stringify({ type: 'error', message: 'malformed frame' }));
        return;
      }

      // Two flows reach this socket, not one. `say` is her speaking first: the line
      // is already written, so it must never go near the model — it is revealed and
      // spoken. Missing this is why the opening line came back as an error and she
      // said nothing.
      if (msg.type === 'say') {
        await say(msg.text ?? '', reply);
        return;
      }

      if (msg.type !== 'chat' || !msg.text) {
        reply.text(JSON.stringify({ type: 'error', message: 'expected {type:"chat", text} or {type:"say", text}' }));
        return;
      }

      playback.reset();
      const profile = await companion.profile();
      memory.setCharacter(profile.character);

      // The mode the user picked on the home screen. Sent with every turn by the
      // UI, and it has to reach the prompt or the buttons only change colour.
      const persona = personas.get(msg.persona ?? profile.vibe);

      // Assembled in the same order as ws_handler.py: identity, then the standing
      // rules, then safety framing, then what she remembers. The memory block is
      // selected for this turn rather than dumped wholesale, which is what keeps
      // time-to-first-token from drifting as the relationship gets longer.
      const rules = await boundaries.asPromptBlock();
      const remembered = await memory.asPromptBlock(msg.text);

      // She goes first. This is a *placement* instruction, and the on-device model
      // reliably follows only one of those per turn: stacking a second is not
      // additive, it silently drops one. So disclosure yields whenever something
      // more urgent owns the shape of the reply, which for now is the safety tier.
      session.turns += 1;
      callTurns += 1;
      const risk0 = safety.check(msg.text);

      // Exactly one placement instruction per turn: the model follows one of these
      // reliably and silently drops the rest, so they are ranked rather than stacked.
      // Safety outranks everything; the pact is asked once and then yields to
      // disclosure, which is the everyday behaviour.
      const pactDue = risk0.level === null && callTurns >= ritual.ASK_FROM_TURN
        && (await ritual.isDue());
      const pactBlock = pactDue ? ritual.asPromptBlock() : '';
      if (pactDue) await ritual.markAsked();

      const disclosureBlock =
        risk0.level === null && !pactBlock
          ? await disclosure.asPromptBlock(undefined, undefined, callTurns)
          : '';
      // Her persona prompt carries the whole of who she is, so it replaces the
      // placeholder rather than being appended to it.
      let system =
        persona.system_prompt.replace(/\bPoppy\b/g, profile.companion_name) +
        rules +
        SAFETY_ADDENDUM +
        remembered +
        pactBlock +
        disclosureBlock;

      // Tone is momentary, so it is applied per turn and never remembered. With no
      // emotion (the iOS default, since voice detection is not shipped) this adds
      // nothing at all.
      const toneLine = tone.toneFor(msg.emotion);
      if (toneLine) system = `${system} ${toneLine}`;

      // Checked before a single token is generated, and the resource card is sent
      // straight away rather than after the reply: someone in the acute tier should
      // not have to wait through a spoken answer to see a helpline.
      const risk = risk0;
      if (risk.level === 'crisis') {
        system += CRISIS_ADDENDUM;
        reply.text(JSON.stringify({ type: 'safety', resources: risk.resources }));
      } else if (risk.level === 'distress') {
        system += DISTRESS_ADDENDUM;
      }

      try {
        // Voice notes or text, never both. The page does not have to be told which:
        // in voice mode it receives a recording and no tokens, in text mode tokens
        // and no recording, and it renders whatever arrives.
        const deliver = profile.reply_mode === 'text' ? 'text' : 'voice';
        if (deliver === 'voice') {
          // She is recording. Sent before the model starts, because the whole point
          // of the voice-note shape is that the wait is visible and explained.
          reply.text(JSON.stringify({ type: 'recording' }));
        }

        const said = await runTurn(
          msg.text,
          {
            system,
            history: session.history.slice(-MAX_HISTORY_TURNS * 2),
            voice: profile.voice,
            signal: session.abort.signal,
            deliver,
          },
          {
            onConfig: (sampleRate) =>
              reply.text(JSON.stringify({ type: 'config', sampleRate })),
            onAudio: () => {},
            onToken: (text) => reply.text(JSON.stringify({ type: 'token', text })),
            onVoice: (durationMs) =>
              reply.text(JSON.stringify({ type: 'voice', durationMs })),
            onError: (message) => reply.text(JSON.stringify({ type: 'error', message })),
          },
        );

        session.history.push({ role: 'user', content: msg.text });
        session.history.push({ role: 'assistant', content: said });

        // Did they just agree a time out loud? Read it from what they said, not from
        // a form. A decline is recorded separately so she stops asking.
        const pact = ritual.parse(msg.text);
        if (pact && 'declined' in pact) {
          await ritual.decline();
        } else if (pact) {
          await ritual.set(pact.kind, pact.time);
          reply.text(JSON.stringify({
            type: 'ritual',
            kind: pact.kind,
            time: pact.time,
            confirm: ritual.confirmLine(pact.kind, pact.time),
          }));
        }

        // A mood that fits how they are actually talking. Offered, never applied:
        // changing who she is without being asked is the drift users hate.
        const tip = suggest.observe(msg.text, persona.key);
        if (tip) reply.text(JSON.stringify({ type: 'suggestion', ...tip }));

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
