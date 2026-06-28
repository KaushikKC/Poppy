"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useFlowerField } from "@/lib/useFlowerField";

type Tone = "calm" | "bright" | "deep";
type PrivacyMode = "local" | "erase" | "quiet";

const MODE_NOTES: Record<Tone, { title: string; copy: string }> = {
  calm: { title: "Calm", copy: "Slow support, softer replies, and fewer prompts." },
  bright: {
    title: "Bright",
    copy: "Lighter language, quicker nudges, and more momentum.",
  },
  deep: {
    title: "Deep",
    copy: "More reflective questions with room for heavier thoughts.",
  },
};

const PRIVACY_NOTES: Record<PrivacyMode, string> = {
  local: "Memory stays on this device.",
  erase: "One tap clears the last check-in.",
  quiet: "Muted until you invite Poppys in.",
};

const CHECKIN_NOTES = [
  "Take one breath. Name the feeling. Pick the smallest next step.",
  "Poppys would ask softly: what do you need in the next ten minutes?",
  "Saved for this moment only: gentle tone, no pressure, one doable action.",
];

const DEFAULT_CHECKIN_NOTE = "Poppys will keep it soft, private, and practical.";

const MODE_METER_LEVELS = ["42%", "68%", "50%", "76%", "58%"];

const TONE_OPTIONS: { key: Tone; num: string; title: string; sub: string }[] = [
  { key: "calm", num: "01 Calm", title: "slow support", sub: "gentle check-ins" },
  { key: "bright", num: "02 Bright", title: "quick lift", sub: "energy and momentum" },
  { key: "deep", num: "03 Deep", title: "reflective care", sub: "space for heavier thoughts" },
];

const PRIVACY_OPTIONS: { key: PrivacyMode; label: string }[] = [
  { key: "local", label: "Local" },
  { key: "erase", label: "Erase" },
  { key: "quiet", label: "Quiet" },
];

const LOCAL_LIST = [
  "Local-first memory",
  "Clear delete controls",
  "Muted by default",
  "No public profile",
];

const PRIVACY_FLOW: [string, string][] = [
  ["01", "Local memory"],
  ["02", "Visible controls"],
  ["03", "Soft presence"],
];

const MOTION_CARDS: { num: string; title: string; body: string; bg: string }[] = [
  {
    num: "01",
    title: "Talk naturally",
    body: "Open a quick voice check-in, type a thought, or let Poppys help you name what you are feeling.",
    bg: "bg-[var(--night)]",
  },
  {
    num: "02",
    title: "Remember gently",
    body: "Keep the useful context: routines, preferences, small promises, and the tone you like.",
    bg: "bg-[var(--poppy)]",
  },
  {
    num: "03",
    title: "Nudge kindly",
    body: "Get soft reminders for water, walks, medicine, calls, journaling, or whatever keeps you steady.",
    bg: "bg-[var(--leaf)]",
  },
];

// Shared utility recipes (kept inline-Tailwind, just DRY).
const SECTION =
  "relative z-[2] mx-auto w-[min(1200px,calc(100%_-_32px))] snap-start [scroll-snap-stop:always] max-[620px]:w-[min(100%_-_24px,1200px)]";
const EYEBROW = "m-0 mb-[14px] font-mono text-[0.74rem] font-extrabold uppercase";
const BTN_BASE =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[8px] px-[18px] font-extrabold transition-[transform,background,color,border-color] duration-200 hover:-translate-y-[2px]";
const PRIMARY = `${BTN_BASE} bg-[var(--poppy)] text-[color:var(--cream)] shadow-[0_16px_36px_rgba(152,16,26,0.26)]`;
const SECONDARY = `${BTN_BASE} border border-[rgba(255,248,234,0.72)] bg-[var(--cream)] text-[color:var(--leaf)] hover:border-[var(--cream)]`;

export default function Home() {
  const [tone, setTone] = useState<Tone>("calm");
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>("local");
  const [checkinNoteIndex, setCheckinNoteIndex] = useState(-1);
  const [isBlooming, setIsBlooming] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const heroReelRef = useRef<HTMLDivElement>(null);

  const { triggerBloom } = useFlowerField({
    canvasRef,
    scrollerRef: mainRef,
    heroContentRef,
    heroReelRef,
  });

  useEffect(() => {
    document.body.dataset.tone = tone;
  }, [tone]);

  useEffect(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    videos.forEach((video) => {
      video.muted = true;
      video.playsInline = true;
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    });
  }, []);

  function handleToneClick(next: Tone) {
    setTone(next);
    triggerBloom(1);
  }

  function handlePrivacyClick(next: PrivacyMode) {
    setPrivacyMode(next);
    triggerBloom(0.8);
  }

  function handleBloomButtonClick() {
    setIsBlooming(true);
    triggerBloom(1);
    window.setTimeout(() => setIsBlooming(false), 900);
  }

  function handleCheckinClick() {
    setCheckinNoteIndex((index) => index + 1);
    triggerBloom(1);
  }

  const modeNote = MODE_NOTES[tone];
  const checkinNote =
    checkinNoteIndex < 0
      ? DEFAULT_CHECKIN_NOTE
      : CHECKIN_NOTES[checkinNoteIndex % CHECKIN_NOTES.length];

  return (
    <>
      <canvas
        id="flower-scroll-canvas"
        aria-hidden="true"
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0 h-screen w-screen bg-[var(--sky)] opacity-[0.89] [filter:saturate(0.86)_brightness(1.03)]"
      />

      <header className="fixed left-1/2 top-[18px] z-30 flex w-[min(1200px,calc(100%_-_32px))] -translate-x-1/2 items-center justify-between gap-[18px] rounded-[8px] border border-[rgba(255,248,234,0.35)] bg-[rgba(255,248,234,0.86)] pb-[10px] pl-[14px] pr-[10px] pt-[10px] shadow-[0_18px_60px_rgba(5,7,6,0.14)] backdrop-blur-[18px] max-[620px]:top-[10px] max-[620px]:w-[calc(100%_-_20px)] max-[620px]:gap-[8px] max-[620px]:p-[8px]">
        <a
          href="#top"
          aria-label="Poppys home"
          className="inline-flex min-w-0 items-center gap-[10px] font-display text-[1.8rem] leading-none text-[color:var(--leaf)] max-[620px]:gap-[7px] max-[620px]:text-[1.28rem]"
        >
          <span
            aria-hidden="true"
            className="relative block h-[48px] w-[48px] flex-[0_0_auto] overflow-hidden rounded-full border border-[rgba(20,60,22,0.18)] bg-[var(--cream)] max-[620px]:h-[38px] max-[620px]:w-[38px]"
          >
            <Image
              src="/poppys-ai-logo-transparent-cropped.png"
              alt=""
              fill
              sizes="48px"
              style={{ transform: isBlooming ? "rotate(135deg) scale(1.08)" : undefined }}
              className="rounded-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            />
          </span>
          <span>Poppys</span>
        </a>
        <nav
          aria-label="Primary"
          className="flex items-center gap-[4px] rounded-[8px] bg-[rgba(255,248,234,0.48)] p-[4px]"
        >
          {[
            ["#companion", "Companion"],
            ["#modes", "Modes"],
            ["#privacy", "Privacy"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-[36px] items-center rounded-[7px] px-[13px] py-[9px] text-[0.86rem] font-extrabold leading-none text-[color:rgba(7,18,7,0.76)] hover:bg-[var(--leaf)] hover:text-[color:var(--cream)] max-[620px]:min-h-[32px] max-[620px]:px-[5px] max-[620px]:py-[8px] max-[620px]:text-[0.68rem]"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main
        id="top"
        ref={mainRef}
        className="relative z-[1] h-[100svh] snap-y snap-mandatory overflow-x-hidden overflow-y-auto scroll-smooth [scrollbar-gutter:stable]"
      >
        {/* HERO */}
        <section
          id="companion"
          className="relative isolate h-[100svh] min-h-[620px] snap-start overflow-hidden bg-[var(--night)] text-[color:var(--cream)] [scroll-snap-stop:always]"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[1] overflow-hidden bg-[var(--sky)]"
          >
            <video
              id="hero-video"
              src="/assets/poppys-hero-character.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="absolute inset-[-2%] h-[104%] w-[104%] max-w-none object-cover object-center [filter:saturate(1.12)_contrast(1.04)]"
            />
            <div className="absolute inset-0 z-[2] mix-blend-multiply [background:linear-gradient(90deg,rgba(120,201,246,0.52),rgba(20,60,22,0.04)_48%,rgba(120,201,246,0.24)),linear-gradient(180deg,rgba(5,7,6,0.04),rgba(5,7,6,0.06)_54%,rgba(5,7,6,0.62))] max-[620px]:[background:linear-gradient(90deg,rgba(120,201,246,0.68),rgba(20,60,22,0.04)),linear-gradient(180deg,rgba(5,7,6,0.06),rgba(5,7,6,0.16)_48%,rgba(5,7,6,0.82))]" />
            <div className="pointer-events-none absolute inset-0 z-[3] opacity-[0.36] [background-image:linear-gradient(rgba(255,248,234,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,248,234,0.05)_1px,transparent_1px)] [background-size:42px_42px]" />
            <Image
              src="/poppys-ai-logo-transparent-cropped.png"
              alt=""
              aria-hidden="true"
              width={846}
              height={998}
              sizes="168px"
              className="pointer-events-none absolute bottom-[-30px] right-0 z-[9] block h-auto w-[168px] object-contain [filter:drop-shadow(0_18px_34px_rgba(5,7,6,0.28))] max-[980px]:bottom-[-24px] max-[980px]:w-[148px] max-[620px]:bottom-0 max-[620px]:right-[4px] max-[620px]:z-[4] max-[620px]:w-[104px]"
            />
            <div
              ref={heroReelRef}
              className="absolute right-[max(24px,calc((100vw_-_1200px)_/_2))] top-[118px] z-[5] aspect-[4/5] w-[min(280px,24vw)] overflow-hidden rounded-[8px] border border-[rgba(255,248,234,0.38)] bg-[var(--night)] shadow-[0_32px_90px_rgba(5,7,6,0.36)] [transform:translate3d(0,var(--reel-y,0px),0)] max-[980px]:w-[190px] max-[980px]:opacity-[0.86] max-[620px]:hidden"
            >
              <video
                src="/assets/poppys-signal-character.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="h-full w-full object-cover object-center [filter:saturate(1.16)_contrast(1.08)]"
              />
            </div>
          </div>

          <div
            ref={heroContentRef}
            className="absolute bottom-[clamp(28px,5vh,52px)] left-[max(24px,calc((100vw_-_1200px)_/_2))] right-[24px] top-[calc(var(--header-space)+16px)] z-[5] grid max-w-[1120px] content-end justify-items-start [text-shadow:0_14px_48px_rgba(5,7,6,0.42)] [transform:translate3d(0,var(--hero-y,0px),0)] max-[620px]:bottom-[32px] max-[620px]:left-[16px] max-[620px]:right-[16px] max-[620px]:top-[calc(var(--header-space)+12px)]"
          >
            {/* <div
              aria-hidden="true"
              className="mb-[12px] inline-grid grid-cols-[repeat(3,auto)] border-2 border-[var(--cream)] font-mono text-[1.05rem] font-extrabold uppercase leading-none text-[color:var(--cream)] max-[620px]:mb-[10px] max-[620px]:text-[0.82rem]"
            >
              {["POP", "PYS", "AI"].map((seg) => (
                <span
                  key={seg}
                  className="border-r-2 border-[var(--cream)] px-[12px] py-[10px] last:border-r-0 max-[620px]:px-[9px] max-[620px]:py-[8px]"
                >
                  {seg}
                </span>
              ))}
            </div> */}
            {/* <p className={EYEBROW}>Private companion, character-first</p> */}
            <h1 className="m-0 max-w-[11ch] font-display text-[clamp(4.2rem,10.6vw,11.4rem)] font-normal leading-[0.82] text-[color:var(--cream)] max-[620px]:text-[clamp(3.5rem,18vw,5rem)]">
              Poppys
              <br />
              <span className="text-[color:var(--poppy)]">your bloom companion</span>
            </h1>
            <p className="mt-[16px] w-[min(650px,100%)] text-[clamp(1rem,1.6vw,1.24rem)] leading-[1.58] text-[color:rgba(255,248,234,0.9)] max-[620px]:w-[min(330px,100%)] max-[620px]:text-[0.98rem]">
              A calm AI companion for daily check-ins, gentle reminders, voice notes, and
              small moments of emotional steadiness.
            </p>
            <div className="mt-[22px] flex flex-wrap gap-[10px]">
              <a className={PRIMARY} href="#modes">
                Choose a mode
              </a>
              <button className={SECONDARY} type="button" onClick={handleBloomButtonClick}>
                Bloom the mark
              </button>
            </div>
          </div>
        </section>

        {/* PROMISE */}
        <section
          id="promise"
          className={`${SECTION} grid h-[100svh] min-h-[620px] grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)] items-center gap-[34px] py-[var(--section-pad)] max-[980px]:grid-cols-1 max-[620px]:pb-[64px] max-[620px]:pt-[88px]`}
        >
          <div>
            <p className={EYEBROW}>What Poppys does</p>
            <h2 className="m-0 font-display text-[clamp(2.6rem,5.6vw,5.8rem)] font-normal leading-[0.95] text-[color:var(--leaf)] max-[620px]:text-[2.46rem]">
              A companion that listens first, remembers softly, and responds with care.
            </h2>
          </div>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[8px] max-[980px]:grid-cols-1">
            {MOTION_CARDS.map((card) => (
              <article
                key={card.num}
                className={`flex min-h-[220px] flex-col rounded-[8px] p-[16px] ${card.bg} text-[color:var(--cream)] shadow-[0_24px_80px_rgba(5,7,6,0.14)] max-[980px]:min-h-[148px]`}
              >
                <span className="font-mono text-[0.82rem] font-extrabold">{card.num}</span>
                <div className="mt-auto">
                  <h3 className="mb-[20px] font-display text-[2.1rem] font-normal leading-[0.95]">
                    {card.title}
                  </h3>
                  <p className="m-0 text-[0.94rem] leading-[1.5] text-[color:rgba(255,248,234,0.82)]">
                    {card.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* SIGNAL */}
        <section
          id="signal"
          className={`${SECTION} grid h-[100svh] min-h-[620px] grid-cols-[minmax(320px,0.9fr)_minmax(0,0.82fr)] items-center gap-[38px] py-[var(--section-pad)] max-[980px]:grid-cols-1 max-[620px]:pb-[64px] max-[620px]:pt-[88px]`}
        >
          <div className="relative h-[min(58svh,560px)] min-h-[360px] overflow-hidden rounded-[8px] bg-[var(--night)] shadow-[0_28px_96px_rgba(5,7,6,0.2)] max-[620px]:min-h-[430px]">
            <video
              src="/assets/poppys-signal-character.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              className="h-full w-full object-cover object-center [filter:saturate(1.12)_contrast(1.08)] max-[620px]:min-h-[430px]"
            />
            <div className="pointer-events-none absolute inset-0 [background:linear-gradient(90deg,rgba(120,201,246,0.26),transparent_42%,rgba(233,40,50,0.18)),linear-gradient(180deg,transparent_42%,rgba(5,7,6,0.58))]" />
            <div className="absolute bottom-[18px] left-[18px] right-[18px] z-[9] grid max-w-[360px] gap-[5px] text-[color:var(--cream)] max-[620px]:bottom-[14px] max-[620px]:left-[14px] max-[620px]:right-[140px]">
              <span className="font-mono text-[0.75rem] font-extrabold uppercase">
                Responsive presence
              </span>
              <strong className="font-display text-[clamp(2.2rem,4vw,4.2rem)] font-normal leading-[0.92] max-[620px]:text-[2rem]">
                Face, voice, rhythm
              </strong>
            </div>
          </div>
          <div>
            <p className={EYEBROW}>How it feels</p>
            <h2 className="font-display font-bold text-[24px] text-[color:rgba(7,18,7,0.76)]">
              Not a dashboard. Not a chatbot box. A small presence that meets you where you
              are.
            </h2>
            <p className="mt-[20px] w-[min(520px,100%)] text-[1rem] leading-[1.72] text-[color:rgba(7,18,7,0.72)] font-semibold">
              The interface uses voice, expression, color, and motion to make check-ins
              feel light, not clinical.
            </p>
          </div>
        </section>

        {/* MODES */}
        <section
          id="modes"
          className={`${SECTION} grid h-[100svh] min-h-[620px] grid-cols-[minmax(340px,0.84fr)_minmax(0,1.16fr)] items-center gap-[clamp(2rem,5vw,5.5rem)] pb-[clamp(1.5rem,4vh,2.75rem)] pt-[clamp(5.2rem,10vh,6.4rem)] max-[980px]:grid-cols-1 max-[980px]:content-center max-[980px]:gap-[18px] max-[620px]:content-start max-[620px]:gap-[12px] max-[620px]:pb-[64px] max-[620px]:pt-[88px]`}
        >
          <div
            aria-hidden="true"
            className="grid content-center gap-[12px] self-center max-[980px]:order-2 max-[980px]:self-auto"
          >
            <div className="relative isolate min-h-[min(52svh,460px)] overflow-hidden rounded-[8px] border border-[rgba(255,248,234,0.42)] bg-[var(--night)] shadow-[0_30px_90px_rgba(5,7,6,0.22)] max-[980px]:min-h-[260px] max-[620px]:min-h-[126px]">
              <video
                src="/assets/poppys-signal-character.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 z-[1] h-full w-full object-cover object-center [filter:saturate(1.12)_contrast(1.08)] max-[620px]:hidden"
              />
              <div className="pointer-events-none absolute inset-0 z-[2] [background:linear-gradient(180deg,rgba(5,7,6,0.08),rgba(5,7,6,0.68)),radial-gradient(circle_at_68%_26%,rgba(120,201,246,0.36),transparent_30%),radial-gradient(circle_at_26%_72%,rgba(233,40,50,0.34),transparent_28%)] max-[620px]:[background:linear-gradient(90deg,rgba(7,18,7,0.9),rgba(20,60,22,0.82)),radial-gradient(circle_at_82%_50%,rgba(120,201,246,0.5),transparent_34%),radial-gradient(circle_at_18%_82%,rgba(233,40,50,0.32),transparent_36%)]" />
              <div className="pointer-events-none absolute inset-0 z-[3] opacity-50 mix-blend-overlay [background-image:linear-gradient(rgba(255,248,234,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,248,234,0.08)_1px,transparent_1px)] [background-size:34px_34px] max-[620px]:[background-size:24px_24px]" />
              {/* <div className="absolute right-[10%] top-[14%] z-[4] aspect-square w-[min(190px,44%)] animate-mode-drift rounded-full border border-[rgba(255,248,234,0.36)] max-[620px]:hidden">
                <div className="absolute inset-[20%] rounded-[inherit] border border-[rgba(120,201,246,0.36)]" />
                <div className="absolute inset-[38%] rounded-[inherit] border border-[rgba(120,201,246,0.36)]" />
                <span className="absolute left-[calc(50%_-_7px)] top-[-7px] h-[14px] w-[14px] rounded-full bg-[var(--poppy)] shadow-[0_0_0_8px_rgba(233,40,50,0.16)]" />
                <span className="absolute bottom-[22%] right-[4%] h-[14px] w-[14px] rounded-full bg-[var(--sky)] shadow-[0_0_0_8px_rgba(233,40,50,0.16)]" />
                <span className="absolute bottom-[14%] left-[12%] h-[14px] w-[14px] rounded-full bg-[var(--cream)] shadow-[0_0_0_8px_rgba(233,40,50,0.16)]" />
              </div> */}
              {/* <div className="absolute left-1/2 top-1/2 z-[5] grid aspect-square w-[clamp(92px,10vw,128px)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[rgba(255,248,234,0.48)] bg-[rgba(255,248,234,0.9)] shadow-[0_24px_60px_rgba(5,7,6,0.32),0_0_0_18px_rgba(255,248,234,0.08)] max-[620px]:left-auto max-[620px]:right-[14px] max-[620px]:w-[62px] max-[620px]:translate-x-0">
                <img
                  src="/poppys-ai-logo-transparent-cropped.png"
                  alt=""
                  className="h-[86%] w-[86%] rounded-full object-cover"
                />
              </div> */}
              <div className="absolute bottom-[18px] left-[18px] right-[18px] z-[6] grid gap-[6px] text-[color:var(--cream)] max-[620px]:bottom-[14px] max-[620px]:right-[92px]">
                <span className="font-mono text-[0.72rem] font-extrabold uppercase text-[color:rgba(255,248,234,0.72)]">
                  Now tuned to
                </span>
                <strong className="font-display text-[clamp(2.6rem,5vw,4.4rem)] font-normal leading-[0.9] max-[620px]:text-[2rem]">
                  {modeNote.title}
                </strong>
                <p className="m-0 max-w-[360px] text-[0.94rem] font-bold leading-[1.42] text-[color:rgba(255,248,234,0.82)] max-[620px]:text-[0.78rem] max-[620px]:leading-[1.28]">
                  {modeNote.copy}
                </p>
              </div>
            </div>
            {/* <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-[8px] max-[980px]:hidden">
              {MODE_METER_LEVELS.map((level, index) => (
                <div
                  key={index}
                  className="relative min-h-[72px] overflow-hidden rounded-[8px] border border-[rgba(20,60,22,0.16)] bg-[rgba(255,248,234,0.54)]"
                >
                  <div
                    style={{ height: level }}
                    className="absolute inset-x-0 bottom-0 [background:linear-gradient(180deg,var(--sky),var(--poppy))]"
                  />
                </div>
              ))}
            </div> */}
          </div>

          <div className="grid min-w-0 content-center gap-[clamp(0.8rem,1.6vh,1.15rem)] self-center max-[980px]:order-1 max-[620px]:gap-[10px]">
            <p className={EYEBROW}>Companion modes</p>
            <h2 className="m-0 max-w-[11.5ch] font-display text-[clamp(3.15rem,5.7vw,5.8rem)] font-normal leading-[0.88] text-[color:var(--leaf)] max-[620px]:max-w-full max-[620px]:text-[clamp(2.65rem,13vw,3.65rem)] max-[620px]:leading-[0.9]">
              Choose the presence you need now.
            </h2>
            <p className="m-0 w-[min(560px,100%)] text-[1rem] font-semibold leading-[1.62] text-[color:rgba(7,18,7,0.66)] max-[620px]:text-[0.84rem] max-[620px]:leading-[1.42]">
              Each mode changes the pace, voice, and amount of guidance, so Poppys can stay
              quiet, brighten the room, or go deeper with you.
            </p>
            <div
              className="mx-auto grid w-full max-w-[920px] grid-cols-3 gap-[14px] max-[620px]:max-w-[560px] max-[620px]:grid-cols-1 max-[620px]:gap-[10px]"
              aria-label="Tone controls"
            >
              {TONE_OPTIONS.map((opt) => {
                const active = tone === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleToneClick(opt.key)}
                    className={`group relative flex min-h-[124px] cursor-pointer flex-col items-start gap-[6px] overflow-hidden rounded-[8px] border px-[16px] py-[14px] text-left max-[620px]:min-h-[56px] max-[620px]:grid max-[620px]:grid-cols-[minmax(0,1fr)_auto] max-[620px]:content-center max-[620px]:items-center max-[620px]:gap-x-[10px] max-[620px]:gap-y-[2px] max-[620px]:px-[12px] max-[620px]:py-[9px] ${
                      active
                        ? "border-[rgba(233,40,50,0.45)] bg-[var(--poppy)] text-[color:var(--cream)]"
                        : "border-[color:var(--line)] bg-[rgba(255,248,234,0.72)] text-[color:var(--leaf)] hover:border-[rgba(233,40,50,0.45)] hover:bg-[var(--poppy)] hover:text-[color:var(--cream)]"
                    }`}
                  >
                    <span className="font-mono text-[0.64rem] font-extrabold uppercase max-[620px]:col-start-1 max-[620px]:text-[0.64rem]">
                      {opt.num}
                    </span>
                    <strong className="font-display max-w-none text-[clamp(1.02rem,1.45vw,1.28rem)] leading-[1.05] max-[620px]:col-start-1 max-[620px]:text-[1.18rem] max-[620px]:leading-none">
                      {opt.title}
                    </strong>
                    <small
                      className={`mt-[4px] text-[0.76rem] font-extrabold leading-[1.2] max-[620px]:col-start-1 max-[620px]:mt-0 max-[620px]:text-[0.72rem] ${
                        active
                          ? "text-[color:rgba(255,248,234,0.78)]"
                          : "text-[color:rgba(7,18,7,0.58)] group-hover:text-[color:rgba(255,248,234,0.78)]"
                      }`}
                    >
                      {opt.sub}
                    </small>
                    <span
                      className={`absolute right-[14px] top-[14px] h-[14px] w-[14px] rounded-full border border-current opacity-[0.62] max-[620px]:static max-[620px]:col-start-2 max-[620px]:h-[16px] max-[620px]:w-[16px] max-[620px]:self-center max-[620px]:[grid-row:1/-1] ${
                        active
                          ? "bg-[var(--cream)] shadow-[0_0_0_7px_rgba(255,248,234,0.18)]"
                          : "group-hover:bg-[var(--cream)] group-hover:shadow-[0_0_0_7px_rgba(255,248,234,0.18)]"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* TYPE BREAK */}
        <section
          className={`${SECTION} grid h-[100svh] min-h-[620px] items-center py-[var(--section-pad)] max-[620px]:py-[76px]`}
        >
          <p className="m-0 font-display text-[clamp(3.4rem,9vw,10rem)] leading-[0.9] text-[color:var(--leaf)] max-[620px]:text-[3.45rem]">
            A face when you need presence. A voice when you need words. A memory that stays
            close.
          </p>
        </section>

        {/* PRIVACY */}
        <section
          id="privacy"
          className={`${SECTION} grid h-[100svh] min-h-[620px] grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)] items-center gap-[clamp(1.5rem,3.7vw,4.25rem)] rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] p-[clamp(1.5rem,3.4vw,3.2rem)] shadow-[0_24px_80px_rgba(7,18,7,0.1)] backdrop-blur-[18px] max-[980px]:grid-cols-1 max-[620px]:content-start max-[620px]:gap-[10px] max-[620px]:px-[18px] max-[620px]:pb-[18px] max-[620px]:pt-[calc(var(--header-space)_+_14px)]`}
        >
          <div className="flex min-h-0 flex-col justify-center gap-[clamp(0.75rem,1.8vh,1.35rem)] self-stretch max-[980px]:gap-[28px] max-[620px]:order-2 max-[620px]:gap-0">
            <p className={`${EYEBROW} max-[620px]:hidden`}>Private by design</p>
            <div
              aria-label="Privacy control preview"
              className="relative isolate h-[clamp(240px,34vh,330px)] min-h-0 overflow-hidden rounded-[8px] border border-[color:var(--line)] text-[color:var(--cream)] shadow-[0_22px_70px_rgba(7,18,7,0.18)] [background:radial-gradient(circle_at_76%_14%,rgba(120,201,246,0.62),transparent_27%),radial-gradient(circle_at_22%_70%,rgba(233,40,50,0.22),transparent_30%),linear-gradient(135deg,rgba(20,60,22,0.96),rgba(7,18,7,0.92))] max-[620px]:h-[108px] max-[620px]:flex-[0_0_auto]"
            >
              {/* <div className="pointer-events-none absolute inset-0 z-[1] [background:linear-gradient(rgba(255,248,234,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,248,234,0.1)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.86),rgba(0,0,0,0.18))]" /> */}
              {/* <div className="pointer-events-none absolute inset-0 z-[2] [background:linear-gradient(180deg,transparent,rgba(7,18,7,0.36)),radial-gradient(circle_at_50%_50%,transparent_0_34%,rgba(255,248,234,0.16)_35%,transparent_36%_100%)]" /> */}
              {/* <div
                aria-hidden="true"
                className="absolute left-1/2 top-[42%] z-[3] aspect-square w-[min(230px,68%)] -translate-x-1/2 -translate-y-1/2 animate-privacy-spin rounded-full border border-[rgba(255,248,234,0.28)] max-[620px]:hidden"
              >
                <div className="absolute inset-[18%] rounded-[inherit] border border-[rgba(120,201,246,0.3)]" />
                <div className="absolute inset-[34%] rounded-[inherit] border border-[rgba(120,201,246,0.3)]" />
                <span className="absolute left-[calc(50%_-_9px)] top-[-9px] h-[18px] w-[18px] rounded-full bg-[var(--poppy)] shadow-[0_0_0_8px_rgba(233,40,50,0.18)]" />
                <span className="absolute bottom-[18%] right-[8%] h-[18px] w-[18px] rounded-full bg-[var(--sky)] shadow-[0_0_0_8px_rgba(120,201,246,0.18)]" />
                <span className="absolute bottom-[12%] left-[10%] h-[18px] w-[18px] rounded-full bg-[var(--poppy)] shadow-[0_0_0_8px_rgba(233,40,50,0.18)]" />
              </div> */}
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-[42%] z-[4] h-[clamp(76px,8vw,96px)] w-[clamp(76px,8vw,96px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,248,234,0.42)] shadow-[0_22px_50px_rgba(5,7,6,0.3),0_0_0_14px_rgba(255,248,234,0.06)] [background:radial-gradient(circle_at_50%_50%,var(--cream)_0_11%,var(--poppy)_12%_25%,var(--sky)_26%_54%,rgba(255,248,234,0.2)_55%_56%,rgba(20,60,22,0.78)_57%_100%)] max-[620px]:left-auto max-[620px]:right-[14px] max-[620px]:top-1/2 max-[620px]:h-[54px] max-[620px]:w-[54px] mt-[-20px]"
              >
                <span className="absolute left-1/2 top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--leaf)] shadow-[0_-16px_0_5px_var(--poppy),16px_0_0_5px_var(--poppy),0_16px_0_5px_var(--poppy),-16px_0_0_5px_var(--poppy)] max-[620px]:h-[8px] max-[620px]:w-[8px] max-[620px]:shadow-[0_-10px_0_4px_var(--poppy),10px_0_0_4px_var(--poppy),0_10px_0_4px_var(--poppy),-10px_0_0_4px_var(--poppy)]" />
              </div>
              <div className="absolute bottom-[64px] left-[16px] right-[16px] z-[5] grid gap-[3px] max-[620px]:bottom-[46px] max-[620px]:left-[12px] max-[620px]:right-[84px]">
                <span className="font-mono text-[0.68rem] font-extrabold uppercase text-[color:rgba(255,248,234,0.68)]">
                  Local mode
                </span>
                <strong className="text-[clamp(1.05rem,1.8vw,1.34rem)] leading-[1.1] text-[color:var(--cream)] max-[620px]:text-[0.86rem]">
                  {PRIVACY_NOTES[privacyMode]}
                </strong>
              </div>
              <div
                aria-label="Privacy modes"
                className="absolute bottom-[12px] left-[12px] right-[12px] z-[5] grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[8px] max-[620px]:bottom-[10px] max-[620px]:left-[10px] max-[620px]:right-[84px] max-[620px]:gap-[6px]"
              >
                {PRIVACY_OPTIONS.map((opt) => {
                  const active = privacyMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handlePrivacyClick(opt.key)}
                      className={`min-h-[42px] cursor-pointer rounded-[8px] border font-mono text-[0.7rem] font-extrabold uppercase max-[620px]:min-h-[30px] max-[620px]:text-[0.56rem] ${
                        active
                          ? "border-[rgba(255,248,234,0.72)] bg-[var(--cream)] text-[color:var(--leaf)]"
                          : "border-[rgba(255,248,234,0.22)] bg-[rgba(255,248,234,0.1)] text-[color:rgba(255,248,234,0.78)] hover:border-[rgba(255,248,234,0.72)] hover:bg-[var(--cream)] hover:text-[color:var(--leaf)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[10px] max-[620px]:hidden">
              {LOCAL_LIST.map((item) => (
                <span
                  key={item}
                  className="flex min-h-[44px] items-center rounded-[8px] border border-[color:var(--line)] bg-[rgba(255,248,234,0.58)] px-[12px] py-[9px] font-extrabold text-[color:var(--leaf)]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-[clamp(0.85rem,1.9vh,1.35rem)] max-[620px]:order-1 max-[620px]:gap-[12px]">
            <h2 className="m-0 pt-[40px] max-w-[12.5ch] font-display text-[clamp(3rem,5.3vw,6.25rem)] font-normal leading-[0.88] text-[color:var(--leaf)] max-[620px]:max-w-full max-[620px]:text-[clamp(2.35rem,12vw,3rem)] max-[620px]:leading-[0.94]">
              Your companion should feel close without making your life feel exposed.
            </h2>
            <p className="m-0 w-[min(560px,100%)] text-[1rem] font-semibold leading-[1.65] text-[color:rgba(7,18,7,0.68)] max-[620px]:text-[0.86rem] max-[620px]:leading-[1.46]">
              Every check-in is shaped around consent, calm defaults, and visible controls,
              so the experience feels personal without becoming noisy.
            </p>
            <div
              aria-label="Privacy flow"
              className="relative grid w-[min(720px,100%)] grid-cols-[repeat(3,minmax(0,1fr))] gap-[10px] max-[620px]:grid-cols-1 max-[620px]:gap-[8px]"
            >
              <div className="pointer-events-none absolute left-[12px] right-[12px] top-[22px] z-0 h-px opacity-[0.38] [background:linear-gradient(90deg,var(--poppy),var(--leaf),var(--sky))] max-[620px]:hidden" />
              {PRIVACY_FLOW.map(([num, label]) => (
                <span
                  key={num}
                  className="relative z-[1] grid min-h-[clamp(82px,11vh,108px)] content-between rounded-[8px] border border-[color:var(--line)] bg-[rgba(255,248,234,0.6)] p-[12px] text-[1rem] font-extrabold leading-[1.14] text-[color:var(--leaf)] max-[620px]:min-h-[52px] max-[620px]:grid-cols-[auto_minmax(0,1fr)] max-[620px]:content-center max-[620px]:items-center max-[620px]:gap-[10px] max-[620px]:px-[10px] max-[620px]:py-[9px] max-[620px]:text-[0.92rem]"
                >
                  <strong className="w-max rounded-full bg-[var(--leaf)] px-[7px] py-[5px] font-mono text-[0.66rem] leading-none text-[color:var(--cream)]">
                    {num}
                  </strong>{" "}
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section
          className={`${SECTION} grid h-[100svh] min-h-[620px] grid-cols-[minmax(0,1fr)_minmax(310px,0.72fr)] items-center gap-[clamp(2rem,6vw,6rem)] py-[var(--section-pad)] max-[980px]:grid-cols-1 max-[620px]:pb-[64px] max-[620px]:pt-[88px]`}
        >
          <div className="relative z-[2]">
            <p className={EYEBROW}>First check-in</p>
            <h2 className="m-0 w-[min(820px,100%)] font-display text-[clamp(3rem,6.4vw,7rem)] font-normal leading-[0.9] text-[color:var(--leaf)] max-[620px]:text-[2.46rem]">
              Start small: one honest sentence, one kind response, one next step.
            </h2>
            <button
              className={`${PRIMARY} mt-[28px]`}
              type="button"
              onClick={handleCheckinClick}
            >
              Start a check-in
            </button>
            <p className="mt-[14px] min-h-[24px] text-[0.94rem] font-semibold text-[color:rgba(7,18,7,0.72)]">
              {checkinNote}
            </p>
          </div>
          <figure className="relative isolate m-0 h-[min(72svh,740px)] min-h-[520px] overflow-hidden rounded-[8px] border border-[rgba(255,248,234,0.42)] bg-[var(--leaf)] shadow-[0_30px_100px_rgba(5,7,6,0.24)] max-[980px]:h-[min(62svh,640px)] max-[980px]:min-h-[430px] max-[980px]:w-[min(520px,100%)] max-[980px]:justify-self-center max-[620px]:h-[460px] max-[620px]:min-h-[460px] max-[620px]:w-full">
            <div className="pointer-events-none absolute inset-0 z-[2] opacity-[0.48] mix-blend-overlay [background:linear-gradient(rgba(255,248,234,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,248,234,0.1)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="pointer-events-none absolute inset-0 z-[2] [background:linear-gradient(180deg,rgba(120,201,246,0.04),transparent_48%,rgba(7,18,7,0.34)),radial-gradient(circle_at_28%_12%,rgba(255,248,234,0.42),transparent_28%)]" />
            <Image
              src="/assets/poppys-clay-companion.jpg"
              alt="Clay-style Poppys companion character holding a red poppy in a bright garden"
              fill
              sizes="(max-width: 980px) 520px, 40vw"
              className="scale-[1.02] object-cover object-[50%_50%]"
            />
          </figure>
        </section>
      </main>
    </>
  );
}
