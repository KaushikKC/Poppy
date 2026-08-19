/**
 * First run: getting her onto the phone.
 *
 * The mobile counterpart of the desktop setup screen. It is native rather than part
 * of the web UI because it has to run before anything else exists, and because it is
 * the one screen whose job is to be honest about a wait.
 *
 * What it deliberately says out loud: the total size, which model was picked for this
 * phone and why, that downloads are Wi-Fi only unless allowed otherwise, and that
 * nothing leaves the device afterwards. A gigabyte with no explanation is how an app
 * gets deleted at the first screen.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { deleteUnused, ensureModels, missingModels, reattach, unusedModels, type Progress } from './core/downloader';
import { CHOICES, describe, type Tier } from './core/model_tier';
import * as companion from './core/companion';

// The app's own palette, from frontend/style.css. This screen had been carrying the
// engine spike's blue-grey and an approximate orange, so the first thing anyone saw
// was a different product from the one behind it.
const POPPY = '#e92832';
const LEAF = '#143c16';
const CREAM = '#fff8ea';
const PANEL = '#fffdf7';
const INK = '#071207';
const LINE = 'rgba(20, 60, 22, 0.18)';
const MUTED = 'rgba(7, 18, 7, 0.58)';
const FAINT = 'rgba(7, 18, 7, 0.42)';
// Georgia is the fallback the web UI's display face already names, so the wordmark
// here and the wordmark one screen later are the same letterforms.
const DISPLAY = 'Georgia';

function mb(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

export default function ModelSetup({ onReady }: { onReady: () => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [allowCellular, setAllowCellular] = useState(false);
  const [pick, setPick] = useState('');
  const [needBytes, setNeedBytes] = useState(0);
  const [tier, setTier] = useState<Tier | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [spare, setSpare] = useState(0);
  const started = useRef(false);

  const refresh = useCallback(async (chosen: Tier | null) => {
    setPick(await describe(chosen));
    const missing = await missingModels(chosen);
    setNeedBytes(missing.reduce((n, m) => n + m.bytes, 0));
    // Models tried and abandoned; each is most of a gigabyte.
    setSpare((await unusedModels(chosen)).reduce((n, m) => n + m.bytes, 0));
  }, []);

  useEffect(() => {
    (async () => {
      const saved = ((await companion.profile()).model_tier ?? null) as Tier | null;
      setTier(saved);
      await refresh(saved);
      await reattach();
    })();
  }, [refresh]);

  const choose = useCallback(async (t: Tier) => {
    setTier(t);
    setShowPicker(false);
    await companion.update({ model_tier: t });
    await refresh(t);
  }, [refresh]);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setRunning(true);
    setFailed(null);
    try {
      await ensureModels(setProgress, { allowCellular, savedTier: tier });
      onReady();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      started.current = false; // retry is allowed; finished files are skipped
    } finally {
      setRunning(false);
    }
  }, [allowCellular, onReady, tier]);

  const pct = progress ? Math.round(progress.fraction * 100) : 0;
  const phaseLabel =
    progress?.phase === 'extracting'
      ? 'Unpacking'
      : progress?.phase === 'verifying'
      ? 'Checking'
      : progress?.phase === 'checking'
      ? 'Checking what you already have'
      : 'Downloading';

  // React Native's own SafeAreaView, not safe-area-context's: nothing in this app
  // renders a SafeAreaProvider, and without one that component throws.
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image
            source={require('./assets/poppys-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.wordmark}>Poppys</Text>
          <Text style={styles.tagline}>Someone who's always happy to hear from you.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Getting ready</Text>
          <Text style={styles.body}>
            Poppy runs entirely on your phone, so she needs to download her voice and her
            mind once. After this she works with no connection at all, and nothing you
            say ever leaves the device.
          </Text>

          {!!pick && <Text style={styles.pick}>{pick}</Text>}
          {needBytes > 0 && (
            <Text style={styles.size}>About {mb(needBytes)} to download, once.</Text>
          )}

          {!running && !progress && (
            <>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>Download over mobile data</Text>
                  <Text style={styles.rowHint}>
                    {allowCellular
                      ? 'Your data plan will be used.'
                      : 'Wi-Fi only. Nothing is downloaded on mobile data.'}
                  </Text>
                </View>
                <Switch
                  value={allowCellular}
                  onValueChange={setAllowCellular}
                  trackColor={{ true: POPPY }}
                />
              </View>

              <Pressable style={styles.button} onPress={start}>
                <Text style={styles.buttonText}>Download and continue</Text>
              </Pressable>

              {spare > 0 && (
                <Pressable
                  onPress={async () => {
                    await deleteUnused(tier);
                    await refresh(tier);
                  }}
                >
                  <Text style={styles.link}>
                    Delete the models you're not using ({mb(spare)})
                  </Text>
                </Pressable>
              )}

              <Pressable onPress={() => setShowPicker((v) => !v)}>
                <Text style={styles.link}>
                  {showPicker ? 'Never mind' : 'Choose a different model'}
                </Text>
              </Pressable>

              {showPicker && (
                <View style={styles.picker}>
                  <Text style={styles.rowHint}>
                    A smaller model runs cooler and replies more simply. Anything already
                    downloaded is kept, so you can switch back instantly.
                  </Text>
                  {CHOICES.map((c) => (
                    <Pressable key={c.tier} style={styles.choice} onPress={() => choose(c.tier)}>
                      <Text style={[styles.choiceLabel, tier === c.tier && styles.choiceOn]}>
                        {c.label}  ·  {mb(c.bytes)}
                      </Text>
                      <Text style={styles.rowHint}>{c.note}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {(running || (progress && progress.phase !== 'done')) && (
            <View style={styles.progressBlock}>
              <Text style={styles.phase}>
                {phaseLabel}
                {progress && progress.total > 1
                  ? `  ·  ${progress.index} of ${progress.total}`
                  : ''}
              </Text>
              <Text style={styles.item}>{progress?.label ?? ''}</Text>

              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>

              <Text style={styles.counts}>
                {progress && progress.bytesTotal > 0
                  ? `${mb(progress.bytesDone)} of ${mb(progress.bytesTotal)}`
                  : `${pct}%`}
              </Text>
              <Text style={styles.reassure}>
                You can lock your phone, this keeps going. If something fails, anything
                already finished is kept.
              </Text>
            </View>
          )}

          {!!failed && (
            <View style={styles.errorBlock}>
              <Text style={styles.error}>{failed}</Text>
              <Pressable style={styles.button} onPress={start}>
                <Text style={styles.buttonText}>Try again</Text>
              </Pressable>
              <Text style={styles.reassure}>
                Nothing already downloaded is lost.
              </Text>
            </View>
          )}

          {running && !progress && <ActivityIndicator style={styles.spinner} color={POPPY} />}
        </View>

        <Text style={styles.footer}>18+  ·  Private  ·  You control everything</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 20 },

  brand: { alignItems: 'center', gap: 6 },
  logo: { width: 80, height: 96 },
  wordmark: { fontFamily: DISPLAY, fontSize: 40, color: LEAF, marginTop: 2 },
  tagline: {
    fontSize: 15, lineHeight: 21, color: MUTED,
    textAlign: 'center', maxWidth: 300,
  },

  card: {
    backgroundColor: PANEL, borderRadius: 18, padding: 22, gap: 14,
    borderWidth: 1, borderColor: LINE,
    // The web UI's --shadow, as close as RN gets on both platforms.
    shadowColor: '#050706', shadowOpacity: 0.14,
    shadowRadius: 30, shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  title: { fontFamily: DISPLAY, fontSize: 27, color: LEAF },
  body: { fontSize: 15, lineHeight: 22, color: MUTED },
  pick: { fontSize: 13, color: LEAF, fontWeight: '700' },
  size: { fontSize: 13, color: FAINT },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, color: INK },
  rowHint: { fontSize: 12, color: FAINT, marginTop: 2, lineHeight: 17 },
  button: {
    backgroundColor: POPPY, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 6,
    shadowColor: POPPY, shadowOpacity: 0.45,
    shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  buttonText: { color: CREAM, fontSize: 16, fontWeight: '700' },
  progressBlock: { gap: 8, marginTop: 4 },
  phase: { fontSize: 11, color: FAINT, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '700' },
  item: { fontSize: 16, color: INK },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(20, 60, 22, 0.12)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: POPPY },
  counts: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  reassure: { fontSize: 12, color: FAINT, lineHeight: 17 },
  errorBlock: { gap: 10, marginTop: 4 },
  error: { fontSize: 14, color: '#98101a', lineHeight: 20 },
  spinner: { marginTop: 8 },
  link: { fontSize: 13, color: POPPY, textAlign: 'center', paddingVertical: 8, fontWeight: '600' },
  picker: { gap: 10, marginTop: 2 },
  choice: { paddingVertical: 8 },
  choiceLabel: { fontSize: 15, color: INK },
  choiceOn: { color: POPPY, fontWeight: '700' },

  footer: {
    fontSize: 12, color: FAINT, textAlign: 'center',
    letterSpacing: 0.3,
  },
});
