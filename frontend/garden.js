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
    spring: {
      sky: "#a9d5ef", skySoft: "#d5ebf7", haze: "#fff8ea", sun: "rgba(255,244,214,0.55)",
      cloud: "rgba(255,255,255,0.95)", cloudSoft: "rgba(255,252,246,0.5)",
      hillFar: "#a8c9a4", hillNear: "#7fae74",
      meadow: "#8fc47a", meadowMid: "#6aa658", deep: "#2f6b34",
      grass: "#4f8f45", grassLight: "#7fc06a", grassDark: "#2f6b34",
    },
    summer: {
      sky: "#8fd0ee", skySoft: "#c9e8f6", haze: "#fff8ea", sun: "rgba(255,240,196,0.6)",
      cloud: "rgba(255,255,255,0.96)", cloudSoft: "rgba(252,250,242,0.5)",
      hillFar: "#9cc593", hillNear: "#6da55e",
      meadow: "#7cba63", meadowMid: "#589c48", deep: "#255c26",
      grass: "#3f8a35", grassLight: "#78bd5f", grassDark: "#255c26",
    },
    autumn: {
      sky: "#f2d9b6", skySoft: "#f8e9d4", haze: "#fff3e0", sun: "rgba(255,214,150,0.6)",
      cloud: "rgba(255,250,240,0.95)", cloudSoft: "rgba(250,238,220,0.5)",
      hillFar: "#cbb083", hillNear: "#a98b57",
      meadow: "#c2a259", meadowMid: "#a08243", deep: "#5f4720",
      grass: "#8a6b32", grassLight: "#c9a95e", grassDark: "#5f4720",
    },
    winter: {
      sky: "#c8d9e6", skySoft: "#e6eef4", haze: "#f7fbff", sun: "rgba(238,246,255,0.55)",
      cloud: "rgba(255,255,255,0.9)", cloudSoft: "rgba(238,246,252,0.5)",
      hillFar: "#b9c6c2", hillNear: "#94a89e",
      meadow: "#9db3a4", meadowMid: "#7e9689", deep: "#42574e",
      grass: "#6a8074", grassLight: "#9db3a4", grassDark: "#42574e",
    },
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

  // Where a flower sits. A saved position always wins: once the user has placed
  // something, nothing we compute should move it again.
  function layout(flower, i, total) {
    const s = flower.seed || i * 37;
    if (typeof flower.x === "number" && typeof flower.y === "number") {
      return {
        x: flower.x,
        y: flower.y,
        depth: 0.28 + flower.y * 0.72,
        size: lerp(0.85, 1.25, rand(s, 4)),
        lean: (rand(s, 5) - 0.5) * 1.4,
        phase: rand(s, 6) * Math.PI * 2,
        placed: true,
      };
    }
    // Depth is derived from where the flower stands, not from how old it is.
    // They were independent before, so an old call could be placed in the
    // foreground and still drawn tiny, which is why one flower looked like it was
    // floating at the horizon. Further down the field = nearer = bigger.
    //
    // Placement is biased toward the foreground so that a garden of five flowers
    // still reads as a garden rather than five specks near the skyline.
    const y = Math.pow(rand(s, 2), 0.62);
    // Newer calls lean toward the front, but only as a nudge: position wins.
    const recency = total > 1 ? i / (total - 1) : 1;
    const yy = Math.min(1, y * 0.75 + recency * 0.25);
    return {
      // Spread across the field by golden-ratio spacing rather than pure
      // randomness. With four flowers, random seeds clump into one corner and
      // the field looks empty; this covers the width at any count, and the
      // jitter keeps it from looking planted in a row.
      x: 0.05 + (((i * 0.6180339887) % 1) * 0.86 + (rand(s, 1) - 0.5) * 0.07 + 1) % 1 * 0.9,
      y: yy,
      depth: 0.28 + yy * 0.72,
      size: lerp(0.85, 1.25, rand(s, 4)),
      lean: (rand(s, 5) - 0.5) * 1.4,
      phase: rand(s, 6) * Math.PI * 2,
    };
  }

  // ── Background ─────────────────────────────────────────────────────────────
  // Split in two on purpose: the land never changes, so it is drawn once into an
  // offscreen canvas and blitted. Only the clouds move. That way the grass can be
  // thousands of blades without costing anything per frame.

  function drawClouds(ctx, W, horizon, pal, t, reduced) {
    // Slow drift. Clouds are the only part of the sky that moves, so this is the
    // whole difference between "a blue rectangle" and "sky".
    const shift = reduced ? 0 : (t * 0.004);
    for (let c = 0; c < 7; c += 1) {
      const baseX = rand(c, 21) * (W + 400) - 200;
      const x = ((baseX + shift * (0.4 + rand(c, 22) * 0.8)) % (W + 460)) - 230;
      const y = horizon * (0.14 + rand(c, 23) * 0.55);
      const scale = 0.5 + rand(c, 24) * 1.1;
      const puffs = 5 + Math.floor(rand(c, 25) * 4);

      ctx.save();
      ctx.globalAlpha = 0.5 + rand(c, 26) * 0.35;
      // A cloud is a run of overlapping soft circles, biggest in the middle.
      for (let i = 0; i < puffs; i += 1) {
        const px = x + (i - puffs / 2) * 26 * scale;
        const bell = 1 - Math.abs(i - (puffs - 1) / 2) / puffs;
        const r = (14 + bell * 26 + rand(c * 10 + i, 27) * 8) * scale;
        const py = y + (rand(c * 10 + i, 28) - 0.5) * 10 * scale;
        const g = ctx.createRadialGradient(px, py, r * 0.2, px, py, r);
        g.addColorStop(0, pal.cloud);
        g.addColorStop(0.7, pal.cloudSoft);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function buildLand(W, H, pal) {
    const horizon = H * 0.42;
    const off = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    off.width = Math.floor(W * dpr);
    off.height = Math.floor(H * dpr);
    const c = off.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, pal.sky);
    sky.addColorStop(0.65, pal.skySoft);
    sky.addColorStop(1, pal.haze);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, horizon + 1);

    const sunX = W * 0.74, sunY = horizon * 0.34;
    const glow = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, horizon * 0.9);
    glow.addColorStop(0, pal.sun);
    glow.addColorStop(1, "rgba(255,248,234,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, W, horizon + 1);

    function hills(baseY, amp, fill, seedOff) {
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(0, H);
      c.lineTo(0, baseY);
      for (let x = 0; x <= W; x += 10) {
        c.lineTo(x, baseY - Math.sin(x * 0.006 + seedOff) * amp
                       - Math.sin(x * 0.013 + seedOff * 2) * amp * 0.45);
      }
      c.lineTo(W, H);
      c.closePath();
      c.fill();
    }
    hills(horizon - 3, 15, pal.hillFar, 1.2);
    hills(horizon + 7, 10, pal.hillNear, 3.7);

    const g = c.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, pal.meadow);
    g.addColorStop(0.4, pal.meadowMid);
    g.addColorStop(1, pal.deep);
    c.fillStyle = g;
    c.fillRect(0, horizon + 5, W, H - horizon);

    // The grass itself. Thousands of individual blades, short and pale near the
    // horizon and tall and dark at your feet: that gradient of size is what the
    // eye reads as ground receding, and it is what a flat fill can never do.
    const blades = Math.round((W * H) / 260);
    for (let i = 0; i < blades; i += 1) {
      const d = Math.pow(rand(i, 31), 0.55);        // bias toward the foreground
      const x = rand(i, 32) * W;
      const y = horizon + 5 + d * (H - horizon - 5);
      const len = 4 + d * 34 + rand(i, 33) * 8;
      const lean = (rand(i, 34) - 0.5) * (10 + d * 26);
      c.strokeStyle = i % 3 === 0 ? pal.grassLight : (i % 3 === 1 ? pal.grass : pal.grassDark);
      c.globalAlpha = 0.35 + d * 0.5;
      c.lineWidth = 0.7 + d * 1.6;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + lean * 0.35, y - len * 0.6, x + lean, y - len);
      c.stroke();
    }
    c.globalAlpha = 1;

    const seam = c.createLinearGradient(0, horizon - 16, 0, horizon + 30);
    seam.addColorStop(0, "rgba(255,248,234,0.32)");
    seam.addColorStop(1, "rgba(255,248,234,0)");
    c.fillStyle = seam;
    c.fillRect(0, horizon - 16, W, 46);

    return { canvas: off, horizon, W, H };
  }

  function drawFlower(ctx, f, pos, horizon, W, H, t, kinds, reduced) {
    const kind = kinds[f.kind] || kinds.talk || { petals: 6, hue: "#e0554f" };
    const bloomed = f.state === "bloom";
    const drift = reduced ? 0 : Math.sin(t * 0.0013 + pos.phase);
    const x = pos.x * W + drift * 6 * pos.depth;
    const y = horizon + 14 + pos.y * (H - horizon - 40);
    const stem = lerp(22, 104, pos.depth) * pos.size;
    // A bud is a smaller, closed thing. Never a failure, just a smaller event.
    const petal = lerp(6, 30, pos.depth) * pos.size * (bloomed ? 1 : 0.5);

    ctx.strokeStyle = pos.depth > 0.52 ? "#2f6b2c" : "rgba(23, 63, 22, 0.72)";
    ctx.lineWidth = Math.max(1.4, pos.depth * 5.5);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - pos.lean * 7, y + stem);
    ctx.quadraticCurveTo(x + pos.lean * 16 + drift * 2, y + stem * 0.5, x, y + petal * 0.25);
    ctx.stroke();

    if (pos.depth > 0.42) {
      ctx.fillStyle = "rgba(255, 248, 234, 0.16)";
      ctx.beginPath();
      ctx.ellipse(x + 12 * pos.lean, y + stem * 0.54, 22 * pos.depth, 7 * pos.depth,
        pos.lean, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pos.lean * 0.16 + drift * 0.02);
    ctx.shadowColor = "rgba(103, 5, 18, 0.24)";
    ctx.shadowBlur = (pos.lifted ? 16 : 7) * pos.depth;
    ctx.shadowOffsetY = 3 * pos.depth;

    // §4.1's Long Year flower gets a glow nothing else has. It is the only thing
    // in the garden that cannot be earned any other way, so it should not look
    // like the others.
    if (kind.rare && bloomed) {
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, petal * 2.6);
      halo.addColorStop(0, "rgba(255, 226, 138, 0.55)");
      halo.addColorStop(1, "rgba(255, 226, 138, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, petal * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

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
      // A flower you have named wears a pale ring. Enough to spot which ones
      // carry a name without putting every label on screen at once.
      if (f.label) {
        ctx.strokeStyle = "rgba(255,248,234,0.85)";
        ctx.lineWidth = Math.max(1, petal * 0.07);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3, petal * 0.42), 0, Math.PI * 2);
        ctx.stroke();
      }
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

  function drawTag(ctx, f, pos, horizon, W, H) {
    const label = f.label || "";
    const when = (f.date || "").slice(5).split("-").reverse().join("/");
    const text = label ? `${label}  ·  ${when}` : `${f.kind} · ${when}  ·  tap to name`;
    const petal = lerp(6, 30, pos.depth) * pos.size;
    const x = pos.x * W;
    const y = horizon + 14 + pos.y * (H - horizon - 40) - petal - 16;

    ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    const w = ctx.measureText(text).width + 18;
    const bx = Math.min(Math.max(x - w / 2, 6), W - w - 6);

    ctx.fillStyle = "rgba(7,18,7,0.62)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, y - 20, w, 24, 6) : ctx.rect(bx, y - 20, w, 24);
    ctx.fill();
    ctx.fillStyle = label ? "#fff8ea" : "rgba(255,248,234,0.72)";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 9, y - 8);
  }

  let onSelect = null;

  function render(canvas, state, opts) {
    onSelect = (opts && opts.onSelect) || null;
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
    let land = null;

    function frame(t) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== Math.floor(W * dpr)) {
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!land || land.W !== W || land.H !== H) land = buildLand(W, H, pal);
      ctx.drawImage(land.canvas, 0, 0, W, H);
      drawClouds(ctx, W, land.horizon, pal, t, reduced);
      order.forEach((i) => drawFlower(ctx, flowers[i], positions[i], land.horizon, W, H, t, kinds, reduced));

      // One label at a time, on the flower under the cursor or the one being
      // named. Showing them all would bury the field in text.
      const showing = dragging !== null ? dragging : (selected !== null ? selected : hovered);
      if (showing !== null && showing !== undefined && flowers[showing]) {
        drawTag(ctx, flowers[showing], positions[showing], land.horizon, W, H);
      }
      _raf = reduced ? null : requestAnimationFrame(frame);
    }

    // ── Rearranging ────────────────────────────────────────────────────────
    // Positions are stored 0-1 in field space, so an arrangement survives a
    // resize. Depth follows y, which means dragging a flower toward you also
    // makes it grow: the perspective does the work and it feels physical.
    let dragging = null;
    let dirty = false;
    let pressAt = null;      // where the press began, to tell a tap from a drag
    let hovered = null;      // flower under the cursor, for showing its name
    let selected = null;     // flower being named

    function fieldFromEvent(e) {
      const r = canvas.getBoundingClientRect();
      const H = canvas.clientHeight;
      const horizon = land ? land.horizon : H * 0.42;
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      return {
        x: Math.min(Math.max(px / canvas.clientWidth, 0), 1),
        y: Math.min(Math.max((py - horizon - 14) / (H - horizon - 40), 0), 1),
      };
    }

    function hit(e) {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const horizon = land ? land.horizon : H * 0.42;
      let best = null;
      let bestD = Infinity;
      // Nearest flower head wins, and nearer (larger) flowers win ties, so a
      // foreground bloom is never stolen by something small behind it.
      positions.forEach((pos, i) => {
        const fx = pos.x * W;
        const fy = horizon + 14 + pos.y * (H - horizon - 40);
        const petal = lerp(6, 30, pos.depth) * pos.size;
        const grab = Math.max(26, petal * 1.7);
        const d = Math.hypot(px - fx, py - fy);
        if (d < grab && d - pos.depth * 12 < bestD) {
          bestD = d - pos.depth * 12;
          best = i;
        }
      });
      return best;
    }

    function onDown(e) {
      const i = hit(e);
      if (i === null) {
        // A press on empty field puts the naming away.
        if (selected !== null) { selected = null; onSelect?.(null); }
        return;
      }
      pressAt = { x: e.clientX, y: e.clientY };
      dragging = i;
      positions[i].lifted = true;
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = "grabbing";
      e.preventDefault();
    }

    function onMove(e) {
      if (dragging === null) {
        hovered = hit(e);
        canvas.style.cursor = hovered !== null ? "grab" : "default";
        return;
      }
      const f = fieldFromEvent(e);
      const pos = positions[dragging];
      pos.x = f.x;
      pos.y = f.y;
      pos.depth = 0.28 + f.y * 0.72;   // nearer the viewer = bigger
      dirty = true;
      // Re-sort so a flower dragged forward draws in front of the ones behind it.
      order.sort((a, b) => positions[a].depth - positions[b].depth);
      e.preventDefault();
    }

    async function onUp(e) {
      if (dragging === null) return;
      const wasDragging = dragging;
      positions[dragging].lifted = false;
      dragging = null;
      canvas.style.cursor = "grab";

      // A press that barely moved is a tap, and a tap means "name this one".
      const moved = pressAt
        ? Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y)
        : 99;
      pressAt = null;
      if (!dirty && moved < 6) {
        selected = wasDragging;
        onSelect?.(flowers[wasDragging]);
        return;
      }

      if (!dirty) return;
      dirty = false;
      const body = {};
      flowers.forEach((f, i) => {
        body[f.id] = { x: positions[i].x, y: positions[i].y };
      });
      try {
        await fetch(`${window.BACKEND || "http://localhost:8000"}/garden/arrange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions: body }),
        });
      } catch {}
      // Keep the in-memory copy in step so reopening doesn't snap them back.
      flowers.forEach((f, i) => { f.x = positions[i].x; f.y = positions[i].y; });
    }

    canvas.onpointerdown = onDown;
    canvas.onpointermove = onMove;
    canvas.onpointerup = onUp;
    canvas.onpointercancel = onUp;
    canvas.style.touchAction = "none";   // let a finger drag a flower, not the page

    // So the caller can write a name back in without a full reload.
    _setLabel = (id, text) => {
      const f = flowers.find((x) => x.id === id);
      if (f) { if (text) f.label = text; else delete f.label; }
    };

    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(frame);
  }

  let _setLabel = null;

  function stop(canvas) {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    if (canvas) {
      canvas.onpointerdown = canvas.onpointermove = null;
      canvas.onpointerup = canvas.onpointercancel = null;
    }
  }

  window.PoppyGarden = { render, stop, setLabel: (id, text) => _setLabel?.(id, text) };
})();
