// Android home-screen widget, "share to Done & Dusted" and long-press shortcuts.
// The widget shows what the app last sent it; ticks, shares and shortcuts queue up natively
// and the app picks them up here whenever it starts, resumes, or is pinged.
import { isNative, platform } from "./platform.js";

let W = null, timer = 0, lastSig = "";
const on = isNative && platform === "android";

export async function initWidget(h) {
  if (!on) return;
  const { registerPlugin, } = await import("@capacitor/core");
  W = registerPlugin("DDWidget");
  W.addListener("pending", () => drain(h)).catch(() => {});
  const { App } = await import("@capacitor/app");
  App.addListener("resume", () => drain(h));
  drain(h);
}

async function drain(h) {
  if (!W) return;
  let p;
  try { p = await W.takePending(); } catch { return; }
  (p.done || []).forEach((id) => h.done(id));
  (p.share || []).forEach((text) => h.share(text));
  (p.imports || []).forEach((code) => h.import(code));
  if (p.shortcut) h.shortcut(p.shortcut);
}

/* Tell the widget what to show: overdue first, then today's, by time. Debounced, and skipped when nothing changed. */
export function pushWidget(build) {
  if (!on) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!W) return;
    const d = build();
    const sig = JSON.stringify(d);
    if (sig === lastSig) return;
    lastSig = sig;
    W.update(d).catch(() => {});
  }, 400);
}
