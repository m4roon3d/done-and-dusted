// Reminders.
// Android / iOS: real scheduled notifications at each due time, even when the app is closed,
//               with "Done ✓" and "+1 hour" buttons on the notification.
// Web:          a browser notification when a task comes due while the app is open in a tab.
import { isNative, platform } from "./platform.js";
import { pref } from "./prefs.js";
import { briefText } from "./core.js";
import { holidayOn } from "./holidays.js";

let LN = null;
const MAX_PENDING = 60; // iOS keeps at most 64 pending notifications per app

// Stable 31-bit id per task + due time, so rescheduling replaces rather than duplicates.
const idFor = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 2147480000) + 1; };

export async function initNotifications(onAction) {
  if (!isNative) return;
  ({ LocalNotifications: LN } = await import("@capacitor/local-notifications"));
  if (platform === "android") {
    await LN.createChannel({
      id: "due", name: "Task reminders", description: "Alerts when a task is due",
      importance: 5, visibility: 1, vibration: true, lights: true, lightColor: "#E39A14",
    }).catch(() => {});
    await LN.createChannel({ id: "brief", name: "Morning brief", description: "What's on today, once each morning", importance: 3, visibility: 1 }).catch(() => {});
    await LN.createChannel({ id: "focus", name: "Focus timer", description: "When a focus session ends", importance: 4, visibility: 1, vibration: true }).catch(() => {});
  }
  await LN.registerActionTypes({
    types: [{ id: "TASK_DUE", actions: [
      { id: "done", title: "Done ✓" },
      { id: "snooze", title: "+1 hour" },
    ] }, { id: "BRIEF", actions: [{ id: "plan", title: "Plan my day" }] }],
  }).catch(() => {});
  LN.addListener("localNotificationActionPerformed", (a) => {
    const ex = a?.notification?.extra || {};
    if (ex.brief) return onAction("brief");
    if (ex.focus) return onAction("focus");
    if (ex.taskId) onAction(a.actionId, ex.taskId); // "done" | "snooze" | "tap"
  });
}

/* "granted" | "denied" | "prompt" | "unsupported" */
export async function permissionState() {
  if (isNative) {
    if (!LN) return "unsupported";
    try { return (await LN.checkPermissions()).display.replace("prompt-with-rationale", "prompt"); } catch { return "unsupported"; }
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

export async function requestPermission() {
  if (isNative) {
    if (!LN) return "unsupported";
    const r = await LN.requestPermissions();
    return r.display;
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

/* Android 12+: alarms at the exact minute need the "Alarms & reminders" setting. */
export async function exactAlarmState() {
  if (platform !== "android" || !LN?.checkExactNotificationSetting) return "granted";
  try { return (await LN.checkExactNotificationSetting()).exact_alarm; } catch { return "granted"; }
}
export async function openExactAlarmSetting() {
  try { return (await LN.changeExactNotificationSetting()).exact_alarm; } catch { return "granted"; }
}

/* Keep the phone's scheduled reminders in step with the task list. Debounced; cheap to call often. */
let timer = null, lastSig = "";
export function scheduleSync(getTasks) {
  if (!isNative) return;
  clearTimeout(timer);
  timer = setTimeout(() => sync(getTasks()).catch(() => {}), 500);
}
export async function sync(tasks, force = false) {
  if (!LN) return 0;
  if ((await permissionState()) !== "granted") return 0;
  if (!pref("alerts")) { // alerts turned off in Settings: clear anything already scheduled
    lastSig = "off";
    const p = await LN.getPending();
    if (p.notifications.length) await LN.cancel({ notifications: p.notifications.map((n) => ({ id: n.id })) });
    return 0;
  }
  const now = Date.now();
  const up = tasks
    .filter((t) => !t.done && t.due && t.due > now + 5000 && t.src !== "example")
    .sort((a, b) => a.due - b.due)
    .slice(0, MAX_PENDING);
  const briefs = briefPlan(tasks, now);
  const sig = JSON.stringify([up.map((t) => [t.id, t.due, t.title, t.cat]), briefs]);
  if (!force && sig === lastSig) return up.length;
  lastSig = sig;
  const pending = await LN.getPending();
  const old = pending.notifications.filter((n) => n.id !== FOCUS_ID); // a running focus timer stays
  if (old.length) await LN.cancel({ notifications: old.map((n) => ({ id: n.id })) });
  if (!up.length && !briefs.length) return 0;
  await LN.schedule({
    notifications: [...briefs.map((b, i) => ({
      id: BRIEF_ID + i, title: "☀️ Good morning" + (b.hd ? " · Happy " + b.hd : ""), body: b.text,
      schedule: { at: new Date(b.at), allowWhileIdle: true }, channelId: "brief", actionTypeId: "BRIEF",
      smallIcon: "ic_stat_dd", iconColor: "#E39A14", extra: { brief: 1 },
    })), ...up.map((t) => ({
      id: idFor(t.id + ":" + t.due),
      title: "🔔 " + t.title,
      body: `${t.cat} · due now${t.pri ? " · Important" : ""}`,
      schedule: { at: new Date(t.due), allowWhileIdle: true },
      channelId: "due",
      actionTypeId: "TASK_DUE",
      smallIcon: "ic_stat_dd",
      iconColor: "#E39A14",
      extra: { taskId: t.id },
    }))],
  });
  return up.length;
}

/* The morning brief for each of the next 7 mornings, worked out from the tasks as they stand now
   (re-done whenever tasks change). Mornings with nothing due or overdue get no brief. */
const BRIEF_ID = 2147480001, FOCUS_ID = 2147480100;
function briefPlan(tasks, now) {
  if (!pref("brief")) return [];
  const [h, m] = String(pref("briefAt") || "08:00").split(":").map(Number);
  const open = tasks.filter((t) => !t.done && t.due && t.src !== "example"), out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    const s = d.getTime(), at = new Date(s); at.setHours(h, m, 0, 0);
    if (at.getTime() <= now + 5000) continue;
    const e = new Date(s); e.setDate(e.getDate() + 1);
    const text = briefText(open.filter((t) => t.due >= s && t.due < e.getTime()), open.filter((t) => t.due < s));
    const hd = holidayOn(at.getTime());
    if (text || hd) out.push({ at: at.getTime(), text: text || "Nothing due. Enjoy the day.", hd: hd ? hd.name : "" });
  }
  return out;
}

/* Focus timer: a notification when it ends, in case the phone is locked by then. Pass null to cancel. */
export async function focusAlarm(at, title) {
  if (!LN) return;
  try {
    await LN.cancel({ notifications: [{ id: FOCUS_ID }] });
    if (at && (await permissionState()) === "granted")
      await LN.schedule({ notifications: [{ id: FOCUS_ID, title: "⏱ Focus time's up", body: title || "Done, or five more minutes?",
        schedule: { at: new Date(at), allowWhileIdle: true }, channelId: "focus", smallIcon: "ic_stat_dd", iconColor: "#E39A14", extra: { focus: 1 } }] });
  } catch {}
}

/* Web: show a system notification if the tab is in the background when something comes due. */
export async function webNotify(t) {
  if (!pref("alerts") || isNative || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  const opts = { body: `${t.cat} · due now`, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "due-" + t.id, data: { taskId: t.id } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification("🔔 " + t.title, opts);
  } catch {}
  try { new Notification("🔔 " + t.title, opts); } catch {}
}
