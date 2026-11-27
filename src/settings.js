// Settings sheet (reminders, backup & restore, storage) and the Dashboard's reminders panel.
import { infoBtn, infoText } from "./info.js";
import { isNative, platform, saveFile, haptic } from "./platform.js";
import { permissionState, requestPermission, exactAlarmState, openExactAlarmSetting, sync } from "./notify.js";
import { pref, setPref } from "./prefs.js";
import { LOOKS, setLook, setAutoNight, effectiveLook } from "./theme.js";
import { makeBackup, readBackup, restore, countTasks, isPersisted, requestPersist } from "./store.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const VERSION = "1.2 · build " + (typeof __APP_BUILD__ === "undefined" ? "dev" : __APP_BUILD__);
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
  if (!pref("alerts")) {
    return `<h4>Alerts <small>off</small></h4>
      <p class="rem-p">You won't get a pop-up, chime or notification when a task comes due. Overdue tasks still show in red.</p>
      <button class="btn pri" id="remAlertsOn">Turn alerts on</button>`;
  }
  if (isNative) {
    const on = perm === "granted";
    return `<h4>Phone reminders <small>${on ? `on · ${upcoming} scheduled ${infoBtn("rem")}` : "off"}</small></h4>
      ${on
        ? infoText("rem", "You'll get a notification at each due time, with <b>Done ✓</b> and <b>+1 hour</b> buttons. They work even when the app is closed.")
        : `<p class="rem-p">Get an alert at each due time, even when the app is closed.</p>`}
      ${on && exact !== "granted" && platform === "android" ? `<p class="rem-p warnline">Alerts may arrive a few minutes late. Allow <b>Alarms &amp; reminders</b> for exact times.</p><button class="btn" id="remExact">Allow exact alarms</button>` : ""}
      ${on ? "" : `<button class="btn pri" id="remOn">Turn on reminders</button>`}`;
  }
  const on = perm === "granted";
  return `<h4>Reminders <small>${on ? "browser notifications on" : "in-app chime"} ${infoBtn("rem")}</small></h4>
    ${infoText("rem", `While the app is open, a due task chimes and pops up${on ? ", and shows a notification if this tab is in the background" : ""}. For alerts when it's closed, install the Android app, or send upcoming tasks to your calendar with a 15-minute alert each.`)}
    <div class="acts">${perm === "prompt" ? `<button class="btn" id="remOn">Turn on browser notifications</button>` : ""}
    <button class="btn pri" id="icsAll">Send ${upcoming} upcoming task${upcoming === 1 ? "" : "s"} to calendar</button></div>`;
}
export function wireRemindersPanel() {
  const on = $("#remOn"), ex = $("#remExact"), ics = $("#icsAll"), back = $("#remAlertsOn");
  if (back) back.onclick = () => setAlerts(true);
  if (on) on.onclick = enableReminders;
  if (ex) ex.onclick = async () => { exact = await openExactAlarmSetting(); app.render(); };
  if (ics) ics.onclick = () => app.exportICS(app.view().filter((t) => !t.done && t.due && t.due > Date.now()));
}
function changeLook(apply) {
  const root = document.documentElement;
  root.classList.add("look-fade");            // colours and corners ease across, not snap
  apply();
  haptic();
  app.render();
  drawSheet();
  setTimeout(() => root.classList.remove("look-fade"), 450);
}
async function setAlerts(on) {
  setPref("alerts", on);
  if (isNative) await sync(app.view(), true).catch(() => {});
  haptic();
  app.toast(on
    ? { t: "Alerts are on", s: "You'll be told when a task comes due.", ttl: 3000 }
    : { t: "Alerts are off", s: "No pop-ups, chimes or notifications until you turn them back on.", ttl: 4000 });
  app.render();
  if (!$("#sheet").hidden) drawSheet();
}
const switchHTML = (id, on, label, sub) => `<label class="sw" for="${id}"><span class="sw-t"><b>${label}</b><small>${sub}</small></span>
  <input type="checkbox" id="${id}" role="switch" ${on ? "checked" : ""}><span class="sw-k" aria-hidden="true"></span></label>`;

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
    ? (isNative ? "Phone notifications are allowed. Alerts arrive at each due time, even when the app is closed." : "Browser notifications are allowed, so you're alerted even when this tab is in the background.")
    : perm === "denied" ? (isNative ? "Blocked. Turn notifications on in your phone's Settings → Apps → Done & Dusted." : "Blocked. Allow notifications for this site in your browser settings.")
    : perm === "unsupported" ? "Notifications aren't available on this device; you still get the pop-up and chime." : (isNative ? "Phone notifications aren't allowed yet, so alerts only show while the app is open." : "Browser notifications aren't allowed yet, so alerts only show while this tab is in front.");
  $("#sheetBody").innerHTML = `
    <section class="sset">
      <h3>Look</h3>
      <div class="looks" role="group" aria-label="Choose a look">${LOOKS.map((l) => `<button class="look" data-look-id="${l.id}" aria-pressed="${pref("look") === l.id}">
        <span class="sw3" style="background:${l.swatch[0]}"><i class="a" style="background:${l.swatch[1]}"></i><i class="b" style="background:${l.swatch[2]}"></i><i class="c" style="background:${l.swatch[2]}"></i></span>${esc(l.name)}</button>`).join("")}</div>
      ${pref("look") === "night" ? "" : switchHTML("swNight", pref("autoNight"), "Night Garden after dark", "Switch to the dark look when the phone is in dark mode")}
      ${pref("look") !== "night" && effectiveLook().id === "night" ? `<p>Showing Night Garden now because your phone is in dark mode.</p>` : ""}
      ${switchHTML("swSplash", pref("splashSound"), "Opening music", "The little tune with the animation when the app opens")}
    </section>
    <section class="sset">
      <h3>Alerts</h3>
      ${switchHTML("swAlerts", pref("alerts"), "Alert me when a task is due", isNative ? "Phone notification, pop-up and chime" : "Pop-up, chime and browser notification")}
      ${pref("alerts") ? switchHTML("swSound", pref("sound"), "Chime sound", "Played with the pop-up while the app is open") : ""}
      ${pref("alerts") ? `<p>${esc(remLine)}</p>` : `<p>Alerts are off. Overdue tasks still show in red in your lists.</p>`}
      ${pref("alerts") ? `${switchHTML("swBrief", pref("brief"), "Morning brief", "What's due and where to start, once each morning")}
        ${pref("brief") ? `<label class="brief-at">Brief at <input type="time" id="sBriefAt" value="${esc(pref("briefAt") || "08:00")}"></label>` : ""}` : ""}
      ${pref("alerts") && perm === "prompt" ? `<button class="btn pri" id="sRemOn">${isNative ? "Allow phone notifications" : "Allow browser notifications"}</button>` : ""}
      ${pref("alerts") && isNative && platform === "android" && perm === "granted" && exact !== "granted" ? `<button class="btn" id="sExact">Allow exact alarms</button>` : ""}
    </section>
    <section class="sset">
      <h3>Import</h3>
      <p>Bring in your Google Keep notes, or paste a list, and they become tasks.</p>
      <div class="acts"><button class="btn" id="sImport">Import from Google Keep</button></div>
    </section>
    <section class="sset">
      <h3>Backup</h3>
      <p>Your tasks are stored only on this ${isNative ? "phone" : "device, in this browser"}. Save a backup now and then, and use it to move your tasks to another phone or browser.</p>
      <div class="acts"><button class="btn pri" id="sBackup">Save a backup</button><button class="btn" id="sRestore">Restore from backup</button></div>
      <div id="restoreBox"></div>
    </section>
    <section class="sset">
      <h3>Start over</h3>
      ${n ? `<p>Delete every task on this ${isNative ? "phone" : "device"}. Your look, alerts and other settings stay. Save a backup first if you might want them back.</p>
      <div class="acts"><button class="btn warn" id="sReset">Delete all ${n} task${n === 1 ? "" : "s"}</button><button class="btn" id="sResetBackup">Save a backup first</button></div>`
      : `<p>No tasks saved, so there's nothing to delete.</p>`}
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
      ${isNative ? switchHTML("swCal", pref("calOnPlan"), "Use my calendar", "Plan my week leaves room for meetings, and task events stay in step both ways") : ""}
      ${switchHTML("swFest", pref("festivals"), "Festivals and holidays", "Know about Indian festivals and public holidays")}
      ${switchHTML("swHolFree", pref("holidaysFree"), "Keep public holidays free", "Auto-plan won't put tasks on them")}
      <div class="cap" role="group" aria-label="Tasks per day"><button id="sCapDown" aria-label="Fewer per day">−</button><span>Up to <b>${app.getCap()}</b> tasks a day</span><button id="sCapUp" aria-label="More per day">+</button></div>
    </section>
    <p class="about">Done &amp; Dusted ${VERSION} · ${isNative ? (platform === "ios" ? "iPhone" : "Android") : "Web"} · Plan it · Do it · Dust it</p>`;
  const b = (id) => document.getElementById(id);
  b("sImport").onclick = () => { closeSheet(); app.openImport(); };
  document.querySelectorAll("[data-look-id]").forEach((btn) => { btn.onclick = () => changeLook(() => setLook(btn.dataset.lookId)); });
  if (b("swNight")) b("swNight").onchange = (e) => changeLook(() => setAutoNight(e.target.checked));
  b("swAlerts").onchange = (e) => setAlerts(e.target.checked);
  b("swSplash").onchange = (e) => { setPref("splashSound", e.target.checked); haptic(); };
  if (b("swBrief")) b("swBrief").onchange = async (e) => { setPref("brief", e.target.checked); haptic(); if (isNative) await sync(app.view(), true).catch(() => {}); drawSheet(); };
  if (b("sBriefAt")) b("sBriefAt").onchange = async (e) => { if (!e.target.value) return; setPref("briefAt", e.target.value); setPref("briefShown", null); if (isNative) await sync(app.view(), true).catch(() => {});
    app.toast({ t: "Morning brief at " + e.target.value, ttl: 2000 }); };
  if (b("swSound")) b("swSound").onchange = (e) => { setPref("sound", e.target.checked); haptic(); };
  if (b("sRemOn")) b("sRemOn").onclick = enableReminders;
  if (b("sExact")) b("sExact").onclick = async () => { exact = await openExactAlarmSetting(); drawSheet(); };
  b("sBackup").onclick = doBackup;
  b("sRestore").onclick = () => $("#restoreFile").click();
  if (b("sResetBackup")) b("sResetBackup").onclick = doBackup;
  if (b("sReset")) b("sReset").onclick = () => {
    const btn = b("sReset");
    if (!btn.dataset.armed) { // first tap arms the button for a few seconds; the second tap deletes
      btn.dataset.armed = "1"; btn.textContent = `Tap again to delete ${n} task${n === 1 ? "" : "s"}`; haptic("warn");
      setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = `Delete all ${n} task${n === 1 ? "" : "s"}`; } }, 4000);
      return;
    }
    doReset();
  };
  if (b("sPersist")) b("sPersist").onclick = async () => { await requestPersist(); drawSheet(); };
  if (b("swCal")) b("swCal").onchange = async (e) => { setPref("calOnPlan", e.target.checked); haptic();
    if (e.target.checked && !(await app.calAccess())) app.toast({ t: "Calendar access is off", s: "Allow Calendar for Done & Dusted in your phone's app settings.", ttl: 4000 });
    app.render(); };
  b("swFest").onchange = (e) => { setPref("festivals", e.target.checked); haptic(); app.render(); };
  b("swHolFree").onchange = (e) => { setPref("holidaysFree", e.target.checked); haptic(); };
  b("sCapDown").onclick = () => { app.setCap(Math.max(1, app.getCap() - 1)); drawSheet(); app.render(); };
  b("sCapUp").onclick = () => { app.setCap(Math.min(12, app.getCap() + 1)); drawSheet(); app.render(); };
  drawRestore();
}

export async function doBackup() {
  try {
    const data = await makeBackup({ cap: app.getCap() });
    if (!data.count) { app.toast({ t: "Nothing to back up yet", s: "Add or import a task first.", ttl: 3000 }); return; }
    const d = new Date(), p = (x) => String(x).padStart(2, "0");
    const name = `done-and-dusted-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    const r = await saveFile(name, JSON.stringify(data, null, 1), "application/json");
    if (r !== "cancelled") { setPref("backedUp", Date.now()); app.render(); haptic("success"); app.toast({ t: "Backup saved", s: `${data.count} tasks in ${name}`, ttl: 4000 }); }
  } catch (e) {
    app.toast({ t: "Couldn't save the backup", s: e?.message || "Try again.", ttl: 5000 });
  }
}

async function doReset() {
  try {
    const snap = await app.resetAll();
    closeSheet(); haptic("success");
    app.toast({ t: `Deleted ${snap.tasks.length} task${snap.tasks.length === 1 ? "" : "s"}`, s: "Showing the example tasks until you add your own.", ttl: 10000,
      undo: () => app.undoReset(snap).catch((e) => app.toast({ t: "Couldn't undo", s: e?.message || "Restore from a backup instead.", ttl: 5000 })) });
  } catch (e) {
    app.toast({ t: "Couldn't delete your tasks", s: e?.message || "Nothing was changed.", ttl: 5000 });
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
