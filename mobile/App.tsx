/**
 * Poppys mobile spike — the M0 de-risking gate from MOBILE_PLAN.md / CROSS_PLATFORM_PLAN.md.
 *
 * Purpose: prove the three on-device engines run end-to-end on a real phone and
 * MEASURE mic-stop -> first-audio. This is a throwaway measurement harness, not
 * the product. Go/no-go: <~1.5s first-audio on a recent iPhone = React Native is a go.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { checkModels, ModelCheck } from './src/models';
import { MicRecorder, PcmPlayer } from './src/audio';
import { Engines, loadEngines, releaseEngines, runTurn, Timing } from './src/pipeline';

type Phase = 'checking' | 'need-models' | 'idle' | 'loading' | 'ready' | 'recording' | 'thinking';

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS prompts on first mic use
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [models, setModels] = useState<ModelCheck[]>([]);
  const [status, setStatus] = useState('');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [timing, setTiming] = useState<Timing | null>(null);
  const [micInfo, setMicInfo] = useState('');

  const engines = useRef<Engines | null>(null);
  const recorder = useRef(new MicRecorder());
  const player = useRef(new PcmPlayer());

  useEffect(() => {
    (async () => {
      const m = await checkModels();
      setModels(m);
      setPhase(m.every((x) => x.present) ? 'idle' : 'need-models');
    })();
    return () => {
      releaseEngines(engines.current);
      player.current.close();
    };
  }, []);

  const load = async () => {
    setPhase('loading');
    try {
      engines.current = await loadEngines(setStatus);
      setStatus('');
      setPhase('ready');
    } catch (err: any) {
      setStatus(`Load failed: ${err?.message ?? err}`);
      setPhase('idle');
    }
  };

  const startRec = async () => {
    if (!(await ensureMicPermission())) {
      setStatus('Microphone permission denied.');
      return;
    }
    setTranscript('');
    setReply('');
    setTiming(null);
    await recorder.current.start();
    setPhase('recording');
  };

  const stopRec = async () => {
    setPhase('thinking');
    const pcm = await recorder.current.stop();
    setMicInfo(MicRecorder.lastDiagnostic);
    if (!pcm || !engines.current) {
      setStatus('No audio captured.');
      setPhase('ready');
      return;
    }
    try {
      const t = await runTurn(engines.current, pcm, player.current, {
        onTranscript: setTranscript,
        onToken: setReply,
      });
      setTiming(t);
    } catch (err: any) {
      setStatus(`Turn failed: ${err?.message ?? err}`);
    } finally {
      setPhase('ready');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Poppys · engine spike</Text>
        <Text style={styles.subtitle}>on-device STT → LLM → TTS, measured</Text>

        {phase === 'need-models' && (
          <View style={styles.card}>
            <Text style={styles.cardHead}>Models not found on device</Text>
            {models.map((m) => (
              <Text key={m.path} style={styles.modelRow}>
                {m.present ? '✅' : '⬜'} {m.label}
              </Text>
            ))}
            <Text style={styles.hint}>
              Push the model files into the app's Documents/models folder, then relaunch.
              See mobile/README.md → "Get the models onto the device".
            </Text>
          </View>
        )}

        {(phase === 'idle' || phase === 'loading') && (
          <TouchableOpacity
            style={[styles.primary, phase === 'loading' && styles.disabled]}
            onPress={load}
            disabled={phase === 'loading'}>
            <Text style={styles.primaryText}>
              {phase === 'loading' ? 'Loading…' : 'Load engines'}
            </Text>
          </TouchableOpacity>
        )}

        {(phase === 'ready' || phase === 'recording' || phase === 'thinking') && (
          <TouchableOpacity
            style={[styles.mic, phase === 'recording' && styles.micActive]}
            onPress={phase === 'recording' ? stopRec : startRec}
            disabled={phase === 'thinking'}>
            <Text style={styles.micText}>
              {phase === 'recording'
                ? 'Stop & reply'
                : phase === 'thinking'
                ? '…'
                : 'Tap to talk'}
            </Text>
          </TouchableOpacity>
        )}

        {!!status && <Text style={styles.status}>{status}</Text>}

        {!!transcript && (
          <View style={styles.card}>
            <Text style={styles.cardHead}>You said</Text>
            <Text style={styles.body}>{transcript}</Text>
            {/* If the transcript is wrong, this line says why. A mismatch here
                means the mic handed over audio at a different rate than it
                reported, which feeds Whisper sped-up audio and produces
                confident nonsense. Shown in-app so it can be read without
                attaching Xcode. */}
            {!!micInfo && <Text style={styles.micInfo}>{micInfo}</Text>}
          </View>
        )}
        {!!reply && (
          <View style={styles.card}>
            <Text style={styles.cardHead}>Poppys</Text>
            <Text style={styles.body}>{reply}</Text>
          </View>
        )}

        {timing && (
          <View style={styles.metrics}>
            <Text style={styles.metricBig}>{(timing.firstAudioMs / 1000).toFixed(2)}s</Text>
            <Text style={styles.metricBigLabel}>mic-stop → first audio</Text>
            <View style={styles.metricGrid}>
              <Metric label="STT" ms={timing.sttMs} />
              <Metric label="LLM 1st token" ms={timing.llmFirstTokenMs} />
              <Metric label="1st clause" ms={timing.firstChunkReadyMs} />
              <Metric label="Full reply" ms={timing.totalMs} />
            </View>
            <Text style={styles.gate}>
              Go/no-go: first-audio under ~1.5s on a recent iPhone = React Native is a go.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, ms }: { label: string; ms: number }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricVal}>{ms < 0 ? '—' : `${(ms / 1000).toFixed(2)}s`}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const POPPY = '#e8552b';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaf1f8' },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '600', color: '#1f2d3d' },
  subtitle: { fontSize: 14, color: '#5b6b7c', marginTop: -8 },
  primary: { backgroundColor: POPPY, padding: 18, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: 'white', fontSize: 18, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  mic: {
    backgroundColor: '#fff8f2',
    borderWidth: 2,
    borderColor: POPPY,
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
  },
  micActive: { backgroundColor: POPPY },
  micText: { fontSize: 18, fontWeight: '600', color: '#1f2d3d' },
  status: { color: '#b23b1e', fontSize: 14 },
  card: { backgroundColor: '#fffdf9', borderRadius: 16, padding: 16, gap: 6 },
  cardHead: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#8a97a6' },
  body: { fontSize: 17, color: '#1f2d3d', lineHeight: 24 },
  modelRow: { fontSize: 16, color: '#1f2d3d' },
  hint: { fontSize: 13, color: '#5b6b7c', marginTop: 8, lineHeight: 19 },
  metrics: { backgroundColor: '#1f2d3d', borderRadius: 20, padding: 24, alignItems: 'center', gap: 4 },
  metricBig: { fontSize: 52, fontWeight: '700', color: 'white' },
  metricBigLabel: { fontSize: 14, color: '#9db0c4' },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
    gap: 12,
  },
  metricCell: { width: '45%', backgroundColor: '#2b3c50', borderRadius: 12, padding: 12 },
  micInfo: { color: '#8a8f98', fontSize: 11, marginTop: 8, fontVariant: ['tabular-nums'] },
  metricVal: { fontSize: 22, fontWeight: '600', color: 'white' },
  metricLabel: { fontSize: 12, color: '#9db0c4' },
  gate: { fontSize: 12, color: '#9db0c4', marginTop: 16, textAlign: 'center', lineHeight: 17 },
});
