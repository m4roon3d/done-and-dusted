// Settings sheet (reminders, backup & restore, storage) and the Dashboard's reminders panel.
import { isNative, platform, saveFile, haptic } from "./platform.js";
import { permissionState, requestPermission, exactAlarmState, openExactAlarmSetting, sync } from "./notify.js";
import { makeBackup, readBackup, restore, countTasks, isPersisted, requestPersist } from "./store.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const VERSION = "1.0.0";
let app = null;          // bridge into main.js
let perm = "prompt", exact = "granted";
let pendingRestore = null;

async function refreshPerm() {
  perm = await permissionState();
  exact = await exactAlarmState();
}

/* ---------- Dashboard panel ---------- */
export function remindersPanelHTML(open, now) {
  const upcoming = open.filter((t) => t.due && t.due > now).length;
  if (isNative) {
    const on = perm === "granted";
    return `<h4>Phone reminders <small>${on ? "on · work even when the app is closed" : "off"}</small></h4>
      <p class="rem-p">${on
        ? `You'll get a notification at each due time, with <b>Done ✓</b> and <b>+1 hour</b> buttons. ${upcoming} upcoming task${upcoming === 1 ? " is" : "s are"} scheduled.`
        : "Turn on notifications so the phone can alert you at each due time, even when the app is closed."}</p>
      ${on && exact !== "granted" && platform === "android" ? `<p class="rem-p warnline">Alerts may arrive a few minutes late. Allow <b>Alarms &amp; reminders</b> for exact times.</p><button class="btn" id="remExact">Allow exact alarms</button>` : ""}
      ${on ? "" : `<button class="btn pri" id="remOn">Turn on reminders</button>`}`;
  }
  const on = perm === "granted";
  return `<h4>Reminders <small>${on ? "browser notifications on" : "in-app chime"}</small></h4>
    <p class="rem-p">While the app is open, a due task chimes and pops up${on ? ", and shows a notification if this tab is in the background" : ""}. For alerts when it's closed, install the Android app, or send upcoming tasks to your calendar with a 15-minute alert each.</p>
    <div class="acts">${perm === "prompt" ? `<button class="btn" id="remOn">Turn on browser notifications</button>` : ""}
    <button class="btn pri" id="icsAll">Send ${upcoming} upcoming task${upcoming === 1 ? "" : "s"} to calendar</button></div>`;
}
export function wireRemindersPanel() {
  const on = $("#remOn"), ex = $("#remExact"), ics = $("#icsAll");
  if (on) on.onclick = enableReminders;
  if (ex) ex.onclick = async () => { exact = await openExactAlarmSetting(); app.render(); };
  if (ics) ics.onclick = () => app.exportICS(app.view().filter((t) => !t.done && t.due && t.due > Date.now()));
}
async function enableReminders() {
  const r = await requestPermission();
  await refreshPerm();
  if (r === "granted") {
    haptic("success");
    const n = isNative ? await sync(app.view(), true) : 0;
    app.toast({ t: "Reminders are on", s: isNative ? `${n} upcoming task${n === 1 ? "" : "s"} scheduled.` : "You'll get a notification when something comes due.", ttl: 3500 });
  } else {
    app.toast({ t: "Notifications are blocked", s: isNative ? "Turn them on for Done & Dusted in your phone's Settings → Apps." : "Allow notifications for this site in your browser settings.", ttl: 6000 });
  }
  app.render();
  if (!$("#sheet").hidden) drawSheet();
}

/* ---------- Settings sheet ---------- */
export function initSheet(bridgeFn) {
  app = bridgeFn();
  refreshPerm().then(() => app.render());
  $("#gear").onclick = openSheet;
  $("#sheetClose").onclick = closeSheet;
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
  $("#restoreFile").onchange = onRestoreFile;
}
export async function openSheet() {
  await refreshPerm();
  pendingRestore = null;
  await drawSheet();
  const sh = $("#sheet");
  sh.hidden = false;
  requestAnimationFrame(() => sh.classList.add("open"));
  $("#sheetClose")?.focus();
}
export function closeSheet() {
  const sh = $("#sheet");
  sh.classList.remove("open");
  setTimeout(() => { sh.hidden = true; }, 250);
  $("#gear").focus();
}

async function drawSheet() {
  const n = await countTasks().catch(() => 0);
  const prot = isNative ? true : await isPersisted();
  const remLine = perm === "granted"
    ? (isNative ? "On. Alerts arrive at each due time, even when the app is closed." : "On. You'll get a notification when a task comes due while the app is open.")
    : perm === "denied" ? (isNative ? "Blocked. Turn notifications on in your phone's Settings → Apps → Done & Dusted." : "Blocked. Allow notifications for this site in your browser settings.")
    : perm === "unsupported" ? "Not available on this device." : "Off.";
  $("#sheetBody").innerHTML = `
    <section class="sset">
      <h3>Reminders</h3>
      <p>${esc(remLine)}</p>
      ${perm === "prompt" ? `<button class="btn pri" id="sRemOn">Turn on reminders</button>` : ""}
      ${isNative && platform === "android" && perm === "granted" && exact !== "granted" ? `<button class="btn" id="sExact">Allow exact alarms</button>` : ""}
    </section>
    <section class="sset">
      <h3>Backup</h3>
      <p>Your tasks are stored only on this ${isNative ? "phone" : "device, in this browser"}. Save a backup now and then, and use it to move your tasks to another phone or browser.</p>
      <div class="acts"><button class="btn pri" id="sBackup">Save a backup</button><button class="btn" id="sRestore">Restore from backup</button></div>
      <div id="restoreBox"></div>
    </section>
    <section class="sset">
      <h3>Storage</h3>
      <dl class="kv">
        <dt>Tasks saved</dt><dd class="mono">${n}</dd>
        <dt>Where</dt><dd>${isNative ? "On this phone" : "In this browser (IndexedDB)"}</dd>
        ${isNative ? "" : `<dt>Protected from clean-up</dt><dd>${prot ? "Yes" : prot === false ? `No <button class="btn sm" id="sPersist">Ask again</button>` : "Unknown"}</dd>`}
      </dl>
      ${!isNative && !prot ? `<p class="rem-p">Browsers may clear data for sites you rarely visit. Installing the app (Add to Home screen) usually protects it.</p>` : ""}
    </section>
    <section class="sset">
      <h3>Planning</h3>
      <div class="cap" role="group" aria-label="Tasks per day"><button id="sCapDown" aria-label="Fewer per day">−</button><span>Up to <b>${app.getCap()}</b> tasks a day</span><button id="sCapUp" aria-label="More per day">+</button></div>
    </section>
    <p class="about">Done &amp; Dusted ${VERSION} · ${isNative ? (platform === "ios" ? "iPhone" : "Android") : "Web"} · Plan it · Do it · Dust it</p>`;
  const b = (id) => document.getElementById(id);
  if (b("sRemOn")) b("sRemOn").onclick = enableReminders;
  if (b("sExact")) b("sExact").onclick = async () => { exact = await openExactAlarmSetting(); drawSheet(); };
  b("sBackup").onclick = doBackup;
  b("sRestore").onclick = () => $("#restoreFile").click();
  if (b("sPersist")) b("sPersist").onclick = async () => { await requestPersist(); drawSheet(); };
  b("sCapDown").onclick = () => { app.setCap(Math.max(1, app.getCap() - 1)); drawSheet(); app.render(); };
  b("sCapUp").onclick = () => { app.setCap(Math.min(12, app.getCap() + 1)); drawSheet(); app.render(); };
  drawRestore();
}

async function doBackup() {
  try {
    const data = await makeBackup({ cap: app.getCap() });
    if (!data.count) { app.toast({ t: "Nothing to back up yet", s: "Add or import a task first.", ttl: 3000 }); return; }
    const d = new Date(), p = (x) => String(x).padStart(2, "0");
    const name = `done-and-dusted-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    const r = await saveFile(name, JSON.stringify(data, null, 1), "application/json");
    if (r !== "cancelled") { haptic("success"); app.toast({ t: "Backup saved", s: `${data.count} tasks in ${name}`, ttl: 4000 }); }
  } catch (e) {
    app.toast({ t: "Couldn't save the backup", s: e?.message || "Try again.", ttl: 5000 });
  }
}

async function onRestoreFile(e) {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  try {
    pendingRestore = readBackup(await f.text());
    pendingRestore.name = f.name;
  } catch (err) {
    pendingRestore = { error: err.message };
  }
  drawRestore();
}
function drawRestore() {
  const box = $("#restoreBox");
  if (!box) return;
  if (!pendingRestore) { box.innerHTML = ""; return; }
  if (pendingRestore.error) { box.innerHTML = `<p class="rem-p warnline">${esc(pendingRestore.error)}</p>`; return; }
  const r = pendingRestore, when = r.exportedAt ? new Date(r.exportedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  box.innerHTML = `<div class="restore">
    <p><b>${r.tasks.length} tasks</b> found${when ? ` from ${esc(when)}` : ""}. How should they come in?</p>
    <div class="acts">
      <button class="btn pri" id="rMerge">Add to my tasks</button>
      <button class="btn warn" id="rReplace">Replace all my tasks</button>
      <button class="btn" id="rCancel">Cancel</button>
    </div>
    <p class="rem-p">“Add” keeps what you have and updates any task that's in both. “Replace” deletes your current tasks first.</p></div>`;
  $("#rCancel").onclick = () => { pendingRestore = null; drawRestore(); };
  $("#rMerge").onclick = () => doRestore("merge");
  $("#rReplace").onclick = () => {
    const btn = $("#rReplace");
    if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Tap again to replace everything"; haptic("warn"); return; }
    doRestore("replace");
  };
}
async function doRestore(mode) {
  try {
    const r = pendingRestore;
    await restore(r.tasks, mode);
    if (r.settings?.cap) app.setCap(r.settings.cap);
    pendingRestore = null;
    await app.reload();
    haptic("success");
    app.toast({ t: "Restored", s: `${r.tasks.length} tasks ${mode === "replace" ? "loaded" : "added"} from your backup.`, ttl: 4000 });
    closeSheet();
  } catch (e) {
    app.toast({ t: "Restore failed", s: e?.message || "Your tasks weren't changed.", ttl: 5000 });
  }
}
