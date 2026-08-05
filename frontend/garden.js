// The garden (POPPY_RETENTION_ENGINE §3.1) — the rendered form of the user's
// history with her. One flower per call: a bud for turning up, a bloom for a call
// that had something real in it.
//
// The flower drawing (stem curve, petal ring, leaf, centre disc, sway) is ported
// from the landing page's useFlowerField, which already had the look right. What
// is NOT ported is everything around it: that hook is a React scroll-driven hero
// with a frame-image manifest, and none of that applies to a garden whose shape
// comes from the user's own calls.
//
// Two rules from §3.1 are load-bearing here:
//   * There is no number anywhere on this surface. Not a count, not a total, not
//     a percentage. All the counting lives on the Today/level surface, because a
//     relationship with a score attached stops feeling like a relationship.
//   * Nothing wilts. Absence never changes a flower that already grew. A wilting
//     garden is streak-shame with a paint job.
(function () {
  const lerp = (a, b, t) => a + (b - a) * t;

  // A cheap deterministic hash so each flower's position and jitter are stable:
  // the garden should look the same every time it is opened, not reshuffle.
  function rand(seed, salt) {
    let x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // Season palettes (§3.1: temporal landmarks made visual).
  const SEASONS = {
    spring: { sky: "#cfe6f5", meadow: "#8fc47a", deep: "#3f7a3a", haze: "#fff8ea" },
    summer: { sky: "#bfe0f2", meadow: "#7cba63", deep: "#2f6b2c", haze: "#fff8ea" },
    autumn: { sky: "#f0dcc4", meadow: "#c2a259", deep: "#6d5326", haze: "#fff3e0" },
    winter: { sky: "#dfe9f0", meadow: "#9db3a4", deep: "#4a5f55", haze: "#f7fbff" },
  };

  function roundedBlob(ctx, w, h, wobble, fill) {
    ctx.beginPath();
    for (let i = 0; i <= 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const r = 1 + Math.sin(a * 3 + wobble) * 0.06;
      const x = Math.cos(a) * w * r;
      const y = Math.sin(a) * h * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function layout(flower, i, total) {
    const s = flower.seed || i * 37;
    // Older calls sit further back, so the field reads front-to-back as recency
    // without ever labelling it.
    const age = total > 1 ? i / (total - 1) : 1;
    const depth = lerp(0.34, 1, age * 0.75 + rand(s, 3) * 0.25);
    return {
      x: rand(s, 1),
      y: rand(s, 2),
      depth,
      size: lerp(0.75, 1.15, rand(s, 4)),
      lean: (rand(s, 5) - 0.5) * 1.4,
      phase: rand(s, 6) * Math.PI * 2,
    };
  }

  function drawField(ctx, W, H, pal) {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.78);
    sky.addColorStop(0, pal.sky);
    sky.addColorStop(1, pal.haze);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const horizon = H * 0.44;
    const g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, pal.meadow);
    g.addColorStop(1, pal.deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, W, H - horizon);
    return horizon;
  }

  function drawFlower(ctx, f, pos, horizon, W, H, t, kinds, reduced) {
    const kind = kinds[f.kind] || kinds.talk || { petals: 6, hue: "#e0554f" };
    const bloomed = f.state === "bloom";
    const drift = reduced ? 0 : Math.sin(t * 0.0013 + pos.phase);
    const x = pos.x * W + drift * 6 * pos.depth;
    const y = horizon + (pos.y * (H - horizon) * 0.92);
    const stem = lerp(10, 46, pos.depth) * pos.size;
    // A bud is a smaller, closed thing. Never a failure, just a smaller event.
    const petal = lerp(2.2, 9.4, pos.depth) * pos.size * (bloomed ? 1 : 0.55);

    ctx.strokeStyle = pos.depth > 0.52 ? "#2f6b2c" : "rgba(23, 63, 22, 0.72)";
    ctx.lineWidth = Math.max(1, pos.depth * 3.2);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - pos.lean * 7, y + stem);
    ctx.quadraticCurveTo(x + pos.lean * 16 + drift * 2, y + stem * 0.5, x, y + petal * 0.25);
    ctx.stroke();

    if (pos.depth > 0.42) {
      ctx.fillStyle = "rgba(255, 248, 234, 0.16)";
      ctx.beginPath();
      ctx.ellipse(x + 7 * pos.lean, y + stem * 0.54, 11 * pos.depth, 3.6 * pos.depth,
        pos.lean, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pos.lean * 0.16 + drift * 0.02);
    ctx.shadowColor = "rgba(103, 5, 18, 0.24)";
    ctx.shadowBlur = 4 * pos.depth;
    ctx.shadowOffsetY = 2 * pos.depth;

    if (bloomed) {
      // Flowers have identity: the petal count and hue come from what kind of
      // call it was, so the garden reads as an emotional record of the year.
      for (let i = 0; i < kind.petals; i += 1) {
        const a = (i / kind.petals) * Math.PI * 2 + pos.phase * 0.1;
        ctx.save();
        ctx.translate(Math.cos(a) * petal * 0.45, Math.sin(a) * petal * 0.26);
        ctx.rotate(a);
        roundedBlob(ctx, petal * 0.74, petal * 0.46, t * 0.002 + i, kind.hue);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(60, 12, 20, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.6, petal * 0.24), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = kind.hue;
      ctx.globalAlpha = 0.72;
      roundedBlob(ctx, petal * 0.5, petal * 0.8, pos.phase, kind.hue);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  let _raf = null;

  function render(canvas, state) {
    if (!canvas || !state || !state.flowers) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pal = SEASONS[state.season] || SEASONS.summer;
    const kinds = state.kinds || {};
    const flowers = state.flowers;
    const positions = flowers.map((f, i) => layout(f, i, flowers.length));
    // Draw far flowers first so the field has depth.
    const order = flowers.map((_, i) => i).sort((a, b) => positions[a].depth - positions[b].depth);

    function frame(t) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== Math.floor(W * dpr)) {
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const horizon = drawField(ctx, W, H, pal);
      order.forEach((i) => drawFlower(ctx, flowers[i], positions[i], horizon, W, H, t, kinds, reduced));
      _raf = reduced ? null : requestAnimationFrame(frame);
    }

    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
  }

  window.PoppyGarden = { render, stop };
})();
