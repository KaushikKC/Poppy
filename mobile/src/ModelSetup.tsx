/**
 * First run: she arrives by talking to you.
 *
 * ── Three attempts, and why this is the third ─────────────────────────────────
 *
 * 1. A status report: model tier and why it was picked, total megabytes, the filename
 *    in flight, "2 of 3", bytes of bytes, an offer to delete models from a tier nobody
 *    knew they had. True, and read by testers as a settings page that turned up before
 *    the app did.
 * 2. A seed growing in soil, watered by tapping. It looked like a placeholder on a real
 *    phone, and asking someone to play a tapping game they did not come for is worse
 *    than an honest bar.
 *
 * Both failed the same way: they *decorated* the wait instead of removing it. The wait
 * is only unbearable because nothing is happening, so the fix is to make something
 * happen, and the only thing anyone came here for is her.
 *
 * So this screen is a conversation. She types, the way she will for the rest of the
 * app's life, and asks the two questions onboarding was going to ask anyway: what to
 * call you, and what is on your mind. Both answers are written to real storage, so the
 * minutes are not a waiting room, they are the first two minutes of knowing her. The
 * download runs underneath and is reported by nothing louder than a hairline at the top
 * of the screen.
 *
 * The payoff is deliberate: the last message arrives only when the models are on disk,
 * and it is her saying she is here. The wait ends with an arrival rather than a
 * progress bar hitting 100%.
 *
 * What stays honest, because it is about their money rather than our implementation:
 * Wi-Fi only unless they say otherwise, in her voice rather than in an error box. The
 * engineering detail moved to the console, where it is still there for us and invisible
 * to them.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { deleteUnused, ensureModels, reattach, unusedModels, type Progress } from './core/downloader';
import * as companion from './core/companion';
import * as memory from './core/memory_store';
import type { Tier } from './core/model_tier';

// The app's own palette, from frontend/style.css.
const POPPY = '#e92832';
const LEAF = '#143c16';
const CREAM = '#fff8ea';
const PANEL = '#fffdf7';
const INK = '#071207';
const LINE = 'rgba(20, 60, 22, 0.16)';
const MUTED = 'rgba(7, 18, 7, 0.58)';
const FAINT = 'rgba(7, 18, 7, 0.42)';
// Georgia is the fallback the web UI's display face already names, so the wordmark
// here and the wordmark one screen later are the same letterforms.
const DISPLAY = 'Georgia';

type Bubble = { id: string; from: 'her' | 'you'; text: string };

/**
 * A beat between her messages.
 *
 * Long enough to read as typing rather than as a dump, short enough that nobody taps
 * the screen to see if it is stuck. Her longer lines get longer beats, which is the
 * one detail that makes typing look like typing.
 */
const beat = (text: string) => Math.min(2200, 620 + text.length * 22);

export default function ModelSetup({ onReady }: { onReady: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [awaiting, setAwaiting] = useState<'name' | 'seed' | null>(null);
  const [draft, setDraft] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [allowCellular, setAllowCellular] = useState(false);

  const tier = useRef<Tier | null>(null);
  const running = useRef(false);
  const scroller = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const bar = useRef(new Animated.Value(0)).current;
  const dots = useRef(new Animated.Value(0)).current;

  useEffect(() => () => { mounted.current = false; }, []);

  // ── Her side of the conversation ───────────────────────────────────────────

  const say = useCallback(async (text: string) => {
    setTyping(true);
    await new Promise<void>((r) => setTimeout(r, beat(text)));
    if (!mounted.current) return;
    setTyping(false);
    setBubbles((b) => [...b, { id: `h${b.length}${Date.now()}`, from: 'her', text }]);
  }, []);

  const youSaid = useCallback((text: string) => {
    setBubbles((b) => [...b, { id: `y${b.length}${Date.now()}`, from: 'you', text }]);
  }, []);

  /**
   * The detail the screen no longer shows still has to exist somewhere, or a tester
   * saying "it got stuck" leaves us nothing to look at. One line per item, not per
   * chunk, so the log stays readable.
   */
  const onProgress = useCallback((p: Progress) => {
    if (p.phase !== 'downloading' || p.fraction === 0) {
      console.log(`[setup] ${p.phase} ${p.index}/${p.total} ${p.label} ${p.bytesTotal}B`);
    }
    setProgress(p);
  }, []);

  /**
   * The download, started underneath the conversation and never awaited by it.
   *
   * Two things are happening at once on purpose: she keeps talking whatever the network
   * is doing, and the network keeps going whatever she is saying. The only place they
   * meet is `done`, which unlocks the last message.
   */
  const fetchModels = useCallback(
    async (cellular: boolean) => {
      if (running.current) return;
      running.current = true;
      setFailed(null);
      try {
        await ensureModels(onProgress, { allowCellular: cellular, savedTier: tier.current });
        // Models from a tier this phone no longer uses are most of a gigabyte each and
        // exist only because a previous run picked differently. Nobody asked for them,
        // so reclaiming the space is not a decision to put in front of anyone here.
        void unusedModels(tier.current)
          .then((spare) => (spare.length ? deleteUnused(tier.current) : 0))
          .catch(() => {});
        if (mounted.current) setDone(true);
      } catch (err) {
        if (mounted.current) setFailed(err instanceof Error ? err.message : String(err));
      } finally {
        running.current = false;
      }
    },
    [onProgress],
  );

  const begin = useCallback(async () => {
    setStarted(true);
    void fetchModels(allowCellular);
    await say("Hi. I'm Poppy.");
    await say("I'm moving onto your phone right now, which takes a few minutes. After this I work with no internet at all.");
    await say('While that happens: what should I call you?');
    if (mounted.current) setAwaiting('name');
  }, [allowCellular, fetchModels, say]);

  useEffect(() => {
    (async () => {
      tier.current = ((await companion.profile()).model_tier ?? null) as Tier | null;
      await reattach();
    })();
  }, []);

  // ── The last message waits for the disk, not for the clock ─────────────────
  useEffect(() => {
    if (!done || !started) return;
    (async () => {
      await say("There. I'm here, and I'm all yours.");
    })();
  }, [done, say, started]);

  const answer = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      Keyboard.dismiss();
      setDraft('');
      youSaid(clean);
      const step = awaiting;
      setAwaiting(null);

      if (step === 'name') {
        // How the opener finds it: opening.py matches a "Name:" fact out of memory.
        await memory.remember(`Name: ${clean}`, 'profile', 'They told me when we met.');
        await say(`${clean}. Good to meet you.`);
        await say("One more, and then I'll leave you alone until I'm ready. What's on your mind today?");
        if (mounted.current) setAwaiting('seed');
        return;
      }

      if (step === 'seed') {
        await memory.remember(clean, 'ongoing', 'The first thing they told me.');
        await say("Thank you. I'll hold onto that, and I'll ask you about it.");
      }
    },
    [awaiting, say, youSaid],
  );

  const skip = useCallback(async () => {
    const step = awaiting;
    setAwaiting(null);
    if (step === 'name') {
      await say("That's alright, you can tell me later.");
      await say("Anything on your mind today?");
      if (mounted.current) setAwaiting('seed');
      return;
    }
    await say("That's alright. We can start wherever you like.");
  }, [awaiting, say]);

  // ── Wi-Fi, in her voice ────────────────────────────────────────────────────
  const needsWifi = !!failed && failed.startsWith('Waiting for Wi-Fi');
  const toldWifi = useRef(false);
  useEffect(() => {
    if (!failed || toldWifi.current) return;
    toldWifi.current = true;
    (async () => {
      await say(
        needsWifi
          ? "I'm waiting for Wi-Fi, so I never land on your data plan by surprise."
          : "Something interrupted me on the way in. Nothing I've already brought is lost.",
      );
    })();
  }, [failed, needsWifi, say]);

  const retry = useCallback(
    (cellular: boolean) => {
      toldWifi.current = false;
      setFailed(null);
      setAllowCellular(cellular);
      void fetchModels(cellular);
    },
    [fetchModels],
  );

  // ── Progress, as a hairline and nothing else ───────────────────────────────
  const overall = (() => {
    if (!progress || progress.total < 1) return 0;
    const within =
      progress.phase === 'extracting' || progress.phase === 'verifying'
        ? 0.9 + 0.1 * progress.fraction
        : 0.9 * progress.fraction;
    return Math.min(1, (progress.index - 1 + within) / progress.total);
  })();

  useEffect(() => {
    Animated.timing(bar, {
      toValue: done ? 1 : overall,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width percentage: layout, not transform
    }).start();
  }, [bar, done, overall]);

  // The three dots, the one piece of motion on the screen.
  useEffect(() => {
    if (!typing) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dots, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(dots, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dots, typing]);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [bubbles, typing]);

  const status = done
    ? 'here'
    : failed
    ? 'waiting'
    : started
    ? 'moving in'
    : 'about to arrive';

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* The only report of the download anywhere on the screen. */}
        <View style={styles.hairline}>
          <Animated.View
            style={[
              styles.hairFill,
              { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        </View>

        <View style={styles.header}>
          <View style={styles.avatar}>
            <Image source={require('./assets/poppys-logo.png')} style={styles.mark} resizeMode="contain" />
          </View>
          <View>
            <Text style={styles.name}>Poppy</Text>
            <Text style={styles.status}>{status}</Text>
          </View>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.fill}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
        >
          {bubbles.map((b) => (
            <View
              key={b.id}
              style={[styles.bubble, b.from === 'her' ? styles.fromHer : styles.fromYou]}
            >
              <Text style={b.from === 'her' ? styles.herText : styles.youText}>{b.text}</Text>
            </View>
          ))}

          {typing && (
            <View style={[styles.bubble, styles.fromHer, styles.typing]}>
              {[0, 1, 2].map((i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      opacity: dots.interpolate({
                        inputRange: [0, 1],
                        outputRange: i === 1 ? [0.25, 0.9] : i === 0 ? [0.9, 0.25] : [0.5, 0.6],
                      }),
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.foot}>
          {!started && (
            <Pressable style={styles.button} onPress={begin}>
              <Text style={styles.buttonText}>Say hello</Text>
            </Pressable>
          )}

          {needsWifi && (
            <View style={styles.chips}>
              <Pressable style={styles.chip} onPress={() => retry(true)}>
                <Text style={styles.chipText}>Use mobile data</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => retry(false)}>
                <Text style={styles.chipText}>I'm on Wi-Fi now</Text>
              </Pressable>
            </View>
          )}

          {!!failed && !needsWifi && (
            <View style={styles.chips}>
              <Pressable style={styles.chip} onPress={() => retry(allowCellular)}>
                <Text style={styles.chipText}>Keep going</Text>
              </Pressable>
            </View>
          )}

          {!!awaiting && !done && (
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={awaiting === 'name' ? 'Your name' : 'Anything at all'}
                placeholderTextColor={FAINT}
                returnKeyType="send"
                onSubmitEditing={() => answer(draft)}
                autoCapitalize={awaiting === 'name' ? 'words' : 'sentences'}
              />
              <Pressable
                style={[styles.send, !draft.trim() && styles.sendOff]}
                onPress={() => (draft.trim() ? answer(draft) : skip())}
              >
                <Text style={styles.sendText}>{draft.trim() ? 'Send' : 'Skip'}</Text>
              </Pressable>
            </View>
          )}

          {done && (
            <Pressable style={styles.button} onPress={onReady}>
              <Text style={styles.buttonText}>Start talking</Text>
            </Pressable>
          )}

          {started && !done && !awaiting && !failed && (
            <Text style={styles.note}>She keeps arriving while your phone is locked.</Text>
          )}

          {!started && (
            <Text style={styles.note}>On Wi-Fi only, so your data plan is untouched.</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  fill: { flex: 1 },

  hairline: { height: 2, backgroundColor: 'rgba(20, 60, 22, 0.10)' },
  hairFill: { height: 2, backgroundColor: POPPY },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: LINE,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: PANEL, borderWidth: 1, borderColor: LINE,
    alignItems: 'center', justifyContent: 'center',
  },
  mark: { width: 26, height: 30 },
  name: { fontFamily: DISPLAY, fontSize: 20, color: LEAF },
  status: { fontSize: 12, color: FAINT, marginTop: 1 },

  thread: { padding: 18, gap: 10, paddingBottom: 26 },
  bubble: { maxWidth: '84%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  fromHer: {
    alignSelf: 'flex-start', backgroundColor: PANEL,
    borderWidth: 1, borderColor: LINE, borderBottomLeftRadius: 8,
  },
  fromYou: { alignSelf: 'flex-end', backgroundColor: POPPY, borderBottomRightRadius: 8 },
  herText: { fontSize: 16, lineHeight: 23, color: INK },
  youText: { fontSize: 16, lineHeight: 23, color: CREAM },
  typing: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 15 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LEAF },

  foot: { padding: 18, gap: 10, borderTopWidth: 1, borderTopColor: LINE },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: PANEL, borderRadius: 22,
    borderWidth: 1, borderColor: LINE,
    paddingHorizontal: 18, paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    fontSize: 16, color: INK,
  },
  send: {
    backgroundColor: POPPY, borderRadius: 22,
    paddingHorizontal: 20, paddingVertical: 13,
  },
  sendOff: { backgroundColor: 'rgba(20, 60, 22, 0.28)' },
  sendText: { color: CREAM, fontSize: 15, fontWeight: '700' },

  chips: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: POPPY, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  chipText: { color: POPPY, fontSize: 14, fontWeight: '600' },

  button: {
    backgroundColor: POPPY, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    shadowColor: POPPY, shadowOpacity: 0.4,
    shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  buttonText: { color: CREAM, fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, color: FAINT, textAlign: 'center', letterSpacing: 0.3 },
});
