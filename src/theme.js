// Looks (themes). The chosen look is a preference on this device; CSS does the rest through
// attributes on <html>: data-look (palette + fonts), data-shape (corner and shadow family),
// data-mark (logo shape) and data-theme (light/dark, so form controls and scrollbars follow).
import { pref, setPref } from "./prefs.js";

export const LOOKS = [
  { id: "marigold",  name: "Marigold",    shape: "classic", mark: "tile",   swatch: ["#EEF1F4", "#E39A14", "#16202B"] },
  { id: "pastel",    name: "Soft Pastel", shape: "soft",    mark: "circle", swatch: ["#F3F0FA", "#6B4EE6", "#2D2A45"] },
  { id: "honey",     name: "Honey Drop",  shape: "soft",    mark: "circle", swatch: ["#F1F3F6", "#E39A14", "#1B2430"] },
  { id: "sky",       name: "Sky Kite",    shape: "round",   mark: "kite",   swatch: ["#EEF4FB", "#2563EB", "#172B4D"] },
  { id: "bubblegum", name: "Bubblegum",   shape: "soft",    mark: "blob",   swatch: ["#FBF0F5", "#C2187A", "#3A1F33"] },
  { id: "seaglass",  name: "Sea Glass",   shape: "line",    mark: "pebble", swatch: ["#EAF6F6", "#0B6FA4", "#12343B"] },
  { id: "night",     name: "Night Garden", shape: "soft",   mark: "circle", swatch: ["#1E1B2E", "#B9A5FF", "#F1EEFB"], dark: true },
];
const byId = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];
const darkMQ = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

/* The look actually shown: the chosen one, or Night Garden when "auto night" is on and the phone is dark. */
export function effectiveLook() {
  const chosen = byId(pref("look"));
  if (!chosen.dark && pref("autoNight") && darkMQ?.matches) return byId("night");
  return chosen;
}

export function applyLook() {
  const look = effectiveLook(), el = document.documentElement;
  el.dataset.look = look.id;
  el.dataset.shape = look.shape;
  el.dataset.mark = look.mark;
  // Marigold keeps its own dark version and follows the phone; every other look is fixed light or dark.
  if (look.id === "marigold") delete el.dataset.theme; else el.dataset.theme = look.dark ? "dark" : "light";
  // Browser and status-bar colour follow the page background.
  requestAnimationFrame(() => {
    const bg = getComputedStyle(el).getPropertyValue("--bg").trim();
    if (!bg) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.removeAttribute("media"); m.content = bg; });
  });
  return look;
}

export function setLook(id) { setPref("look", byId(id).id); return applyLook(); }
export function setAutoNight(on) { setPref("autoNight", !!on); return applyLook(); }
export function onSystemThemeChange(fn) { darkMQ?.addEventListener?.("change", () => { applyLook(); fn && fn(); }); }
