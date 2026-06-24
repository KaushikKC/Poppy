const _BACKEND = window.BACKEND || "http://localhost:8000";
const _STORAGE_KEY = "pc_persona";

const PersonaPicker = (() => {
  let _personas = [];
  let _current  = localStorage.getItem(_STORAGE_KEY) || "friendly";
  const _callbacks = [];

  function _emit(key) {
    const p = _personas.find(p => p.key === key);
    if (p) _callbacks.forEach(cb => cb(key, p));
  }

  let _container = null;

  function _select(key) {
    if (key === _current || !_personas.find(p => p.key === key)) return;
    _current = key;
    localStorage.setItem(_STORAGE_KEY, _current);
    if (_container) {
      _container.querySelectorAll(".persona-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.key === _current);
      });
    }
    _emit(_current);
  }

  function _render(container) {
    container.innerHTML = "";
    _personas.forEach(p => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "persona-btn" + (p.key === _current ? " active" : "");
      btn.dataset.key = p.key;
      btn.style.setProperty("--persona-color", p.avatar.outline);
      btn.title = p.description;
      btn.textContent = p.name;
      btn.addEventListener("click", () => _select(p.key));
      container.appendChild(btn);
    });
  }

  async function init() {
    const container = document.getElementById("persona-picker");
    if (!container) return;
    _container = container;

    try {
      const res = await fetch(`${_BACKEND}/personas`);
      _personas = await res.json();
    } catch {
      _personas = [{ key: "friendly", name: "Friendly", description: "", avatar: { outline: "#7c6ef0" } }];
    }

    // ensure stored key is valid
    if (!_personas.find(p => p.key === _current)) {
      _current = _personas[0]?.key || "friendly";
    }

    _render(container);
    // fire callbacks after first render so listeners can set initial colors
    _emit(_current);
  }

  return {
    init,
    current: () => _current,
    select: _select,
    name: (key) => (_personas.find(p => p.key === key) || {}).name || key,
    onChange: (cb) => _callbacks.push(cb),
  };
})();

window.PersonaPicker = PersonaPicker;
