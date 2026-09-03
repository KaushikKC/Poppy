// Memory as a product surface (POPPY_PRODUCT_PLAYBOOK §5):
//   1. Consent prompts — after a turn, "Want me to remember that?" with
//      Save / Edit / Not now / Never this kind. Nothing is stored without a tap.
//   2. The "What Poppy knows about you" screen — every fact, grouped by category,
//      each viewable / editable / deletable, each showing *why* it's remembered.
// Uniquely-named consts avoid clashing with chat.js globals.
const MEM_BACKEND = window.BACKEND || "http://localhost:8000";
const memBtn     = document.getElementById("memory-btn");
const memPanel   = document.getElementById("memory-panel");
const memConsent = document.getElementById("memory-consent");

const CATEGORY_LABELS = {
  profile: "About you",
  goals: "Your goals",
  people: "People in your life",
  ongoing: "What's going on",
  temporary: "For now",
  sensitive: "Sensitive",
};

// ── Consent prompts ───────────────────────────────────────────────────────────
let _consentTimer = null;

window.proposeMemory = async function proposeMemory(text) {
  if (!text || !memConsent) return;
  let saved = [];
  try {
    const res = await fetch(`${MEM_BACKEND}/memory/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    saved = (await res.json()).saved || [];
  } catch {
    return;
  }
  if (!saved.length) return;
  // The call's close reports this so the garden can bloom and the quest can
  // complete (RETENTION_ENGINE §3.1, §4.3). It used to be set only by the Save
  // button on the consent prompt, and that prompt is no longer how anything gets
  // kept — so saving a memory had become invisible to every other surface.
  window._callSavedMemory = true;
  // It is already kept. This is a receipt, not a request: a prompt in the middle
  // of a conversation interrupted the thing the app exists for, and anything not
  // tapped in time was lost.
  showSavedNotice(saved);
};

// What she just wrote down, shown briefly and then out of the way. Every item
// stays editable and deletable in the memory panel for as long as it exists.
function showSavedNotice(saved) {
  clearTimeout(_consentTimer);
  memConsent.innerHTML = "";
  const head = document.createElement("div");
  head.className = "consent-head";
  head.textContent = saved.length > 1 ? "I'll remember these" : "I'll remember that";
  memConsent.appendChild(head);

  saved.forEach((s) => {
    const row = document.createElement("div");
    row.className = "consent-row saved";
    const txt = document.createElement("span");
    txt.className = "consent-text";
    txt.textContent = s.text;
    // One tap to take it back, right where it is announced, so correcting her is
    // easier than letting something wrong stand.
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "consent-undo";
    undo.textContent = "Forget it";
    undo.addEventListener("click", async () => {
      await fetch(`${MEM_BACKEND}/memory/${s.id}`, { method: "DELETE" }).catch(() => {});
      row.remove();
      if (!memConsent.querySelector(".consent-row")) dismissConsent();
    });
    row.append(txt, undo);
    memConsent.appendChild(row);
  });

  memConsent.classList.remove("hidden");
  _consentTimer = setTimeout(dismissConsent, 6000);
}

function renderConsent(candidates) {
  memConsent.innerHTML = "";
  const head = document.createElement("div");
  head.className = "consent-head";
  head.textContent = candidates.length > 1 ? "Want me to remember these?" : "Want me to remember that?";
  memConsent.appendChild(head);

  candidates.forEach((c) => memConsent.appendChild(consentRow(c)));
  memConsent.classList.remove("hidden");

  clearTimeout(_consentTimer);
  _consentTimer = setTimeout(dismissConsent, 22000);
}

function consentRow(c) {
  const row = document.createElement("div");
  row.className = "consent-row";

  const text = document.createElement("input");
  text.className = "consent-text";
  text.type = "text";
  text.value = c.text;
  text.readOnly = true;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "consent-save";
  save.textContent = "Save";
  save.addEventListener("click", async () => {
    await fetch(`${MEM_BACKEND}/memory/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.value.trim(), category: c.category, why: c.why }),
    }).catch(() => {});
    // The call's close reports this so the garden can bloom and the quest can
    // complete (RETENTION_ENGINE §3.1, §4.3). Without it, saving a memory is
    // invisible to every other surface.
    window._callSavedMemory = true;
    closeRow(row);
  });

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "consent-edit";
  edit.textContent = "Edit";
  edit.title = "Edit before saving";
  edit.addEventListener("click", () => {
    text.readOnly = false;
    text.focus();
    text.select();
  });

  const not = document.createElement("button");
  not.type = "button";
  not.className = "consent-dismiss";
  not.textContent = "Not now";
  not.addEventListener("click", () => closeRow(row));

  const never = document.createElement("button");
  never.type = "button";
  never.className = "consent-never";
  never.textContent = "Never this kind";
  never.title = `Stop suggesting "${CATEGORY_LABELS[c.category] || c.category}" memories`;
  never.addEventListener("click", async () => {
    await fetch(`${MEM_BACKEND}/memory/suppress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: c.category }),
    }).catch(() => {});
    closeRow(row);
  });

  row.append(text, save, edit, not, never);
  return row;
}

function closeRow(row) {
  row.remove();
  if (!memConsent.querySelector(".consent-row")) dismissConsent();
}

function dismissConsent() {
  clearTimeout(_consentTimer);
  memConsent.classList.add("hidden");
  memConsent.innerHTML = "";
}

// ── "What Poppy knows about you" screen ────────────────────────────────────────
/**
 * What she knows — the design system's Memory Vault (screens/memory.jsx).
 *
 * "Not a settings page, a headline feature." Every competitor in this category gets
 * complaints about memory, so ours is the opposite of a hidden store: a count you own,
 * category rails you can filter by, temporary memories drawn as temporary, and a
 * receipt behind every card saying why she has it.
 */
let _memFilter = "all";

/** Fill pronoun tokens, or fall back to she if the module has not loaded. */
function pro(tpl) {
  return window.Pronouns
    ? window.Pronouns.fill(tpl)
    : tpl.replace(/\{Subj\}/g, "She").replace(/\{subj\}/g, "she")
         .replace(/\{Obj\}/g, "Her").replace(/\{obj\}/g, "her")
         .replace(/\{Poss\}/g, "Her").replace(/\{poss\}/g, "her");
}

async function renderMemory() {
  let records = [];
  try {
    const res = await fetch(`${MEM_BACKEND}/memory`);
    records = (await res.json()).records || [];
  } catch {
    records = [];
  }

  memPanel.innerHTML = "";

  const nav = document.createElement("div");
  nav.className = "navbar mem-nav";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "iconbtn mem-back";
  back.setAttribute("aria-label", "Back");
  back.textContent = "‹";
  back.addEventListener("click", () => {
    memPanel.classList.add("hidden");
    document.body.classList.remove("mem-open");
  });
  const heading = document.createElement("span");
  heading.className = "t-h2";
  heading.textContent = pro("What {subj} knows");
  nav.append(back, heading);
  memPanel.appendChild(nav);

  const body = document.createElement("div");
  body.className = "mem-body";
  memPanel.appendChild(body);

  // The count, owned. "41 things, all yours" is the whole argument of this screen in
  // one line: it is a number you can act on, not a number kept about you.
  const summary = document.createElement("div");
  summary.className = "glass pad4 row between mem-summary";
  const n = records.length;
  summary.innerHTML =
    '<span class="stack gap1">' +
      `<span class="t-sm semi tnum">${n ? `${n} ${n === 1 ? "thing" : "things"}, all yours` : "Nothing yet"}</span>` +
      // Through Pronouns like the heading above it. These two were written as "she"
      // and stayed that way under a male character: "What he knows" sat directly above
      // "She'll remember things as you talk."
      `<span class="t-xs muted">${n ? pro("Edit or delete any of them. {Subj} won't argue.") : pro("{Subj}'ll remember things as you talk.")}</span>` +
    "</span>";
  body.appendChild(summary);

  // The rules she has been told. A rule you cannot see or undo is worse than no rule.
  await renderRules(body);

  // Forget everything. The route existed from the start and nothing ever called it,
  // so a memory that was wrong could be edited one at a time and never cleared. That
  // matters more than tidiness: an early version of the extractor saved facts in the
  // first person — "My name is not John" — and she read "my" as her own, then spent
  // every later conversation confused about who John was. There was no way out of it
  // from inside the app.
  if (records.length) {
    const wipe = document.createElement("button");
    wipe.type = "button";
    wipe.className = "btn btn--ghost btn--block mem-forget";
    wipe.textContent = "Forget everything";
    wipe.addEventListener("click", async () => {
      // Two taps, because this is not undoable and a mis-tap costs the lot.
      if (wipe.dataset.armed !== "1") {
        wipe.dataset.armed = "1";
        wipe.textContent = "Tap again to forget all " + records.length;
        setTimeout(() => {
          if (wipe.dataset.armed === "1") {
            wipe.dataset.armed = "";
            wipe.textContent = "Forget everything";
          }
        }, 4000);
        return;
      }
      try {
        await fetch(`${MEM_BACKEND}/memory`, { method: "DELETE" });
      } catch {
        // Offline or the route is gone; the re-render below will show the truth.
      }
      renderMemory();
    });
    body.appendChild(wipe);
  }

  if (!records.length) return;

  const order = ["profile", "goals", "people", "ongoing", "temporary", "sensitive"];
  const groups = {};
  records.forEach((r) => (groups[r.category] = groups[r.category] || []).push(r));

  // Filter chips. Only categories that actually have something in them: a filter that
  // leads to an empty screen is a filter that should not have been offered.
  const chips = document.createElement("div");
  chips.className = "row wrap gap2 mem-chips";
  const present = ["all", ...order.filter((c) => groups[c])];
  present.forEach((cat) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip chip--tiny" + (cat === _memFilter ? " chip--on" : "");
    chip.textContent = cat === "all" ? "All" : CATEGORY_LABELS[cat] || cat;
    chip.addEventListener("click", () => {
      _memFilter = cat;
      renderMemory();
    });
    chips.appendChild(chip);
  });
  body.appendChild(chips);

  order
    .filter((cat) => groups[cat] && (_memFilter === "all" || _memFilter === cat))
    .forEach((cat) => {
      const section = document.createElement("div");
      section.className = "stack gap2 mem-section";
      const label = document.createElement("span");
      label.className = "t-label muted";
      label.textContent = CATEGORY_LABELS[cat] || cat;
      section.appendChild(label);
      groups[cat].forEach((r) => section.appendChild(memoryCard(r, cat)));
      body.appendChild(section);
    });

  const forget = document.createElement("button");
  forget.type = "button";
  forget.className = "memory-forget";
  forget.textContent = "Forget everything";
  forget.addEventListener("click", async () => {
    await fetch(`${MEM_BACKEND}/memory`, { method: "DELETE" }).catch(() => {});
    renderMemory();
  });
  body.appendChild(forget);
}

/** How long ago, in the words a person would use. */
function when(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "saved today";
  if (days === 1) return "saved yesterday";
  if (days < 30) return `saved ${days} days ago`;
  const months = Math.round(days / 30);
  return `saved ${months} ${months === 1 ? "month" : "months"} ago`;
}

function memoryCard(r, cat) {
  const card = document.createElement("div");
  // The rail carries the category and a dashed one means temporary, so what kind of
  // memory this is reads before the text does.
  card.className = `memcard memcard--${cat} stack gap2`;
  if (cat === "temporary" || r.expires_at) card.classList.add("memcard--temp");

  const text = document.createElement("p");
  text.className = "t-body";
  text.textContent = r.text;

  const meta = document.createElement("span");
  meta.className = "t-xs muted tnum mem-meta";
  meta.textContent = r.expires_at
    ? `expires ${new Date(r.expires_at).toLocaleDateString()}`
    : when(r.created_at);

  const actions = document.createElement("div");
  actions.className = "mem-actions";

  // The receipt. "Why she remembers" is a whole screen in the design system, and the
  // thing that screen exists to show is this: the words you actually said. A callback
  // reads as a gift rather than as surveillance only when the provenance is right here.
  if (r.why) {
    const why = document.createElement("button");
    why.type = "button";
    why.className = "chip chip--tiny";
    why.textContent = pro("Why {subj} has this");
    const receipt = document.createElement("p");
    receipt.className = "mem-receipt hidden";
    receipt.textContent = `You said: "${r.why}"`;
    why.addEventListener("click", () => {
      const shown = !receipt.classList.toggle("hidden");
      why.textContent = shown ? "Hide" : pro("Why {subj} has this");
    });
    actions.appendChild(why);
    card.append(text, meta, actions, receipt);
  } else {
    card.append(text, meta, actions);
  }

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "chip chip--tiny";
  edit.textContent = "Edit";
  edit.addEventListener("click", async () => {
    const next = prompt("Edit this memory:", r.text);
    if (next == null || !next.trim() || next.trim() === r.text) return;
    await fetch(`${MEM_BACKEND}/memory/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: next.trim() }),
    }).catch(() => {});
    // §2's IKEA effect: editing what she remembers is the highest-value quest in the
    // pool, so the close needs to know it happened.
    window._callEditedMemory = true;
    renderMemory();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "chip chip--tiny mem-del";
  del.textContent = "Forget";
  del.addEventListener("click", async () => {
    await fetch(`${MEM_BACKEND}/memory/${r.id}`, { method: "DELETE" }).catch(() => {});
    renderMemory();
  });

  actions.append(edit, del);
  return card;
}

if (memBtn && memPanel) {
  memBtn.addEventListener("click", async () => {
    if (memPanel.classList.contains("hidden")) {
      await renderMemory();
      memPanel.classList.remove("hidden");
      // The orb lives in the chat header at a z-index of its own, so it drew on top
      // of a screen that covers the chat. It belongs to the conversation, not here.
      document.body.classList.add("mem-open");
    } else {
      memPanel.classList.add("hidden");
      document.body.classList.remove("mem-open");
    }
  });
}


// The rules the user has set for her: never raise this, always ask about that.
// Set by saying so in a call ("don't ask me about my dad"); shown here so they
// can be checked and undone.
async function renderRules(host) {
  let rules = { avoid: [], always: [] };
  try {
    rules = await (await fetch(`${MEM_BACKEND}/boundaries`)).json();
  } catch {}
  if (!rules.avoid?.length && !rules.always?.length) return;

  const wrap = document.createElement("div");
  wrap.className = "memory-rules";

  [["avoid", "Never brings up"], ["always", "Always asks about"]].forEach(([kind, heading]) => {
    const list = rules[kind] || [];
    if (!list.length) return;
    const h = document.createElement("div");
    h.className = "memory-title";
    h.textContent = heading;
    wrap.appendChild(h);
    list.forEach((topic) => {
      const row = document.createElement("div");
      row.className = "memory-rule";
      const txt = document.createElement("span");
      txt.textContent = topic;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "memory-forget";
      del.title = "Remove this rule";
      del.textContent = "×";
      del.addEventListener("click", async () => {
        await fetch(`${MEM_BACKEND}/boundaries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, topic, remove: true }),
        }).catch(() => {});
        renderMemory();
      });
      row.append(txt, del);
      wrap.appendChild(row);
    });
  });
  (host || memPanel).appendChild(wrap);
}
