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

// Female + male avatars, vendored locally in frontend/avatar/ (same-origin =
// no CORS, works offline). Of the bundled files only avatarsdk.glb is male
// (brunette/avaturn/mpfb are all female). avatarsdk's rig rests with the head
// tilted down; we lift it back with a negative headRotateX baseline (see below).
// Ready Player Me shut down 2026-01-31; for a nicer male, make one at Avaturn
// (https://avaturn.me), download the .glb (ARKit + Oculus visemes), drop it in
// here, and pass ?avatarMale=avatar/<file>.glb.
// Override per load with ?avatarFemale=<url> / ?avatarMale=<url> / ?avatar=<url>.
const AVATARS = {
  female: (params.get("avatarFemale") || "").trim() || "avatar/brunette.glb",
  male:   (params.get("avatarMale")   || "").trim() || "avatar/avatarsdk.glb",
};
const override = (params.get("avatar") || "").trim();
if (override) { AVATARS.female = AVATARS.male = override; }

// Force a gender for testing (?gender=male|female); otherwise it follows the
// detected speaker gender.
const forcedGender = (params.get("gender") || "").trim().toLowerCase();

// The male avatarsdk.glb rests with its head tilted down. In TalkingHead a
// POSITIVE headRotateX nods the head DOWN, so we lift it with a NEGATIVE baseline.
// -0.40 was dialled in live as the value that faces avatarsdk forward; override
// per load with ?headTilt=<radians> if a different male avatar needs another value.
const MALE_HEAD_TILT = -0.40;
const headTilt = params.has("headTilt") ? parseFloat(params.get("headTilt")) : null;
function baselineFor(g) {
  const t = headTilt != null ? headTilt : (g === "male" ? MALE_HEAD_TILT : 0);
  return Number.isFinite(t) && t ? { headRotateX: t } : {};
}

const bridge = window.companionAvatar;
let head = null;
let headaudio = null;
let wiring = false;
let currentGender = "female";

async function showFor(gender) {
  const g = gender === "male" ? "male" : "female";
  await head.showAvatar({
    url: AVATARS[g], body: g === "male" ? "M" : "F",
    avatarMood: "neutral", lipsyncLang: "en",
    baseline: baselineFor(g),
  });
  currentGender = g;
  head.lookAhead?.(2000);   // settle into a forward-facing pose
}

// Switch the avatar to match the detected speaker gender. Falls back to the
// current avatar if the target GLB isn't available (e.g. no male.glb yet).
async function switchGender(gender) {
  if (forcedGender) return; // a ?gender= override pins the avatar
  const g = gender === "male" ? "male" : "female";
  if (!head || g === currentGender) return;
  try {
    await showFor(g);
    if (headaudio) head.opt.update = headaudio.update.bind(headaudio);
    console.info("[avatar3d] switched to", g, "avatar");
  } catch (e) {
    console.warn(`[avatar3d] no ${g} avatar at ${AVATARS[g]} — keeping ${currentGender}.`, e);
  }
}

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
    const want = forcedGender || (bridge._gender === "male" ? "male" : "female");
    try {
      await showFor(want);
    } catch (e) {
      // Initial avatar missing (e.g. male-rpm.glb not added yet) — don't leave a
      // blank stage; fall back to the female so the app still shows someone.
      if (want === "male") {
        console.warn(`[avatar3d] male avatar at ${AVATARS.male} unavailable — falling back to female.`, e);
        await showFor("female");
      } else throw e;
    }
    console.info("[avatar3d] avatar ready");
  } catch (e) {
    console.error("[avatar3d] failed to load avatar (needs internet for the CDN):", e);
    return;
  }

  // wire audio → visemes now (or whenever chat.js provides the analyser)
  bridge._onAnalyser = wireHeadAudio;
  if (bridge._analyser) wireHeadAudio(bridge._analyser);

  // follow the detected speaker gender (male/female avatar)
  bridge._onIdentity = (_accent, gender) => switchGender(gender);
  if (bridge._gender) switchGender(bridge._gender);
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
