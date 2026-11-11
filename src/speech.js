// Dictation: speech to text.
// Android / iOS app: the phone's own speech recogniser, through a Capacitor plugin.
// Web: the browser's speech recognition (Chrome, Edge, Safari). Other browsers: not available.
import { isNative } from "./platform.js";

const WebSR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
let SR = null; // native plugin, loaded on first use

export async function dictationSupported() {
  if (isNative) {
    try {
      if (!SR) ({ SpeechRecognition: SR } = await import("@capacitor-community/speech-recognition"));
      return (await SR.available()).available;
    } catch { return false; }
  }
  return !!WebSR;
}

/* Starts listening. Calls onText(fullTranscript) as words arrive, onEnd(reason) once when it stops.
   reason: "stopped" | "silence" | "denied" | "error". Returns { stop() }. */
export async function startDictation({ lang = "en-IN", onText, onEnd }) {
  let ended = false;
  const end = (why) => { if (!ended) { ended = true; onEnd(why); } };

  if (isNative) {
    const perm = await SR.requestPermissions();
    if (perm.speechRecognition !== "granted") { end("denied"); return { stop() {} }; }
    let base = "", current = "";
    const handles = [];
    const cleanup = () => handles.splice(0).forEach((h) => h.remove());
    handles.push(await SR.addListener("partialResults", (d) => {
      current = (d.matches && d.matches[0]) || "";
      onText((base + " " + current).trim());
    }));
    // The phone stops after a short silence. Keep what was said and let the person tap the mic to carry on.
    handles.push(await SR.addListener("listeningState", (d) => {
      if (d.status === "stopped") { base = (base + " " + current).trim(); current = ""; cleanup(); end("silence"); }
    }));
    try {
      await SR.start({ language: lang, partialResults: true, popup: false, maxResults: 1 });
    } catch { cleanup(); end("error"); }
    return { stop() { SR.stop().catch(() => {}); cleanup(); end("stopped"); } };
  }

  const rec = new WebSR();
  rec.lang = lang; rec.continuous = true; rec.interimResults = true;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += " " + r[0].transcript; else interim += r[0].transcript;
    }
    onText((finalText + " " + interim).replace(/\s+/g, " ").trim());
  };
  rec.onerror = (e) => end(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "no-speech" ? "silence" : "error");
  rec.onend = () => end("silence");
  try { rec.start(); } catch { end("error"); }
  return { stop() { try { rec.stop(); } catch {} end("stopped"); } };
}
