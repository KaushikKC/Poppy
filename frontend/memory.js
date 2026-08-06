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
  let candidates = [];
  try {
    const res = await fetch(`${MEM_BACKEND}/memory/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    candidates = (await res.json()).candidates || [];
  } catch {
    return;
  }
  if (!candidates.length) return;
  renderConsent(candidates);
};

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
async function renderMemory() {
  let records = [];
  try {
    const res = await fetch(`${MEM_BACKEND}/memory`);
    records = (await res.json()).records || [];
  } catch {
    records = [];
  }

  memPanel.innerHTML = "";

  const title = document.createElement("div");
  title.className = "memory-title";
  title.textContent = records.length
    ? "What I remember about you"
    : "I don't remember anything yet";
  memPanel.appendChild(title);

  if (!records.length) return;

  // Group by category, in the canonical order.
  const order = ["profile", "goals", "people", "ongoing", "temporary", "sensitive"];
  const groups = {};
  records.forEach((r) => (groups[r.category] = groups[r.category] || []).push(r));

  order.filter((cat) => groups[cat]).forEach((cat) => {
    const header = document.createElement("div");
    header.className = "memory-cat";
    header.textContent = CATEGORY_LABELS[cat] || cat;
    memPanel.appendChild(header);

    const ul = document.createElement("ul");
    ul.className = "memory-list";
    groups[cat].forEach((r) => ul.appendChild(memoryRow(r)));
    memPanel.appendChild(ul);
  });

  const forget = document.createElement("button");
  forget.type = "button";
  forget.className = "memory-forget";
  forget.textContent = "Forget everything";
  forget.addEventListener("click", async () => {
    await fetch(`${MEM_BACKEND}/memory`, { method: "DELETE" }).catch(() => {});
    renderMemory();
  });
  memPanel.appendChild(forget);
}

function memoryRow(r) {
  const li = document.createElement("li");
  li.className = "memory-item";

  const text = document.createElement("span");
  text.className = "memory-text";
  text.textContent = r.text;

  const why = document.createElement("span");
  why.className = "memory-why";
  why.textContent = r.why ? "why?" : "";
  if (r.why) why.title = `You said: "${r.why}"`;

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "memory-edit";
  edit.title = "Edit";
  edit.textContent = "✎";
  edit.addEventListener("click", async () => {
    const next = prompt("Edit this memory:", r.text);
    if (next == null || !next.trim() || next.trim() === r.text) return;
    await fetch(`${MEM_BACKEND}/memory/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: next.trim() }),
    }).catch(() => {});
    // §2's IKEA effect: editing what she remembers is the highest-value quest in
    // the pool, so the close needs to know it happened.
    window._callEditedMemory = true;
    renderMemory();
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "memory-del";
  del.title = "Forget this";
  del.textContent = "✕";
  del.addEventListener("click", async () => {
    await fetch(`${MEM_BACKEND}/memory/${r.id}`, { method: "DELETE" }).catch(() => {});
    renderMemory();
  });

  li.append(text, why, edit, del);
  return li;
}

if (memBtn && memPanel) {
  memBtn.addEventListener("click", async () => {
    if (memPanel.classList.contains("hidden")) {
      await renderMemory();
      memPanel.classList.remove("hidden");
    } else {
      memPanel.classList.add("hidden");
    }
  });
}
