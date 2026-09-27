/**
 * First run: getting her onto the phone.
 *
 * The mobile counterpart of the desktop setup screen. It is native rather than part
 * of the web UI because it has to run before anything else exists, and because it is
 * the one screen whose job is to be honest about a wait.
 *
 * ── Why this screen is a seed growing ─────────────────────────────────────────
 *
 * It started as a status report: the model tier and why it was picked, the total in
 * megabytes, the filename in flight, "2 of 3", bytes done of bytes total, an offer to
 * delete models from a tier nobody knew they had. Every line true, none of it what a
 * first-time user is asking, and testers read the whole thing as a settings page that
 * arrived before the app did.
 *
 * A progress bar is the same mistake in a smaller font. It tells someone to watch a
 * number, which makes the wait the subject, and the wait is the worst thing we have to
 * offer on day zero. So the download is not reported here, it is *dramatised*: a seed
 * goes into the soil, roots take, leaves unfurl, a bud forms, and it blooms as the last
 * bytes land. The growth IS the progress indicator, which is why there is no percentage
 * and no byte count anywhere on this screen.
 *
 * The garden is the product's own long game (backend/garden.py, POPPY_RETENTION_ENGINE
 * §3.1), so this is not decoration borrowed from somewhere: the first thing you ever
 * grow in Poppys is her, and the mechanic that keeps people two months later is being
 * taught in the two minutes where we would otherwise be apologising.
 *
 * Tapping waters it. That is a pastime, not a speed-up, and the copy never implies
 * otherwise. It exists because a screen you can touch is one you stay on.
 *
 * What stays honest, because it is about their money rather than our implementation:
 * Wi-Fi only unless they say otherwise. The engineering detail moved to the console,
 * where it is still there for us and invisible to them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
const POPPY_DEEP = '#c01f28';
const LEAF = '#143c16';
const LEAF_LIGHT = '#2f6b32';
const CREAM = '#fff8ea';
const SOIL = 'rgba(20, 60, 22, 0.13)';
const MUTED = 'rgba(7, 18, 7, 0.58)';
const FAINT = 'rgba(7, 18, 7, 0.42)';
// Georgia is the fallback the web UI's display face already names, so the wordmark
// here and the wordmark one screen later are the same letterforms.
const DISPLAY = 'Georgia';

/** Height of the stage the plant grows in. */
const STAGE = 300;
/** How tall the stem gets at full growth. */
const STEM = 150;
const PETALS = 6;

/**
 * What she is doing, in her terms rather than ours, keyed to how grown the plant is.
 *
 * Deliberately not a mapping from download phases: "Extracting archive 2 of 3" is an
 * event in our code, not in the person's experience. These are tied to what is on
 * screen, so the words and the picture always agree.
 */
const STAGES: { at: number; line: string }[] = [
  { at: 0.0, line: 'A seed goes in' },
  { at: 0.18, line: 'Roots taking hold' },
  { at: 0.42, line: 'First leaves' },
  { at: 0.68, line: 'A bud, almost' },
  { at: 0.9, line: 'She is about to bloom' },
];

function lineFor(growth: number): string {
  let out = STAGES[0].line;
  for (const s of STAGES) if (growth >= s.at) out = s.line;
  return out;
}

export default function ModelSetup({ onReady }: { onReady: () => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [allowCellular, setAllowCellular] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [stageLine, setStageLine] = useState(STAGES[0].line);
  const started = useRef(false);

  // ── The animated values ────────────────────────────────────────────────────
  // grow drives everything the plant does; the rest are ambient or reactions.
  const grow = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const sun = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  // A small pool, so a fast tapper cannot allocate animations without limit.
  const drops = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const nextDrop = useRef(0);
  const motes = useMemo(
    () => [0, 1, 2, 3, 4, 5].map((i) => ({
      v: new Animated.Value(0),
      x: 26 + ((i * 47) % 200),
      delay: i * 900,
      size: 4 + (i % 3),
    })),
    [],
  );

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

  // ── Ambient motion, running from the first frame ───────────────────────────
  // The screen is never still, including before the download starts and during the
  // long flat stretch of a single large file, which is exactly where a bar looks dead.
  useEffect(() => {
    const cycle = (v: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
    const loops = [cycle(sway, 3200), cycle(sun, 5200)];
    // Pollen drifting up. Each one restarts from the bottom, staggered, so the air
    // has motion in it without anything looking mechanical.
    for (const m of motes) {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(m.delay),
            Animated.timing(m.v, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true }),
            Animated.timing(m.v, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ),
      );
    }
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [motes, sun, sway]);

  /**
   * One number for the whole job, not for the current file.
   *
   * `Progress.fraction` is per item, so following it directly made growth lurch back at
   * each file, which reads as something going wrong. Each item is weighted as mostly
   * download and a little unpacking, so the plant only ever grows.
   */
  const overall = (() => {
    if (!progress || progress.total < 1) return 0;
    const within =
      progress.phase === 'extracting' || progress.phase === 'verifying'
        ? 0.9 + 0.1 * progress.fraction
        : 0.9 * progress.fraction;
    return Math.min(1, (progress.index - 1 + within) / progress.total);
  })();

  // Growth eases toward the real figure rather than jumping to it, so a chunk landing
  // shows up as the plant moving rather than as a step change.
  useEffect(() => {
    Animated.timing(grow, {
      toValue: overall,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setStageLine(lineFor(overall));
  }, [grow, overall]);

  const water = useCallback(() => {
    const v = drops[nextDrop.current % drops.length];
    nextDrop.current += 1;
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 780, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
    // The plant notices. Native driver on a rotation, so a tap costs nothing even
    // while three files are downloading.
    wobble.setValue(0);
    Animated.sequence([
      Animated.timing(wobble, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(wobble, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [drops, wobble]);

  const start = useCallback(
    async (cellular = allowCellular) => {
      if (started.current) return;
      started.current = true;
      setRunning(true);
      setFailed(null);
      try {
        await ensureModels(onProgress, { allowCellular: cellular, savedTier: tier });
        // Models from a tier this phone no longer uses are most of a gigabyte each and
        // exist only because a previous run picked differently. Nobody asked for them,
        // so reclaiming the space is not a decision to put on someone's first screen.
        // Failure here is irrelevant to whether the app can start.
        void unusedModels(tier)
          .then((spare) => (spare.length ? deleteUnused(tier) : 0))
          .catch(() => {});
        // Let the bloom finish before the screen is taken away. It is a second, and it
        // is the payoff for the whole wait.
        Animated.timing(grow, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        setTimeout(onReady, 1100);
      } catch (err) {
        setFailed(err instanceof Error ? err.message : String(err));
        started.current = false; // retry is allowed; finished files are skipped
      } finally {
        setRunning(false);
      }
    },
    [allowCellular, grow, onProgress, onReady, tier],
  );

  const useCellular = useCallback(() => {
    setAllowCellular(true);
    void start(true);
  }, [start]);

  // "Waiting for Wi-Fi" is not a failure, it is a question, and it gets an answer they
  // can tap rather than an error in red.
  const needsWifi = !!failed && failed.startsWith('Waiting for Wi-Fi');

  // ── Derived transforms ─────────────────────────────────────────────────────
  // Every one of these is native-driver safe (transform and opacity only), which is
  // what lets the whole scene keep moving while the CPU is busy unpacking archives.
  const stemScale = grow.interpolate({ inputRange: [0, 1], outputRange: [0.04, 1] });
  const swayDeg = sway.interpolate({ inputRange: [0, 1], outputRange: ['-2.2deg', '2.2deg'] });
  const wobbleDeg = wobble.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });

  const leafOne = grow.interpolate({ inputRange: [0.22, 0.46], outputRange: [0, 1], extrapolate: 'clamp' });
  const leafTwo = grow.interpolate({ inputRange: [0.4, 0.64], outputRange: [0, 1], extrapolate: 'clamp' });
  const budScale = grow.interpolate({ inputRange: [0.6, 0.86], outputRange: [0, 1], extrapolate: 'clamp' });
  const bloom = grow.interpolate({ inputRange: [0.84, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const bloomScale = bloom.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const sunScale = sun.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  // The bud and the flower sit at the top of the plant container, which is where the
  // stem reaches only at full growth. Without this they would hang in the air above a
  // half-grown stem: they ride the tip down by however much stem is still missing.
  const tip = grow.interpolate({ inputRange: [0, 1], outputRange: [STEM, 0] });
  const sunGlow = sun.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.26] });

  return (
    <SafeAreaView style={styles.root}>
      {/* The whole scene is the touch target: watering should not require aim. */}
      <Pressable style={styles.stage} onPress={water} android_disableSound>
        <Animated.View style={[styles.sun, { opacity: sunGlow, transform: [{ scale: sunScale }] }]} />

        {motes.map((m, i) => (
          <Animated.View
            key={`mote-${i}`}
            style={[
              styles.mote,
              {
                left: m.x,
                width: m.size,
                height: m.size,
                borderRadius: m.size / 2,
                opacity: m.v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.5, 0.35, 0] }),
                transform: [
                  { translateY: m.v.interpolate({ inputRange: [0, 1], outputRange: [0, -STAGE + 40] }) },
                  { translateX: m.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, -8] }) },
                ],
              },
            ]}
          />
        ))}

        {drops.map((d, i) => (
          <Animated.View
            key={`drop-${i}`}
            style={[
              styles.drop,
              {
                opacity: d.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.9, 0.9, 0] }),
                transform: [
                  { translateY: d.interpolate({ inputRange: [0, 1], outputRange: [-STAGE * 0.42, -18] }) },
                  { scaleY: d.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1.5, 0.4] }) },
                ],
              },
            ]}
          />
        ))}

        {/* The plant. Anchored to the soil line, and everything above grows out of it. */}
        <Animated.View
          style={[
            styles.plant,
            {
              // Pivot at the base rather than the container's centre: shift down, turn,
              // shift back. A stem that rotates about its middle slides through the soil.
              transform: [
                { translateY: STEM / 2 },
                { rotate: swayDeg },
                { rotate: wobbleDeg },
                { translateY: -STEM / 2 },
              ],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.stem,
              {
                // translate, scale, translate back: keeps the base pinned to the soil
                // while the stem lengthens upward.
                transform: [{ translateY: STEM / 2 }, { scaleY: stemScale }, { translateY: -STEM / 2 }],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.leafLeft,
              {
                opacity: leafOne,
                transform: [
                  { scale: leafOne },
                  { rotate: '-34deg' },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.leafRight,
              {
                opacity: leafTwo,
                transform: [
                  { scale: leafTwo },
                  { rotate: '34deg' },
                ],
              },
            ]}
          />

          {/* Bud, then the petals opening out of it. */}
          <Animated.View style={[styles.bud, { transform: [{ translateY: tip }, { scale: budScale }] }]} />
          <Animated.View style={[styles.flower, { transform: [{ translateY: tip }, { scale: bloomScale }] }]}>
            {Array.from({ length: PETALS }).map((_, i) => (
              <Animated.View
                key={`petal-${i}`}
                style={[
                  styles.petal,
                  {
                    opacity: bloom,
                    transform: [
                      { rotate: `${(360 / PETALS) * i}deg` },
                      {
                        translateY: bloom.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }),
                      },
                      { scale: bloom },
                    ],
                  },
                ]}
              />
            ))}
            <Animated.View style={[styles.heart, { opacity: bloom }]} />
          </Animated.View>
        </Animated.View>

        <View style={styles.soil} />
      </Pressable>

      <View style={styles.copy}>
        {!running && !failed && (
          <>
            <Text style={styles.title}>Plant her</Text>
            <Text style={styles.body}>
              Poppy grows on your phone rather than in someone's data centre. It takes a
              few minutes once, and then she is yours, offline, for good.
            </Text>
          </>
        )}

        {running && (
          <>
            <Text style={styles.title}>{stageLine}</Text>
            <Text style={styles.body}>Tap anywhere to water her. You can lock your phone, she keeps growing.</Text>
          </>
        )}

        {needsWifi && (
          <>
            <Text style={styles.title}>Waiting for Wi-Fi</Text>
            <Text style={styles.body}>
              She waits for Wi-Fi by default, so a big first day never lands on your data
              plan by surprise.
            </Text>
          </>
        )}

        {!!failed && !needsWifi && (
          <>
            <Text style={styles.title}>She stopped growing</Text>
            <Text style={styles.body}>
              Something interrupted it. Nothing already planted is lost, so carrying on
              picks up where it stopped.
            </Text>
          </>
        )}
      </View>

      <View style={styles.actions}>
        {!running && !failed && (
          <>
            <Pressable style={styles.button} onPress={() => start()}>
              <Text style={styles.buttonText}>Plant the seed</Text>
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
            <Text style={styles.buttonText}>Keep going</Text>
          </Pressable>
        )}

        {running && <Text style={styles.note}>Nothing here ever leaves your phone.</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM, justifyContent: 'space-between' },

  stage: { height: STAGE, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  sun: {
    position: 'absolute', top: 18, right: 26,
    width: 130, height: 130, borderRadius: 65, backgroundColor: POPPY,
  },
  mote: { position: 'absolute', bottom: 40, backgroundColor: LEAF_LIGHT },
  drop: {
    position: 'absolute', bottom: 40,
    width: 6, height: 10, borderRadius: 3,
    backgroundColor: 'rgba(47, 107, 50, 0.55)',
  },

  soil: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 40,
    backgroundColor: SOIL,
    borderTopLeftRadius: 200, borderTopRightRadius: 200,
  },
  plant: { position: 'absolute', bottom: 34, alignItems: 'center', width: 160, height: STEM },
  stem: {
    position: 'absolute', bottom: 0,
    width: 7, height: STEM, borderRadius: 4,
    backgroundColor: LEAF,
  },
  leafLeft: {
    position: 'absolute', bottom: STEM * 0.3, right: 80,
    width: 46, height: 22, borderRadius: 22,
    backgroundColor: LEAF_LIGHT,
  },
  leafRight: {
    position: 'absolute', bottom: STEM * 0.52, left: 80,
    width: 46, height: 22, borderRadius: 22,
    backgroundColor: LEAF_LIGHT,
  },
  bud: {
    position: 'absolute', top: -6,
    width: 24, height: 30, borderRadius: 14,
    backgroundColor: POPPY_DEEP,
  },
  flower: { position: 'absolute', top: -34, width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  petal: {
    position: 'absolute',
    width: 30, height: 40, borderRadius: 18,
    backgroundColor: POPPY,
  },
  heart: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#ffe9a8',
  },

  copy: { alignItems: 'center', gap: 10, paddingHorizontal: 34, maxWidth: 380, alignSelf: 'center' },
  title: { fontFamily: DISPLAY, fontSize: 29, color: LEAF, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, color: MUTED, textAlign: 'center' },

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
