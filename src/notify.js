// Reminders.
// Android / iOS: real scheduled notifications at each due time, even when the app is closed,
//               with "Done ✓" and "+1 hour" buttons on the notification.
// Web:          a browser notification when a task comes due while the app is open in a tab.
import { isNative, platform } from "./platform.js";

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
  }
  await LN.registerActionTypes({
    types: [{ id: "TASK_DUE", actions: [
      { id: "done", title: "Done ✓" },
      { id: "snooze", title: "+1 hour" },
    ] }],
  }).catch(() => {});
  LN.addListener("localNotificationActionPerformed", (a) => {
    const id = a?.notification?.extra?.taskId;
    if (id) onAction(a.actionId, id); // "done" | "snooze" | "tap"
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
  const now = Date.now();
  const up = tasks
    .filter((t) => !t.done && t.due && t.due > now + 5000 && t.src !== "example")
    .sort((a, b) => a.due - b.due)
    .slice(0, MAX_PENDING);
  const sig = JSON.stringify(up.map((t) => [t.id, t.due, t.title, t.cat]));
  if (!force && sig === lastSig) return up.length;
  lastSig = sig;
  const pending = await LN.getPending();
  if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!up.length) return 0;
  await LN.schedule({
    notifications: up.map((t) => ({
      id: idFor(t.id + ":" + t.due),
      title: "🔔 " + t.title,
      body: `${t.cat} · due now${t.pri ? " · Important" : ""}`,
      schedule: { at: new Date(t.due), allowWhileIdle: true },
      channelId: "due",
      actionTypeId: "TASK_DUE",
      smallIcon: "ic_stat_dd",
      iconColor: "#E39A14",
      extra: { taskId: t.id },
    })),
  });
  return up.length;
}

/* Web: show a system notification if the tab is in the background when something comes due. */
export async function webNotify(t) {
  if (isNative || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  const opts = { body: `${t.cat} · due now`, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "due-" + t.id, data: { taskId: t.id } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification("🔔 " + t.title, opts);
  } catch {}
  try { new Notification("🔔 " + t.title, opts); } catch {}
}
