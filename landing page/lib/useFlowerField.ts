"use client";

import { useEffect, useRef } from "react";

const FRAME_COUNT = 200;
const FRAME_ROOT = "/assets/flower-frames/poppys_";
const FRAME_EXT = "webp";
const FRAME_MANIFEST = "/assets/flower-frames/manifest.json";

interface Flower {
  x: number;
  y: number;
  depth: number;
  size: number;
  lean: number;
  phase: number;
  petals: number;
}

interface ToneColors {
  sky: string;
  skySoft: string;
  poppy: string;
  poppyDark: string;
  leaf: string;
  meadow: string;
  fieldDeep: string;
  cream: string;
  clay: string;
}

interface FlowerFieldState {
  width: number;
  height: number;
  dpr: number;
  progress: number;
  targetProgress: number;
  time: number;
  bloom: number;
  framesEnabled: boolean;
  frameCount: number;
  frames: (HTMLImageElement | undefined)[];
  flowers: Flower[];
}

interface FrameManifest {
  available: boolean;
  count?: number;
  root?: string;
  ext?: string;
}

interface UseFlowerFieldOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  scrollerRef: React.RefObject<HTMLElement | null>;
  heroContentRef: React.RefObject<HTMLElement | null>;
  heroReelRef: React.RefObject<HTMLElement | null>;
}

export function useFlowerField({
  canvasRef,
  scrollerRef,
  heroContentRef,
  heroReelRef,
}: UseFlowerFieldOptions) {
  const bloomTriggerRef = useRef<(amount: number) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const state: FlowerFieldState = {
      width: 0,
      height: 0,
      dpr: 1,
      progress: 0,
      targetProgress: 0,
      time: 0,
      bloom: 0,
      framesEnabled: false,
      frameCount: FRAME_COUNT,
      frames: [],
      flowers: [],
    };

    bloomTriggerRef.current = (amount: number) => {
      state.bloom = amount;
    };

    function clamp(value: number, min: number, max: number) {
      return Math.max(min, Math.min(max, value));
    }

    function lerp(a: number, b: number, n: number) {
      return a + (b - a) * n;
    }

    function padFrame(index: number) {
      return String(index).padStart(4, "0");
    }

    function frameUrl(index: number, root?: string, ext?: string) {
      return (root || FRAME_ROOT) + padFrame(index) + "." + (ext || FRAME_EXT);
    }

    function seeded(seedInput: number) {
      let seed = seedInput;
      return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function generateFlowers() {
      const random = seeded(4219);
      const count = state.width < 700 ? 26 : 44;
      const flowers: Flower[] = [];

      for (let i = 0; i < count; i += 1) {
        // Even horizontal distribution: one flower per stratified slot with a
        // little jitter, so the field reads as a designed meadow — no clumps,
        // no bald patches.
        const x = (i + 0.5 + (random() - 0.5) * 0.72) / count;
        // Depth drives scale *and* vertical placement, so distant flowers sit
        // higher and smaller near the horizon while close ones sit lower and
        // larger in front — proper perspective layering.
        const depth = Math.pow(random(), 1.7);
        const y = lerp(0.76, 1.05, depth) + (random() - 0.5) * 0.014;
        flowers.push({
          x,
          y,
          depth,
          size: lerp(0.58, 1.5, depth) * (0.86 + random() * 0.36),
          lean: (random() - 0.5) * 0.9,
          phase: random() * Math.PI * 2,
          petals: 4 + Math.floor(random() * 3),
        });
      }

      // Paint back-to-front so nearer flowers overlap distant ones cleanly.
      flowers.sort(function (a, b) {
        return a.depth - b.depth;
      });
      state.flowers = flowers;
    }

    function updateHeroMotion() {
      const scroller = scrollerRef.current;
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
      const heroProgress = clamp(scrollTop / Math.max(1, window.innerHeight), 0, 1);
      const heroContent = heroContentRef.current;
      const heroReel = heroReelRef.current;
      if (heroContent)
        heroContent.style.setProperty("--hero-y", Math.round(heroProgress * 54) + "px");
      if (heroReel)
        heroReel.style.setProperty("--reel-y", Math.round(heroProgress * -38) + "px");
    }

    function updateScroll() {
      const scroller = scrollerRef.current;
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
      const scrollHeight = scroller
        ? scroller.scrollHeight
        : document.documentElement.scrollHeight;
      const clientHeight = scroller ? scroller.clientHeight : window.innerHeight;
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      state.targetProgress = clamp(scrollTop / maxScroll, 0, 1);
      updateHeroMotion();
    }

    function resize() {
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      canvas!.width = Math.floor(state.width * state.dpr);
      canvas!.height = Math.floor(state.height * state.dpr);
      canvas!.style.width = state.width + "px";
      canvas!.style.height = state.height + "px";
      ctx!.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      generateFlowers();
      updateScroll();
      draw();
    }

    function toneColors(): ToneColors {
      const styles = getComputedStyle(document.body);
      return {
        sky: styles.getPropertyValue("--sky").trim() || "#9ed8f7",
        skySoft: styles.getPropertyValue("--sky-soft").trim() || "#dff3ff",
        poppy: styles.getPropertyValue("--poppy").trim() || "#e92832",
        poppyDark: styles.getPropertyValue("--poppy-dark").trim() || "#a90f1c",
        leaf: styles.getPropertyValue("--leaf").trim() || "#173f16",
        meadow: styles.getPropertyValue("--meadow").trim() || "#74ad5f",
        fieldDeep: styles.getPropertyValue("--field-deep").trim() || "#4f8a48",
        cream: styles.getPropertyValue("--cream").trim() || "#fff8ea",
        clay: styles.getPropertyValue("--clay").trim() || "#f1c7a6",
      };
    }

    function roundedBlob(
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      wobble: number,
      fill: string
    ) {
      ctx!.beginPath();
      const steps = 18;
      for (let i = 0; i <= steps; i += 1) {
        const angle = (Math.PI * 2 * i) / steps;
        const wave =
          1 + Math.sin(angle * 3 + wobble) * 0.06 + Math.cos(angle * 2 - wobble) * 0.04;
        const x = cx + Math.cos(angle) * rx * wave;
        const y = cy + Math.sin(angle) * ry * wave;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.closePath();
      ctx!.fillStyle = fill;
      ctx!.fill();
    }

    function drawCloud(x: number, y: number, scale: number, alpha: number) {
      ctx!.save();
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = "#fff8ea";
      roundedBlob(x, y, 72 * scale, 22 * scale, state.time * 0.0004, "#fff8ea");
      roundedBlob(
        x + 48 * scale,
        y + 4 * scale,
        56 * scale,
        18 * scale,
        state.time * 0.0005,
        "#fff8ea"
      );
      roundedBlob(
        x - 54 * scale,
        y + 10 * scale,
        48 * scale,
        16 * scale,
        state.time * 0.0003,
        "#fff8ea"
      );
      ctx!.restore();
    }

    function drawSky(colors: ToneColors) {
      const g = ctx!.createLinearGradient(0, 0, 0, state.height);
      g.addColorStop(0, colors.skySoft);
      g.addColorStop(0.48, colors.sky);
      g.addColorStop(1, "#e7f5db");
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, state.width, state.height);

      const sunX = lerp(state.width * 0.2, state.width * 0.78, state.progress);
      const sunY = state.height * 0.18;
      const sun = ctx!.createRadialGradient(sunX, sunY, 0, sunX, sunY, state.width * 0.28);
      sun.addColorStop(0, "rgba(255, 248, 234, 0.76)");
      sun.addColorStop(1, "rgba(255, 248, 234, 0)");
      ctx!.fillStyle = sun;
      ctx!.fillRect(0, 0, state.width, state.height * 0.58);

      drawCloud(state.width * (0.1 + state.progress * 0.08), state.height * 0.18, 1.1, 0.46);
      drawCloud(state.width * (0.68 - state.progress * 0.1), state.height * 0.27, 0.84, 0.34);
    }

    function drawMountains(colors: ToneColors) {
      const horizon = state.height * (0.68 - state.progress * 0.04);
      const far = state.height * 0.16;

      ctx!.fillStyle = "rgba(86, 138, 78, 0.16)";
      ctx!.beginPath();
      ctx!.moveTo(0, horizon + 18);
      ctx!.bezierCurveTo(
        state.width * 0.16,
        horizon - far * 0.4,
        state.width * 0.27,
        horizon - far * 0.6,
        state.width * 0.45,
        horizon + 8
      );
      ctx!.bezierCurveTo(
        state.width * 0.62,
        horizon - far * 0.56,
        state.width * 0.8,
        horizon - far * 0.7,
        state.width,
        horizon + 20
      );
      ctx!.lineTo(state.width, state.height);
      ctx!.lineTo(0, state.height);
      ctx!.closePath();
      ctx!.fill();

      ctx!.fillStyle = colors.meadow;
      ctx!.beginPath();
      ctx!.moveTo(0, horizon + 58);
      ctx!.bezierCurveTo(
        state.width * 0.14,
        horizon + 8,
        state.width * 0.29,
        horizon - 34,
        state.width * 0.46,
        horizon + 38
      );
      ctx!.bezierCurveTo(
        state.width * 0.62,
        horizon - 18,
        state.width * 0.82,
        horizon - 52,
        state.width,
        horizon + 48
      );
      ctx!.lineTo(state.width, state.height);
      ctx!.lineTo(0, state.height);
      ctx!.closePath();
      ctx!.fill();
    }

    function drawFieldBase(colors: ToneColors) {
      const horizon = state.height * (0.74 - state.progress * 0.04);
      const g = ctx!.createLinearGradient(0, horizon, 0, state.height);
      g.addColorStop(0, "#92c878");
      g.addColorStop(0.42, colors.meadow);
      g.addColorStop(1, colors.fieldDeep);
      ctx!.fillStyle = g;
      ctx!.fillRect(0, horizon, state.width, state.height - horizon);

      ctx!.globalAlpha = 0.12;
      ctx!.strokeStyle = "#fff8ea";
      ctx!.lineWidth = 1;
      for (let i = 0; i < 13; i += 1) {
        const x = ((i / 22) * state.width + state.progress * 120) % (state.width + 140) - 70;
        ctx!.beginPath();
        ctx!.moveTo(x, horizon);
        ctx!.quadraticCurveTo(
          state.width * 0.5,
          state.height * 0.76,
          x + (state.width * 0.5 - x) * 1.2,
          state.height
        );
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
    }

    function drawFlower(flower: Flower, colors: ToneColors) {
      const h = state.height;
      const w = state.width;
      const horizon = h * (0.74 - state.progress * 0.04);
      const depth = flower.depth;
      const drift = Math.sin(state.time * 0.0013 + flower.phase) * (prefersReduced ? 0 : 1);
      const forward = state.progress * 110 * depth;
      const x = flower.x * w + (flower.x - 0.5) * forward + drift * 8 * depth;
      const y = horizon + (flower.y - 0.52) * h * (0.92 + state.progress * 0.18);
      const stem = lerp(10, 46, depth) * flower.size;
      const petal = lerp(2.2, 9.4, depth) * flower.size * (1 + state.bloom * 0.1);

      if (x < -80 || x > w + 80 || y < horizon - 20 || y > h + 100) return;

      ctx!.strokeStyle = depth > 0.52 ? colors.leaf : "rgba(23, 63, 22, 0.72)";
      ctx!.lineWidth = Math.max(1, depth * 3.2);
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(x - flower.lean * 7, y + stem);
      ctx!.quadraticCurveTo(
        x + flower.lean * 16 + drift * 2,
        y + stem * 0.5,
        x,
        y + petal * 0.25
      );
      ctx!.stroke();

      if (depth > 0.42) {
        ctx!.fillStyle = "rgba(255, 248, 234, 0.16)";
        ctx!.beginPath();
        ctx!.ellipse(
          x + 7 * flower.lean,
          y + stem * 0.54,
          11 * depth,
          3.6 * depth,
          flower.lean,
          0,
          Math.PI * 2
        );
        ctx!.fill();
      }

      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(flower.lean * 0.16 + drift * 0.02);
      ctx!.shadowColor = "rgba(103, 5, 18, 0.24)";
      ctx!.shadowBlur = 4 * depth;
      ctx!.shadowOffsetY = 2 * depth;

      for (let i = 0; i < flower.petals; i += 1) {
        const a = (i / flower.petals) * Math.PI * 2 + flower.phase * 0.1;
        const px = Math.cos(a) * petal * 0.45;
        const py = Math.sin(a) * petal * 0.26;
        ctx!.save();
        ctx!.translate(px, py);
        ctx!.rotate(a);
        roundedBlob(
          0,
          0,
          petal * 0.74,
          petal * 0.46,
          state.time * 0.002 + i,
          i % 2 ? colors.poppy : "#ff4350"
        );
        ctx!.restore();
      }

      ctx!.shadowBlur = 0;
      ctx!.fillStyle = colors.poppyDark;
      ctx!.beginPath();
      ctx!.arc(0, 0, Math.max(1.6, petal * 0.24), 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    function drawProcedural() {
      const colors = toneColors();
      drawSky(colors);
      drawMountains(colors);
      drawFieldBase(colors);

      for (let i = 0; i < state.flowers.length; i += 1) {
        drawFlower(state.flowers[i], colors);
      }

      if (state.bloom > 0.01) {
        ctx!.save();
        ctx!.globalAlpha = state.bloom * 0.16;
        ctx!.fillStyle = colors.cream;
        ctx!.fillRect(0, 0, state.width, state.height);
        ctx!.restore();
        state.bloom *= 0.94;
      } else {
        state.bloom = 0;
      }
    }

    function drawCoverImage(img: HTMLImageElement) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return false;

      const scale = Math.max(state.width / iw, state.height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (state.width - dw) / 2;
      const dy = (state.height - dh) / 2;
      ctx!.drawImage(img, dx, dy, dw, dh);
      return true;
    }

    function drawFrameSequence() {
      const frameCount = state.frameCount || FRAME_COUNT;
      const index = Math.min(
        frameCount - 1,
        Math.max(0, Math.round(state.progress * (frameCount - 1)))
      );
      let img = state.frames[index];

      if (!img || !img.complete || !img.naturalWidth) {
        for (let offset = 1; offset < 12; offset += 1) {
          img =
            state.frames[Math.max(0, index - offset)] ||
            state.frames[Math.min(frameCount - 1, index + offset)];
          if (img && img.complete && img.naturalWidth) break;
        }
      }

      return Boolean(img && img.complete && img.naturalWidth && drawCoverImage(img));
    }

    function draw() {
      if (state.framesEnabled && drawFrameSequence()) return;
      drawProcedural();
    }

    let rafId = 0;
    function loop(now: number) {
      state.time = now || 0;
      state.progress = prefersReduced
        ? state.targetProgress
        : lerp(state.progress, state.targetProgress, 0.075);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function loadFramesFromManifest(manifest: FrameManifest) {
      const count = Number(manifest.count) || FRAME_COUNT;
      const root = manifest.root || FRAME_ROOT;
      const ext = manifest.ext || FRAME_EXT;
      const first = new Image();
      first.onload = function () {
        state.framesEnabled = true;
        state.frameCount = count;
        state.frames[0] = first;
        for (let i = 2; i <= count; i += 1) {
          const img = new Image();
          state.frames[i - 1] = img;
          img.src = frameUrl(i, root, ext);
        }
      };
      first.onerror = function () {
        state.framesEnabled = false;
      };
      first.src = frameUrl(1, root, ext);
    }

    function tryLoadFrames() {
      fetch(FRAME_MANIFEST, { cache: "no-store" })
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (manifest: FrameManifest | null) {
          if (!manifest || manifest.available !== true) return;
          loadFramesFromManifest(manifest);
        })
        .catch(function () {});
    }

    resize();
    tryLoadFrames();

    window.addEventListener("resize", resize);
    const scroller = scrollerRef.current;
    if (scroller) scroller.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("scroll", updateScroll, { passive: true });
    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (scroller) scroller.removeEventListener("scroll", updateScroll);
      window.removeEventListener("scroll", updateScroll);
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    triggerBloom: (amount: number) => bloomTriggerRef.current(amount),
  };
}
