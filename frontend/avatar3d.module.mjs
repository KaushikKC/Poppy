// 3D avatar controller — renders a TalkingHead avatar full-page and drives its
// lips in real time from the assistant's Kokoro voice via HeadAudio.
//
// Pipeline (no backend change): the existing AudioPlayer plays the streamed WAV
// through an AnalyserNode; chat.js hands that node to window.companionAvatar,
// we tap it into HeadAudio, which emits 15 Oculus visemes that drive the
// avatar's morph targets each frame.
//
// NOTE: this currently loads Three.js / TalkingHead / HeadAudio + the avatar GLB
// from a CDN, so the app needs internet for the avatar. Vendoring these locally
// (to keep the app fully offline) is the planned next step.

import { TalkingHead } from "talkinghead";

const params = new URLSearchParams(location.search);
const HEADAUDIO_BASE = "https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@main";
const DEFAULT_AVATAR =
  "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.5/avatars/brunette.glb";
// Ready Player Me shut down; default to TalkingHead's bundled avatar.
// Override per-load with ?avatar=<glb-url>.
const AVATAR_URL = (params.get("avatar") || "").trim() || DEFAULT_AVATAR;

const bridge = window.companionAvatar;
let head = null;
let headaudio = null;
let wiring = false;

async function init() {
  const container = document.getElementById("avatar3d");
  if (!container || !bridge) return;

  try {
    head = new TalkingHead(container, {
      // we never use TalkingHead's own TTS (lips come from HeadAudio), but the
      // constructor requires an endpoint — give it a dummy so it initializes.
      ttsEndpoint: "/no-tts",
      lipsyncModules: ["en"],
      cameraView: "upper",
      avatarMood: "neutral",
      modelPixelRatio: Math.min(window.devicePixelRatio, 2),
    });
    await head.showAvatar({
      url: AVATAR_URL, body: "F", avatarMood: "neutral", lipsyncLang: "en",
    });
    console.info("[avatar3d] avatar ready");
  } catch (e) {
    console.error("[avatar3d] failed to load avatar (needs internet for the CDN):", e);
    return;
  }

  // wire audio → visemes now (or whenever chat.js provides the analyser)
  bridge._onAnalyser = wireHeadAudio;
  if (bridge._analyser) wireHeadAudio(bridge._analyser);
}

async function wireHeadAudio(analyser) {
  if (headaudio || wiring || !analyser || !head) return;
  wiring = true;
  try {
    const ctx = analyser.context;
    const { HeadAudio } = await import(`${HEADAUDIO_BASE}/modules/headaudio.mjs`);
    await ctx.audioWorklet.addModule(`${HEADAUDIO_BASE}/modules/headworklet.mjs`);

    const ha = new HeadAudio(ctx, {
      parameterData: { vadGateActiveDb: -45, vadGateInactiveDb: -65 },
    });
    await ha.loadModel(`${HEADAUDIO_BASE}/dist/model-en-mixed.bin`);

    ha.onvalue = (key, value) => {
      const slot = head.mtAvatar?.[key];
      if (slot) Object.assign(slot, { newvalue: value, needsUpdate: true });
    };

    analyser.connect(ha);                 // tap the playing voice
    head.opt.update = ha.update.bind(ha); // tick HeadAudio in TalkingHead's loop
    headaudio = ha;
    console.info("[avatar3d] HeadAudio wired — lips follow the voice");
  } catch (e) {
    console.error("[avatar3d] HeadAudio wiring failed:", e);
    wiring = false; // allow a later retry if the analyser comes again
  }
}

init();
