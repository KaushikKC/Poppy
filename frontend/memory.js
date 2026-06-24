// Memory panel — view and forget what the companion remembers about you.
// Uses uniquely-named consts to avoid clashing with chat.js globals.
const MEM_BACKEND = window.BACKEND || "http://localhost:8000";
const memBtn   = document.getElementById("memory-btn");
const memPanel = document.getElementById("memory-panel");

async function renderMemory() {
  let facts = [];
  try {
    const res = await fetch(`${MEM_BACKEND}/memory`);
    facts = (await res.json()).facts || [];
  } catch {
    facts = [];
  }

  memPanel.innerHTML = "";

  const title = document.createElement("div");
  title.className = "memory-title";
  title.textContent = facts.length ? "What I remember about you" : "I don't remember anything yet";
  memPanel.appendChild(title);

  if (facts.length) {
    const ul = document.createElement("ul");
    ul.className = "memory-list";
    facts.forEach(f => {
      const li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });
    memPanel.appendChild(ul);

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
