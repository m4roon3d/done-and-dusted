// Everything that differs between the web app and the native (Android / iOS) app.
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "web" | "android" | "ios"

/* Save a file the person keeps: a backup or a calendar file.
   Native: write to the app cache and open the share sheet (Save to Files / Drive / WhatsApp…).
   Web: share sheet on phones when available, otherwise a normal download. */
export async function saveFile(filename, text, mime) {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const r = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: filename, files: [r.uri], dialogTitle: "Save or send " + filename });
      return "shared";
    } catch (e) {
      if (/cancel/i.test(e?.message || "")) return "cancelled";
      throw e;
    }
  }
  const blob = new Blob([text], { type: mime });
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile && navigator.canShare) {
    try {
      const f = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: filename }); return "shared"; }
    } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return "saved";
}

/* Light haptic taps on phones; silently nothing on the web. */
let H = null;
export async function haptic(kind = "light") {
  if (!isNative) return;
  try {
    if (!H) H = await import("@capacitor/haptics");
    if (kind === "success") await H.Haptics.notification({ type: H.NotificationType.Success });
    else if (kind === "warn") await H.Haptics.notification({ type: H.NotificationType.Warning });
    else await H.Haptics.impact({ style: kind === "medium" ? H.ImpactStyle.Medium : H.ImpactStyle.Light });
  } catch { /* no haptics on this device */ }
}

/* Native shell: status bar follows the theme, splash hides once drawn, Android back button behaves. */
export async function initNativeShell({ onBack }) {
  if (!isNative) return;
  try { await SystemBars.setStyle({ style: SystemBarsStyle.Default }); } catch {}
  try { const { SplashScreen } = await import("@capacitor/splash-screen"); await SplashScreen.hide({ fadeOutDuration: 250 }); } catch {}
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => { if (!onBack()) App.minimizeApp(); });
    return App;
  } catch {}
}

export async function onResume(fn) {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");
  App.addListener("resume", fn);
}
