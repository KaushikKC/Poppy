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
import { speakIt } from './reply_shape';
import { awaitEngines } from './engines';
import { playback } from './playback';
import type { SocketHandler, SocketReply } from '../bridge/host';
import * as companion from './companion';
import * as safety from './safety';
import * as personas from './personas';
import { resolve as resolveCharacter } from './custom_characters';
import * as traits from './traits';
import * as disclosure from './disclosure';
import * as ritual from './ritual';
import * as tone from './tone';
import * as suggest from './persona_suggest';
import * as memory from './memory_store';
import * as boundaries from './boundaries';
import { CRISIS_ADDENDUM, CRISIS_LAYER, DISTRESS_ADDENDUM, SAFETY_ADDENDUM } from './prompts';

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
 * Keep the prompt inside the window, whatever the user types. Twin of
 * backend/context_budget.py — see it for the full reasoning.
 *
 * Nothing is reserved as a constant. A character written to the full 700 characters
 * plus fifteen memories can exceed any constant worth picking, so the system prompt
 * and the message are both measured on the turn they are used and history gets what
 * is genuinely left. The message is clamped too: recording length bounds a spoken
 * turn, but a typed one can be a paste of any size.
 *
 * This matters more here than on the desktop, because native_engines runs at n_ctx
 * 2048 — half the desktop's 4096 — and the 1B has less room to spare in every sense.
 */
const N_CTX = 2048;
const REPLY_RESERVE = 320;
const PER_MESSAGE_OVERHEAD = 4;
const CHARS_PER_TOKEN = 4;
const USER_SHARE = 0.5;
const ELISION = '\u2026[earlier part of this message trimmed]\u2026\n';

const estimateTokens = (text: string) =>
  Math.floor((text ?? '').length / CHARS_PER_TOKEN) + 1;

/** The tail is kept, not the head: when someone pastes and then asks, the ask is last. */
function clampUserText(text: string): string {
  const limit = Math.floor(N_CTX * USER_SHARE);
  if (estimateTokens(text) <= limit) return text;
  const keepChars = limit * CHARS_PER_TOKEN - ELISION.length;
  return ELISION + text.slice(-keepChars);
}

type Msg = { role: 'user' | 'assistant'; content: string };

function fitContext(
  history: Msg[],
  system: string,
  userText: string,
): { history: Msg[]; text: string } {
  const text = clampUserText(userText);
  const fixed =
    estimateTokens(system) +
    estimateTokens(text) +
    PER_MESSAGE_OVERHEAD * 2 +
    REPLY_RESERVE;
  const budget = N_CTX - fixed;
  if (budget <= 0) return { history: [], text };

  const recent = history.slice(-MAX_HISTORY_TURNS * 2);
  let used = 0;
  let keep = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const cost = estimateTokens(recent[i].content ?? '') + PER_MESSAGE_OVERHEAD;
    if (used + cost > budget) break;
    used += cost;
    keep += 1;
  }
  return { history: keep ? recent.slice(recent.length - keep) : [], text };
}

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

  // She opened the conversation, so she says it out loud — unless it is a one-line
  // hello, which is exactly what an opening line usually is. Decided by the same
  // rule a reply is decided by (reply_shape.ts), rather than by a setting: the two
  // used to disagree, and the page received a line it could both read and hear,
  // which makes the recording something to sit through rather than the message.
  if (!speakIt(line)) {
    reply.text(JSON.stringify({ type: 'token', text: line }));
    reply.text(JSON.stringify({ type: 'done' }));
    return;
  }

  // Config first so the page's player is configured before anything reaches it, then
  // the recording notice. Same order and same frames as a spoken reply, because the
  // frontend has to see one contract rather than two.
  reply.text(JSON.stringify({ type: 'config', sampleRate: engine.sampleRate }));
  reply.text(JSON.stringify({ type: 'recording' }));

  // Rendered whole rather than phrase by phrase: there is no model still generating
  // to race, so the only thing splitting it buys is a per-call overhead paid several
  // times and a duration nobody can know up front.
  playback.reset();
  try {
    const out = await engine.synthesize(line, profile.voice);
    const durationMs = (out.samples.length / out.sampleRate) * 1000;
    // Pushed first: that is what keeps the replayable copy, and the frame carries its
    // id. Her opening line is worth being able to hear twice as much as any other.
    playback.push(out.samples, out.sampleRate);
    reply.text(JSON.stringify({
      type: 'voice',
      durationMs,
      text: line,
      clipId: playback.currentClipId() ?? undefined,
    }));
  } catch (err) {
    // Her opening line is the first thing anyone sees. If it cannot be spoken it is
    // still shown, rather than the conversation starting with an error and nothing.
    console.log(`[tts] the opening recording failed (${err})`);
    reply.text(JSON.stringify({ type: 'token', text: line }));
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

      let msg: {
        type?: string;
        text?: string;
        persona?: string;
        emotion?: string;
        /** Did this arrive as speech? The page knows; it is not a setting. */
        spoken?: boolean;
      };
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

      // Who she is, and then the stance for right now.
      //
      // Character first, the way ws_handler.py assembles it: the character carries the
      // shared core and their own personality paragraph, and the vibe is a frame on top
      // of that. Building from the persona's own system_prompt instead (which is what
      // this did) meant every character on the phone was Poppy with a different name,
      // and a character the user wrote had nothing of theirs reach the model at all.
      const char = await resolveCharacter(profile.character);
      // The mode the user picked on the home screen. Sent with every turn by the UI,
      // and it has to reach the prompt or the buttons only change colour. The flavour
      // alone: the core in front of it is already there, from the character.
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
      // Never asked on behalf of someone else's character: the pact is our retention
      // design, and a character the user wrote should not be made to negotiate a daily
      // check-in time for us. Same rule as ws_handler.py.
      const pactDue = risk0.level === null && !char.custom
        && callTurns >= ritual.ASK_FROM_TURN
        && (await ritual.isDue());
      const pactBlock = pactDue ? ritual.asPromptBlock() : '';
      if (pactDue) await ritual.markAsked();

      // Not on the phone at all.
      //
      // It is a placement instruction about 1100 characters long — 272 tokens of a
      // 2048-token window — and the model here is a 1B. Measured 2026-08-25 with it
      // in: every reply came back as a disconnected fact from the character's own
      // life, tracking no context whatsoever ("my favourite colour is lavender" to
      // "what?"). Without it, and on a short character prompt, the same model
      // followed six turns and answered properly.
      //
      // It was always the least valuable of the three placement blocks — it happens
      // every call and loses nothing by yielding — and a 1B cannot follow it anyway.
      // Desktop keeps it: a 3B has the room and does follow it.
      const disclosureBlock = '';
      // Her persona prompt carries the whole of who she is, so it replaces the
      // placeholder rather than being appended to it.
      // Traits sit with identity rather than with the momentary stance: they are who
      // she is, so they apply in every mode instead of being re-picked each call.
      let system =
        char.system_prompt +
        ' ' +
        persona.flavor +
        traits.asPromptBlock(profile.traits) +
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
      // Detection always runs — it is what holds the pact block back on a heavy turn —
      // but everything the user sees or the model is told is on CRISIS_LAYER, so the
      // switch means what its name says. Deliberately independent of ADULT and
      // GUARDRAILS: appending a helpline is not a content restriction, and it never
      // refuses a turn. Same three-way split as backend/config.py.
      const risk = risk0;
      if (CRISIS_LAYER && risk.level === 'crisis') {
        system += CRISIS_ADDENDUM;
        reply.text(JSON.stringify({ type: 'safety', resources: risk.resources }));
      } else if (CRISIS_LAYER && risk.level === 'distress') {
        system += DISTRESS_ADDENDUM;
      }

      try {
        // How it came in decides how it goes out. The page does not have to be told
        // which: it receives a recording and no tokens, or tokens and no recording,
        // and it renders whatever arrives.
        // Measured per turn: the character, the message and history are all sized
        // against the 2048 window before anything is sent, so a long reply or a
        // pasted block can never push the system prompt off the left edge.
        const sized = fitContext(session.history, system, msg.text);
        const said = await runTurn(
          sized.text,
          {
            system,
            history: sized.history,
            voice: profile.voice,
            signal: session.abort.signal,
            spoken: msg.spoken !== false,
          },
          {
            onConfig: (sampleRate) =>
              reply.text(JSON.stringify({ type: 'config', sampleRate })),
            onAudio: () => {},
            onToken: (text) => reply.text(JSON.stringify({ type: 'token', text })),
            // Sent when synthesis actually starts, not when the turn does. During
            // generation nobody knows yet whether there will be a recording at all,
            // and claiming there is one would be a guess shown as a fact.
            onRecording: () => reply.text(JSON.stringify({ type: 'recording' })),
            onVoice: (durationMs, spokenText) =>
              reply.text(JSON.stringify({
                type: 'voice',
                durationMs,
                text: spokenText,
                // Desktop follows this frame with the WAV itself and the page keeps
                // those bytes to replay. Nothing crosses the bridge here, so the page
                // gets the id of the copy this side kept instead.
                clipId: playback.currentClipId() ?? undefined,
              })),
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
/**
 * Forget the conversation so far, on every open socket.
 *
 * Called when the companion changes — a different character, or the one in use being
 * deleted — because the history is the transcript of a conversation with someone else.
 * Desktop does this in ws_handler.clear_history() for the same reason, and without it
 * Kai's first turn on the phone would arrive with Poppy's last six messages behind it
 * and the model would happily continue them. Memory is per-character and already
 * switches; this is the in-memory context, which did not.
 */
export function clearHistory(): void {
  for (const session of sessions.values()) session.history = [];
}

export function activeSessions(): number {
  return sessions.size;
}

export function resetSessions(): void {
  sessions.clear();
}
