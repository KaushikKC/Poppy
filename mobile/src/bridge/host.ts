/**
 * The native side of the bridge: takes messages from the WebView, runs them
 * through the router, sends answers back.
 *
 * Deliberately free of React and of react-native-webview types so it can be
 * driven by tests/test_bridge.js in plain node. The screen supplies a `send`
 * function; how that reaches the page is the screen's problem.
 */

import { handle } from '../core/router';

export type Send = (js: string) => void;

/** Messages the page can send. Anything else is ignored rather than throwing. */
type Incoming =
  | { t: 'fetch'; id: number; method: string; url: string; body: string | null }
  | { t: 'ws:open'; id: number; url: string }
  | { t: 'ws:send'; id: number; data: string }
  | { t: 'ws:close'; id: number };

export type SocketHandler = {
  /** Called when the page opens a socket. Return false to refuse it. */
  open: (id: number, url: string, reply: SocketReply) => boolean | Promise<boolean>;
  /** A text frame from the page. */
  message: (id: number, data: string, reply: SocketReply) => void | Promise<void>;
  close: (id: number) => void | Promise<void>;
};

export type SocketReply = {
  text: (data: string) => void;
  /** Binary frame; base64 because postMessage carries text only. */
  binary: (base64: string) => void;
  closed: (code?: number) => void;
  error: () => void;
};

/** Serialise a call to the page's inbound entry point. */
function dispatch(send: Send, msg: unknown): void {
  send(`window.__poppysBridge && window.__poppysBridge(${JSON.stringify(msg)}); true;`);
}

/** Same, for the microphone channel the replacement mic.js listens on. */
export function dispatchMic(send: Send, msg: unknown): void {
  send(`window.__poppysMic && window.__poppysMic(${JSON.stringify(msg)}); true;`);
}

/** Anything the page sends that is not fetch or socket traffic, e.g. the mic. */
export type ExtraHandler = (msg: { t?: string }) => Promise<boolean> | boolean;

export function createHost(send: Send, sockets?: SocketHandler, extra?: ExtraHandler) {
  function replyFor(id: number): SocketReply {
    return {
      text: (data) => dispatch(send, { t: 'ws:msg', id, data }),
      binary: (base64) => dispatch(send, { t: 'ws:msg', id, data: base64, b64: true }),
      closed: (code) => dispatch(send, { t: 'ws:closed', id, code: code ?? 1000 }),
      error: () => dispatch(send, { t: 'ws:err', id }),
    };
  }

  return async function onMessage(raw: string): Promise<void> {
    let msg: Incoming;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // not ours
    }

    // Non-transport messages (microphone control) first, so they are not mistaken
    // for malformed socket traffic.
    if (extra && (await extra(msg as { t?: string }))) return;

    if (msg.t === 'fetch') {
      try {
        const body = msg.body ? JSON.parse(msg.body) : null;
        const res = await handle(msg.method, msg.url, body);
        dispatch(send, { t: 'fetch:res', id: msg.id, status: res.status, body: res.body });
      } catch (err) {
        // The page's fetch rejects, which is what the UI's try/catch expects. A
        // thrown handler must not take the whole bridge down with it.
        const message = err instanceof Error ? err.message : String(err);
        dispatch(send, { t: 'fetch:err', id: msg.id, error: message });
      }
      return;
    }

    if (!sockets) {
      // No turn loop wired yet (that is P2). Close immediately so the UI takes its
      // disconnected path instead of waiting forever on a socket nobody answers.
      if (msg.t === 'ws:open') dispatch(send, { t: 'ws:closed', id: msg.id, code: 1011 });
      return;
    }

    if (msg.t === 'ws:open') {
      const accepted = await sockets.open(msg.id, msg.url, replyFor(msg.id));
      dispatch(send, accepted
        ? { t: 'ws:opened', id: msg.id }
        : { t: 'ws:closed', id: msg.id, code: 1011 });
    } else if (msg.t === 'ws:send') {
      await sockets.message(msg.id, msg.data, replyFor(msg.id));
    } else if (msg.t === 'ws:close') {
      await sockets.close(msg.id);
      dispatch(send, { t: 'ws:closed', id: msg.id, code: 1000 });
    }
  };
}
