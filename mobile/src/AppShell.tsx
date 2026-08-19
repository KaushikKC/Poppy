/**
 * The real app shell: the desktop web UI running in a WebView, with the
 * TypeScript core answering it through the bridge.
 *
 * The frontend is copied into the app bundle untouched (see the "Copy Poppys web
 * UI" build phase). It reaches the core only through window.BACKEND and
 * window.WS_BACKEND, both of which the injected shim defines, so it does not know
 * or care that there is no server.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import WebViewComponent from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewProps,
} from 'react-native-webview';

// react-native-webview 14.0.1 declares
//   class WebView<P = undefined> extends Component<WebViewProps & P>
// and `WebViewProps & undefined` collapses to `never` under current TypeScript,
// so every prop is rejected as "not assignable to type 'never'". Upstream typing
// bug, not ours. Cast once here rather than scattering `any` over the props.
const WebView = WebViewComponent as unknown as React.ComponentType<
  WebViewProps & { ref?: React.Ref<WebViewComponent> }
>;

import { AudioManager } from 'react-native-audio-api';

import { SHIM_JS } from './bridge/shim';
import { createHost, dispatchAudio, dispatchMic } from './bridge/host';
import { createMic } from './bridge/mic';
import { registerHandlers } from './core/handlers';
import { createSocketHandler } from './core/socket';
import { loadNativeEngines } from './core/native_engines';
import { playback, setSpeaker } from './core/playback';
import { PcmPlayer, activateSession } from './audio';
import { modelsPresent } from './core/downloader';
import type { Tier } from './core/model_tier';
import * as companion from './core/companion';
import ModelSetup from './ModelSetup';
import { configureStore } from './core/store';
import {
  DocumentDirectoryPath,
  MainBundlePath,
  exists,
  mkdir,
  readFile,
  writeFile,
} from '@dr.pogodin/react-native-fs';

// The web UI lives in the bundle; state lives in Documents, like desktop's data dir.
const DATA_ROOT = `${DocumentDirectoryPath}/poppys`;

// Where the copied frontend ends up. MainBundlePath is iOS-only (undefined on
// Android), so Android falls back to its asset scheme.
const WEB_INDEX = MainBundlePath
  ? `file://${MainBundlePath}/web/index.html`
  : 'file:///android_asset/web/index.html';

const WEB_ROOT = MainBundlePath ? `file://${MainBundlePath}/web` : undefined;

let configured = false;
function setupCore() {
  if (configured) return;
  configured = true;
  configureStore(
    {
      read: async (p) => ((await exists(p)) ? await readFile(p, 'utf8') : null),
      write: async (p, d) => {
        await writeFile(p, d, 'utf8');
      },
      mkdirp: async (p) => {
        if (!(await exists(p))) await mkdir(p);
      },
    },
    DATA_ROOT,
  );
  registerHandlers();
}

export default function AppShell() {
  const webRef = useRef<WebViewComponent>(null);
  const micRef = useRef<{ release: () => Promise<void> } | null>(null);
  const pcmRef = useRef<PcmPlayer | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [engineStatus, setEngineStatus] = useState('');
  // A loading line and a reason the app cannot make a sound are not the same message
  // and must not look the same. The first should be ignorable; the second was 11pt
  // grey at the very bottom edge, which is how a tester ends up reporting "no voice"
  // with the explanation already on their screen.
  const [engineFailed, setEngineFailed] = useState(false);

  const note = useCallback((msg: string) => {
    setEngineFailed(false);
    setEngineStatus(msg);
  }, []);
  const fail = useCallback((msg: string) => {
    setEngineFailed(true);
    setEngineStatus(msg);
  }, []);
  // null while we are still finding out, so the WebView is not flashed up before we
  // know whether this is a first run.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  setupCore();

  // The engines are loaded once, in the background, while the UI is already
  // rendering. Onboarding takes a while to read, and this way the first turn does
  // not pay the cold load. A failure is surfaced rather than swallowed: without
  // the models the app can render but cannot talk.
  const loadEngines = useCallback(async () => {
    try {
      await loadNativeEngines(note);
      setEngineStatus('');
    } catch (err) {
      fail(`Could not load the models: ${err instanceof Error ? err.message : err}`);
    }
  }, [note, fail]);

  // The audio session, set once at startup rather than only when recording begins.
  //
  // Two reasons. An ambient category is muted by the ringer switch, so her voice would
  // be silent for anyone with silent mode on and there would be nothing in any log to
  // explain it. And playAndRecord with defaultToSpeaker routes to the loud speaker
  // rather than the earpiece, which is what playAndRecord does by default.
  useEffect(() => {
    (async () => {
      try {
        // Ask for the microphone before touching the session, because on iOS a
        // playAndRecord session *cannot activate* without it — and an inactive
        // session takes her voice down with it. That is why a denied microphone
        // does not present as "the mic is broken": it presents as nothing working
        // at all, replies arriving as text with no sound in either direction.
        //
        // Nothing asked before this. iOS prompts by itself on the first recording
        // attempt, which is late, and if the answer is no there is no second prompt
        // and nothing anywhere that says so.
        let permission = await AudioManager.checkRecordingPermissions();
        if (permission === 'Undetermined') {
          permission = await AudioManager.requestRecordingPermissions();
        }
        if (permission !== 'Granted') {
          fail(
            'Poppys needs the microphone to hear you, and iOS mutes her voice ' +
            'without it. Turn it on in Settings › Poppys › Microphone.',
          );
          return;
        }

        await activateSession();
      } catch (err) {
        // Swallowed into a console line before. On a phone that log belongs to
        // nobody, so the one message explaining why the app is silent was written
        // somewhere no user or tester could ever read it.
        fail(`Audio could not start: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }, [fail]);

  useEffect(() => {
    (async () => {
      // Against the model that was actually chosen, not the one this phone's RAM
      // would have picked. Without the saved tier, modelsPresent() falls back to
      // the RAM default — so anyone who picked a different model downloaded it,
      // and then met the setup screen again on every single launch, because the
      // app was looking on disk for a model they had deliberately not installed.
      const saved = ((await companion.profile()).model_tier ?? null) as Tier | null;
      const have = await modelsPresent(saved);
      setNeedsSetup(!have);
      if (have) void loadEngines();
    })();
  }, [loadEngines]);

  // Everything expensive stops when the app is not in front.
  //
  // Reported as the phone getting hot. Backgrounded, there is nothing to look at and
  // usually nothing to listen to, yet the microphone would keep capturing, the VAD would
  // keep running on every buffer, and any queued speech would keep playing. The WebView's
  // animation loops are handled in the shim.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // The session can be taken away while backgrounded; claim it again.
        AudioManager.setAudioSessionActivity(true).catch(() => {});
        return;
      }
      playback.stop();
      void micRef.current?.release();
    });
    return () => sub.remove();
  }, []);

  // Headphones going on or coming off, a Bluetooth headset connecting, a call ending.
  //
  // Nothing watched for this before, so the session and the playback graph stayed
  // configured for whatever was attached at launch. Put headphones on afterwards and
  // the hardware route moved while everything here kept pointing at the old one: her
  // voice inaudible, nothing transcribed, and no error anywhere because as far as the
  // app was concerned it was playing and recording perfectly well.
  useEffect(() => {
    const sub = AudioManager.addSystemEventListener('routeChange', ({ reason }) => {
      // Only a device genuinely arriving or leaving.
      //
      // This reacted to every reason, and two of them — CategoryChange and Override —
      // are what *our own* activateSession() raises. So reclaiming the session raised
      // another route change, which reclaimed the session, round and round. And every
      // pass called playback.stop(), which does not pause the queue, it latches it
      // off until something calls reset(). Her voice was being cut continuously and
      // what arrived was the text with nothing behind it.
      if (reason !== 'NewDeviceAvailable' && reason !== 'OldDeviceUnavailable') return;
      console.log(`[audio] device changed (${reason}); rebuilding playback`);
      void (async () => {
        try {
          await activateSession();
          pcmRef.current?.reset();
          // Whatever was mid-phrase was going to a route that no longer exists, so
          // the queue is dropped — but re-armed, never left latched off.
          playback.reset();
        } catch (err) {
          fail(`Audio could not follow the route change: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    });
    return () => sub?.remove();
  }, [fail]);

  const onMessage = useMemo(() => {
    // The one thing that actually makes sound, handed to the core so the core itself
    // stays free of native imports.
    const pcm = new PcmPlayer();
    pcmRef.current = pcm;
    setSpeaker({ play: (samples, rate) => pcm.play(samples, rate) });

    const send = (js: string) => webRef.current?.injectJavaScript(js);
    const mic = createMic((msg) => dispatchMic(send, msg));
    micRef.current = mic;

    // The orb animates from these rather than from the page's own analyser, because
    // playback is native now. See core/playback.ts.
    playback.setSink((msg) => dispatchAudio(send, msg));

    const host = createHost(send, createSocketHandler(), async (msg) => {
      // Barge-in from the page: it owns the button, the native side owns the sound.
      if (msg.t === 'audio:stop') {
        playback.stop();
        return true;
      }
      // Reopen setup, which is where the model is chosen.
      if (msg.t === 'setup:open') {
        setNeedsSetup(true);
        return true;
      }
      return mic.handle(msg);
    });
    return (e: WebViewMessageEvent) => {
      void host(e.nativeEvent.data);
    };
  }, []);

  const reloadAfterCrash = useCallback(() => {
    console.log('[webview] content process was killed; reloading the UI');
    // Whatever was mid-flight died with the process.
    playback.stop();
    void micRef.current?.release();
    setReady(false);
    webRef.current?.reload();
  }, []);

  // First run: download before anything else. The web UI cannot help here, because
  // she has no voice and no mind until this finishes.
  if (needsSetup === true) {
    return (
      <ModelSetup
        onReady={() => {
          setNeedsSetup(false);
          void loadEngines();
        }}
      />
    );
  }

  if (needsSetup === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{failed}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <WebView
        ref={webRef}
        // The UI is loaded from the bundle, so file access has to be allowed and
        // scoped to the folder it lives in rather than opened up wholesale.
        source={{ uri: WEB_INDEX }}
        originWhitelist={['file://', 'http://poppys.local', 'about:']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowingReadAccessToURL={WEB_ROOT}
        // Must be *before* content loads: chat.js reads window.BACKEND at module
        // scope, and the page captures WebSocket when a call starts.
        injectedJavaScriptBeforeContentLoaded={SHIM_JS}
        onMessage={onMessage}
        onLoadEnd={() => setReady(true)}
        // A WebView runs its content in its own process, with a far smaller memory
        // allowance than this app — which is holding a multi-gigabyte model. When
        // the system is under pressure that process is the first thing it kills,
        // and the only symptom is the whole UI turning blank white and staying
        // that way: nothing reloads it on its own. Reload it here, because a blank
        // app is worse than a re-render. Named differently on each platform for
        // the same event.
        onContentProcessDidTerminate={reloadAfterCrash}
        onRenderProcessGone={reloadAfterCrash}
        onError={(e: Parameters<NonNullable<WebViewProps['onError']>>[0]) => setFailed(`WebView failed: ${e.nativeEvent.description}`)}
        mediaPlaybackRequiresUserAction={false}
        style={styles.web}
      />
      {!ready && (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      )}
      {!!engineStatus && (
        <View
          style={[styles.engineStatus, engineFailed && styles.engineStatusBad]}
          pointerEvents="none">
          <Text style={[styles.engineStatusText, engineFailed && styles.engineStatusTextBad]}>
            {engineStatus}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaf1f8' },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  err: { color: '#b3261e', textAlign: 'center' },
  loading: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  engineStatus: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingVertical: 6, alignItems: 'center',
    backgroundColor: 'rgba(7,18,7,0.06)',
  },
  engineStatusText: { fontSize: 11, color: 'rgba(7,18,7,0.55)' },
  // A failure sits at the top, over the app, in the poppy red, and is legible.
  engineStatusBad: {
    top: 0, bottom: undefined,
    paddingTop: 64, paddingBottom: 16, paddingHorizontal: 20,
    backgroundColor: '#e92832',
  },
  engineStatusTextBad: {
    fontSize: 15, lineHeight: 21, color: '#fff8ea',
    fontWeight: '600', textAlign: 'center',
  },
});
