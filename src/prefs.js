// Small on-device preferences shared across modules.
const KEY = "dd.prefs";
const DEFAULTS = { alerts: true, sound: true, look: "marigold", autoNight: false, dictLang: "en-IN", splashSound: true, dashHidden: [], swipeTip: false, brief: true, briefAt: "08:00", focusLen: 25 };
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { cache = { ...DEFAULTS }; }
  return cache;
}
export const pref = (name) => load()[name];
export function setPref(name, value) {
  load()[name] = value;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage blocked: keep it for this session */ }
}
