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
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ensureModels, missingModels, reattach, type Progress } from './core/downloader';
import { describe } from './core/model_tier';

const POPPY = '#e8552b';

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
  const started = useRef(false);

  useEffect(() => {
    (async () => {
      setPick(await describe());
      const missing = await missingModels();
      setNeedBytes(missing.reduce((n, m) => n + m.bytes, 0));
      // A download that survived the app being backgrounded is picked up rather than
      // started again.
      await reattach();
    })();
  }, []);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setRunning(true);
    setFailed(null);
    try {
      await ensureModels(setProgress, { allowCellular });
      onReady();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      started.current = false; // retry is allowed, and continues where it stopped
    } finally {
      setRunning(false);
    }
  }, [allowCellular, onReady]);

  const pct = progress ? Math.round(progress.fraction * 100) : 0;
  const phaseLabel =
    progress?.phase === 'extracting'
      ? 'Unpacking'
      : progress?.phase === 'verifying'
      ? 'Checking'
      : progress?.phase === 'checking'
      ? 'Checking what you already have'
      : 'Downloading';

  return (
    <View style={styles.root}>
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
              You can leave this screen open. If the connection drops it picks up where
              it stopped.
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

        {running && !progress && <ActivityIndicator style={styles.spinner} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaf1f8', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fffdf9', borderRadius: 22, padding: 24, gap: 14 },
  title: { fontSize: 26, fontWeight: '600', color: '#1f2d3d' },
  body: { fontSize: 15, lineHeight: 22, color: '#4a5a6a' },
  pick: { fontSize: 13, color: '#5b6b7c', fontWeight: '600' },
  size: { fontSize: 13, color: '#8a8f98' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, color: '#1f2d3d' },
  rowHint: { fontSize: 12, color: '#8a8f98', marginTop: 2 },
  button: {
    backgroundColor: POPPY, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 6,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  progressBlock: { gap: 8, marginTop: 4 },
  phase: { fontSize: 12, color: '#8a8f98', letterSpacing: 0.4, textTransform: 'uppercase' },
  item: { fontSize: 16, color: '#1f2d3d' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#e6e1d8', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: POPPY },
  counts: { fontSize: 13, color: '#5b6b7c', fontVariant: ['tabular-nums'] },
  reassure: { fontSize: 12, color: '#8a8f98', lineHeight: 17 },
  errorBlock: { gap: 10, marginTop: 4 },
  error: { fontSize: 14, color: '#b3261e', lineHeight: 20 },
  spinner: { marginTop: 8 },
});
