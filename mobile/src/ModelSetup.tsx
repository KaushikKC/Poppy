/**
 * First run: getting her onto the phone.
 *
 * The mobile counterpart of the desktop setup screen. It is native rather than part
 * of the web UI because it has to run before anything else exists, and because it is
 * the one screen whose job is to be honest about a wait.
 *
 * ── Why this screen shows almost nothing ──────────────────────────────────────
 *
 * It used to show all of it: which model tier the phone got and why, the total in
 * megabytes, the name of the file being fetched, "2 of 3", bytes done of bytes total,
 * and a link offering to delete models from a tier the person never knew they had.
 * All of it true, and all of it answering questions a first-time user is not asking.
 * Testers read it as a settings page that appeared before the app did.
 *
 * What someone waiting actually wants to know is: is this working, how much longer,
 * and is it going to cost me anything. So that is all that is left. An orb that fills
 * as she arrives, one warm line at a time, and a percentage. The engineering detail
 * moved to the console, where it is still there for us and invisible to them.
 *
 * The honesty that stays, because it is about their money and their data rather than
 * our implementation: Wi-Fi only unless they say otherwise, once, and never again.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { deleteUnused, ensureModels, reattach, unusedModels, type Progress } from './core/downloader';
import * as companion from './core/companion';
import type { Tier } from './core/model_tier';

// The app's own palette, from frontend/style.css. This screen had been carrying the
// engine spike's blue-grey and an approximate orange, so the first thing anyone saw
// was a different product from the one behind it.
const POPPY = '#e92832';
const LEAF = '#143c16';
const CREAM = '#fff8ea';
const INK = '#071207';
const MUTED = 'rgba(7, 18, 7, 0.58)';
const FAINT = 'rgba(7, 18, 7, 0.42)';
// Georgia is the fallback the web UI's display face already names, so the wordmark
// here and the wordmark one screen later are the same letterforms.
const DISPLAY = 'Georgia';

const ORB = 172;

/**
 * What she is doing, in her terms rather than ours.
 *
 * Deliberately not a mapping from the download phases. A phase change is an event in
 * our code, not in the person's experience, and "Extracting archive 2 of 3" tells them
 * nothing they can act on. These advance on a timer instead, so the screen always
 * looks alive even during the long flat stretch of a single large file.
 *
 * None of them claims something false. Each one is a real part of first run: the
 * weights, the voice, the listening model, then the checks.
 */
const LINES = [
  'Waking her up',
  'Finding her voice',
  'Teaching her to listen',
  'Settling in',
  'Almost ready',
];

export default function ModelSetup({ onReady }: { onReady: () => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [allowCellular, setAllowCellular] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [line, setLine] = useState(0);
  const started = useRef(false);
  const breathe = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    (async () => {
      const saved = ((await companion.profile()).model_tier ?? null) as Tier | null;
      setTier(saved);
      await reattach();
    })();
  }, []);

  // A slow pulse, always running. The orb is the same presence the call screen uses,
  // so the wait is her arriving rather than a progress bar in an empty room.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  // The lines advance on their own while work is happening.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLine((n) => Math.min(n + 1, LINES.length - 1)), 9000);
    return () => clearInterval(t);
  }, [running]);

  const start = useCallback(
    async (cellular = allowCellular) => {
      if (started.current) return;
      started.current = true;
      setRunning(true);
      setFailed(null);
      setLine(0);
      try {
        await ensureModels(onProgress, { allowCellular: cellular, savedTier: tier });
        // Models from a tier this phone no longer uses are most of a gigabyte each and
        // exist only because a previous run picked differently. Nobody asked for them,
        // so reclaiming the space is not a decision to put in front of someone on their
        // first screen. Failure here is irrelevant to whether the app can start.
        void unusedModels(tier)
          .then((spare) => (spare.length ? deleteUnused(tier) : 0))
          .catch(() => {});
        onReady();
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err));
        started.current = false; // retry is allowed; finished files are skipped
      } finally {
        setRunning(false);
      }
    },
    [allowCellular, onProgress, onReady, tier],
  );

  const useCellular = useCallback(() => {
    setAllowCellular(true);
    void start(true);
  }, [start]);

  /**
   * One number for the whole job, not for the current file.
   *
   * `Progress.fraction` is per item, so showing it directly made the bar jump back to
   * zero twice on the way through, which reads as a failure. Each item is weighted as
   * mostly download and a little unpacking so the number only ever goes forward.
   */
  const overall = (() => {
    if (!progress || progress.total < 1) return 0;
    const within =
      progress.phase === 'extracting' || progress.phase === 'verifying'
        ? 0.9 + 0.1 * progress.fraction
        : 0.9 * progress.fraction;
    return Math.min(1, (progress.index - 1 + within) / progress.total);
  })();
  const pct = Math.round(overall * 100);

  // "Waiting for Wi-Fi" is not a failure, it is a question, and it gets an answer they
  // can tap rather than an error in red.
  const needsWifi = !!failed && failed.startsWith('Waiting for Wi-Fi');

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const glow = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.34] });

  // React Native's own SafeAreaView, not safe-area-context's: nothing in this app
  // renders a SafeAreaProvider, and without one that component throws.
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.stage}>
        <View style={styles.orbWrap}>
          <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale }] }]} />
          <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
            {/* Fills from the bottom as she arrives. */}
            <View style={[styles.level, { height: `${pct}%` }]} />
            <Image
              source={require('./assets/poppys-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {!running && !failed && (
          <View style={styles.copy}>
            <Text style={styles.title}>Poppy is moving in</Text>
            <Text style={styles.body}>
              She lives on your phone, so she arrives once. After that she works with no
              connection at all, and nothing you say ever leaves the device.
            </Text>
          </View>
        )}

        {running && (
          <View style={styles.copy}>
            <Text style={styles.title}>{LINES[line]}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.pct}>{pct}%</Text>
            <Text style={styles.body}>
              This takes a few minutes. You can lock your phone, it keeps going.
            </Text>
          </View>
        )}

        {needsWifi && (
          <View style={styles.copy}>
            <Text style={styles.title}>Waiting for Wi-Fi</Text>
            <Text style={styles.body}>
              She is a big arrival, so she waits for Wi-Fi by default. You can use your
              data plan instead if you'd rather not wait.
            </Text>
          </View>
        )}

        {!!failed && !needsWifi && (
          <View style={styles.copy}>
            <Text style={styles.title}>That got interrupted</Text>
            <Text style={styles.body}>
              Nothing you've already downloaded is lost, so carrying on picks up where it
              stopped.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {!running && !failed && (
          <>
            <Pressable style={styles.button} onPress={() => start()}>
              <Text style={styles.buttonText}>Let her in</Text>
            </Pressable>
            <Text style={styles.note}>On Wi-Fi only, so your data plan is untouched.</Text>
          </>
        )}

        {needsWifi && (
          <>
            <Pressable style={styles.button} onPress={useCellular}>
              <Text style={styles.buttonText}>Use mobile data</Text>
            </Pressable>
            <Pressable onPress={() => start()}>
              <Text style={styles.link}>I'm on Wi-Fi now</Text>
            </Pressable>
          </>
        )}

        {!!failed && !needsWifi && (
          <Pressable style={styles.button} onPress={() => start()}>
            <Text style={styles.buttonText}>Carry on</Text>
          </Pressable>
        )}

        {running && <Text style={styles.note}>Nothing here ever leaves your phone.</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM, justifyContent: 'space-between' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 34, paddingHorizontal: 30 },

  orbWrap: { width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: ORB + 56, height: ORB + 56, borderRadius: (ORB + 56) / 2,
    backgroundColor: POPPY,
  },
  orb: {
    width: ORB, height: ORB, borderRadius: ORB / 2,
    backgroundColor: '#fffdf7',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(20, 60, 22, 0.14)',
    shadowColor: '#050706', shadowOpacity: 0.16,
    shadowRadius: 30, shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  level: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(233, 40, 50, 0.16)',
  },
  logo: { width: 70, height: 84 },

  copy: { alignItems: 'center', gap: 12, maxWidth: 320 },
  title: { fontFamily: DISPLAY, fontSize: 28, color: LEAF, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: MUTED, textAlign: 'center' },

  track: {
    height: 6, borderRadius: 3, width: 240,
    backgroundColor: 'rgba(20, 60, 22, 0.12)', overflow: 'hidden',
    marginTop: 2,
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: POPPY },
  pct: { fontSize: 13, color: INK, fontVariant: ['tabular-nums'], fontWeight: '600' },

  actions: { padding: 26, gap: 10, alignItems: 'stretch' },
  button: {
    backgroundColor: POPPY, borderRadius: 16, paddingVertical: 17,
    alignItems: 'center',
    shadowColor: POPPY, shadowOpacity: 0.45,
    shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  buttonText: { color: CREAM, fontSize: 16, fontWeight: '700' },
  link: { fontSize: 14, color: POPPY, textAlign: 'center', paddingVertical: 10, fontWeight: '600' },
  note: { fontSize: 12, color: FAINT, textAlign: 'center', letterSpacing: 0.3 },
});
