/**
 * Pronouns for whoever the companion actually is.
 *
 * Half the shipped cast is male — Leo, Kai, Ravi — and every line of chrome in
 * the app said "she". The gender is not a guess: it is on the character record,
 * and a character the user writes inherits it from the voice they picked
 * (custom_characters.py maps af_* to female and am_* to male).
 *
 * Copy lives in the markup as a template, with the she/her wording left in as
 * the visible default so the page still reads correctly on first paint and with
 * scripting off:
 *
 *   <span data-pro="Who {subj} is">Who she is</span>
 *   <input data-pro-placeholder="{Subj}'s a night owl…" placeholder="She's a night owl…">
 *   <button data-pro-label="What {subj} remembers about you" aria-label="…">
 *
 * Tokens: {subj} {Subj} {obj} {Obj} {poss} {Poss}. Only male and female exist,
 * because that is all the character model carries; anything else falls back to
 * female, which is what the app did unconditionally before this.
 */
(function () {
  const SETS = {
    female: { subj: "she", Subj: "She", obj: "her", Obj: "Her", poss: "her", Poss: "Her" },
    male:   { subj: "he",  Subj: "He",  obj: "him", Obj: "Him", poss: "his", Poss: "His" },
  };

  let current = SETS.female;

  function fill(tpl) {
    return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in current ? current[k] : m));
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-pro]").forEach((el) => {
      el.textContent = fill(el.dataset.pro);
    });
    scope.querySelectorAll("[data-pro-placeholder]").forEach((el) => {
      el.placeholder = fill(el.dataset.proPlaceholder);
    });
    // Title and aria-label together: these are the same sentence to a screen
    // reader and to a tooltip, and letting them drift apart is how one of them
    // ends up stale.
    scope.querySelectorAll("[data-pro-label]").forEach((el) => {
      const text = fill(el.dataset.proLabel);
      el.setAttribute("aria-label", text);
      if (el.hasAttribute("title")) el.setAttribute("title", text);
    });
  }

  window.Pronouns = {
    /** Called from flow.js whenever the companion (and so the gender) changes. */
    set(gender) {
      current = SETS[gender === "male" ? "male" : "female"];
      apply();
    },
    apply,
    fill,
    subj: () => current.subj,
    Subj: () => current.Subj,
    obj:  () => current.obj,
    Obj:  () => current.Obj,
    poss: () => current.poss,
    Poss: () => current.Poss,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply());
  } else {
    apply();
  }
})();
