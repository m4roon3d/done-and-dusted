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
    let perm;
    try { perm = await SR.requestPermissions(); } catch { end("error"); return { stop() {} }; }
    if (perm.speechRecognition !== "granted") { end("denied"); return { stop() {} }; }
    // Android sends "stopped" (end of speech) BEFORE the final words arrive, and swallows errors such as
    // "no speech heard". So: after "stopped" or a tap on Stop, wait a moment for the last words, and keep
    // a watchdog so the panel never hangs on "Listening…".
    let heard = "", finished = false, stopping = null, settleT = 0, guardT = 0;
    const handles = [];
    const finish = (why) => {
      if (finished) return; finished = true;
      clearTimeout(settleT); clearTimeout(guardT);
      handles.splice(0).forEach((h) => h.remove());
      SR.stop().catch(() => {});
      end(why);
    };
    const settle = (ms) => { clearTimeout(settleT); settleT = setTimeout(() => finish(stopping || "silence"), ms); };
    const guard = () => { clearTimeout(guardT); guardT = setTimeout(() => finish(stopping || "silence"), 9000); };
    handles.push(await SR.addListener("partialResults", (d) => {
      const m = (d.matches && d.matches[0]) || "";
      if (m) { heard = m; onText(heard); }
      guard();
      if (stopping) settle(500); // the final result after stop: wrap up quickly
    }));
    handles.push(await SR.addListener("listeningState", (d) => {
      guard();
      if (d.status === "stopped") { stopping = stopping || "silence"; settle(1500); }
    }));
    guard();
    try {
      await SR.start({ language: lang, partialResults: true, popup: false, maxResults: 1 });
    } catch { finish("error"); }
    return { stop() { if (finished) return; stopping = "stopped"; SR.stop().catch(() => {}); settle(1500); } };
  }

  const rec = new WebSR();
  rec.lang = lang; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    // rebuild from every result each time: Chrome on Android resends earlier words, so appending duplicates them
    let text = "";
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      if (!t) continue;
      if (text && t.toLowerCase().startsWith(text.toLowerCase())) text = t; // a longer copy of what came before
      else if (text && text.toLowerCase().startsWith(t.toLowerCase())) continue; // a shorter copy: already have it
      else if (!text.toLowerCase().endsWith(t.toLowerCase())) text += " " + t;
    }
    onText(text.replace(/\s+/g, " ").trim());
  };
  rec.onerror = (e) => end(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "no-speech" ? "silence" : "error");
  rec.onend = () => end("silence");
  try { rec.start(); } catch { end("error"); }
  return { stop() { try { rec.stop(); } catch {} end("stopped"); } };
}
