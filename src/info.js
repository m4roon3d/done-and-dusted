// Hints: explanations live behind a small ⓘ and open as a bubble next to it, so screens stay quiet.
// infoBtn(key) draws the ⓘ; infoText(key, html) or hint(html) says what it explains.
const texts = new Map();
const ids = new Map();
export const infoBtn = (key, html) => {
  if (html) texts.set(key, html);
  return `<button type="button" class="info-b" data-info="${key}" aria-expanded="false" aria-label="What's this?">i</button>`;
};
export const infoText = (key, html) => { texts.set(key, html); return ""; };
// a hint for one spot, keyed by its own text so redraws reuse it
export const hint = (html) => {
  let k = ids.get(html);
  if (!k) { k = "h" + ids.size; ids.set(html, k); texts.set(k, html); }
  return infoBtn(k);
};
let pop = null, owner = null;
function hide() {
  if (!pop) return;
  owner?.setAttribute("aria-expanded", "false");
  pop.remove(); pop = null; owner = null;
}
function show(btn) {
  const html = texts.get(btn.dataset.info);
  if (!html) return;
  hide();
  owner = btn; btn.setAttribute("aria-expanded", "true");
  pop = document.createElement("div");
  pop.className = "hint-pop"; pop.setAttribute("role", "tooltip");
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), w = Math.min(290, innerWidth - 24), h = pop.offsetHeight;
  pop.style.width = w + "px";
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 10 + pop.offsetHeight < innerHeight - 8;
  pop.style.left = left + "px";
  pop.style.top = (below ? r.bottom + 10 : r.top - 10 - pop.offsetHeight) + "px";
  pop.style.setProperty("--ax", (r.left + r.width / 2 - left) + "px");
  pop.classList.add(below ? "below" : "above");
  void h;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-info]");
  if (b) { e.preventDefault(); e.stopPropagation(); owner === b ? hide() : show(b); return; }
  if (pop && !pop.contains(e.target)) hide();
}, true);
addEventListener("scroll", hide, true);
addEventListener("resize", hide);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
// kept so older callers still work; the bubble needs no per-screen wiring
export function wireInfo() {}
