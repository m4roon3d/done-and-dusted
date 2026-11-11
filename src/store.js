// Local-first storage: every task lives in IndexedDB on this device (via Dexie).
// No server, works offline. Backups are plain JSON files the person keeps.
import Dexie from "dexie";

export const db = new Dexie("done-and-dusted");
db.version(1).stores({
  // primary key first, then indexed fields used for queries
  tasks: "id, due, cat, done, createdAt",
});

const clean = (t) => { const { _n, ...rest } = t; return rest; };

export const loadAll = () => db.tasks.toArray();
export const putTask = (t) => db.tasks.put(clean(t));
export const putTasks = (list) => db.tasks.bulkPut(list.map(clean));
export const deleteTask = (id) => db.tasks.delete(id);
export const countTasks = () => db.tasks.count();
export const clearTasks = () => db.tasks.clear(); // tasks only; preferences live in localStorage and stay

// One-time move from the earlier localStorage version of the app.
export async function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem("kept.tasks.v1");
    if (!raw) return 0;
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length && !(await db.tasks.count())) await db.tasks.bulkPut(list);
    localStorage.removeItem("kept.tasks.v1");
    return Array.isArray(list) ? list.length : 0;
  } catch { return 0; }
}

// Ask the browser not to clear our data when space runs low.
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
export async function isPersisted() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}

/* ---------- backup ---------- */
export const BACKUP_FORMAT = 1;

export async function makeBackup(settings = {}) {
  const tasks = await db.tasks.toArray();
  return {
    app: "done-and-dusted",
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    count: tasks.length,
    settings,
    tasks,
  };
}

// Validates a backup file and returns { tasks, settings, exportedAt } or throws a readable Error.
export function readBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error("This file isn't a Done & Dusted backup (it isn't valid JSON)."); }
  const list = Array.isArray(j) ? j : j?.tasks;
  if (!Array.isArray(list)) throw new Error("No tasks found in this file.");
  if (j?.format && j.format > BACKUP_FORMAT) throw new Error("This backup comes from a newer version of the app. Update the app, then restore.");
  const tasks = list
    .filter((t) => t && typeof t === "object" && t.id && t.title)
    .map((t) => ({
      id: String(t.id),
      title: String(t.title).slice(0, 500),
      cat: String(t.cat || "Inbox").slice(0, 60),
      due: Number.isFinite(t.due) ? t.due : null,
      pri: t.pri ? 1 : 0,
      done: !!t.done,
      doneAt: Number.isFinite(t.doneAt) ? t.doneAt : null,
      createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
      src: t.src === "example" ? "manual" : String(t.src || "manual"),
      note: t.note ? String(t.note).slice(0, 5000) : "",
    }));
  if (!tasks.length) throw new Error("The backup has no tasks in it.");
  return { tasks, settings: (j && j.settings) || {}, exportedAt: j?.exportedAt || null };
}

// mode "merge": add new tasks and update ones with the same id. mode "replace": wipe, then load.
export async function restore(tasks, mode = "merge") {
  await db.transaction("rw", db.tasks, async () => {
    if (mode === "replace") await db.tasks.clear();
    await db.tasks.bulkPut(tasks);
  });
}
