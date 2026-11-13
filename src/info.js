// "How to read this" notes on Dashboard panels: hidden behind a small ⓘ until asked for.
const open = new Set();
export const infoBtn = (key) =>
  `<button class="info-b" data-info="${key}" aria-expanded="${open.has(key)}" aria-label="How to read this">i</button>`;
export const infoText = (key, html) => (open.has(key) ? `<p class="rag-hint info-t">${html}</p>` : "");
export function wireInfo(root, rerender) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-info]");
    if (!b) return;
    e.stopPropagation();
    const k = b.dataset.info;
    open.has(k) ? open.delete(k) : open.add(k);
    rerender();
  });
}
