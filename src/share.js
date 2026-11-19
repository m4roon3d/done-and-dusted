// Share a list as a link or QR code. No server: the tasks travel inside the link itself, compressed.
// Each task keeps its id, so sending the list again later updates the copy on the other phone.
import qrcode from "qrcode-generator";

export const WEB = "https://done-and-dusted.onrender.com/";
const b64u = (bytes) => { let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (str) => { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function encodeList(cat, tasks, now = Date.now()) {
  const t = tasks.filter((x) => x.cat === cat && x.src !== "example" && (!x.done || (x.doneAt || 0) > now - 14 * 864e5))
    .map((x) => [x.id, x.title, x.due || 0, x.pri ? 1 : 0, x.rep || "", x.note || "", x.done ? 1 : 0, x.who || "", x.effort || "", x.mins || 0]);
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, c: cat, a: now, t }));
  if (typeof CompressionStream === "function") {
    try { return "z." + b64u(await pipe(json, new CompressionStream("deflate-raw"))); } catch {}
  }
  return "j." + b64u(json);
}
export async function decodeList(code) {
  const [k, data] = String(code).split(".");
  let bytes = unb64u(data);
  if (k === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  const o = JSON.parse(new TextDecoder().decode(bytes));
  if (o.v !== 1 || !o.c || !Array.isArray(o.t)) throw new Error("Not a Done & Dusted list");
  return { cat: o.c, at: o.a, tasks: o.t.map(([id, title, due, pri, rep, note, done, who, effort, mins]) =>
    ({ id, title, due: due || null, pri: pri ? 1 : 0, rep: rep || null, note: note || "", done: !!done, who: who || null, effort: effort || null, mins: mins || null })) };
}
export const linkFor = (code) => WEB + "#share=" + code;
/* Opens the Android app straight from the browser, when it's installed. */
export const appLink = (code) => `intent://import/${code}#Intent;scheme=doneanddusted;package=app.doneanddusted;end`;
/* An SVG QR code for the link, or "" when the list is too long to fit in one. */
export function qrSVG(text) {
  try { const q = qrcode(0, "L"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ""; }
}
/* What importing would do: which tasks are new, updated, or newly done here. */
export function planImport(incoming, local) {
  const byId = new Map(local.map((t) => [t.id, t])), add = [], update = [], done = [];
  for (const x of incoming.tasks) {
    const t = byId.get(x.id);
    if (!t) { if (!x.done) add.push(x); continue; }
    if (x.done) { if (!t.done) done.push(t); continue; }
    if (t.done) continue;
    if (t.title !== x.title || (t.due || null) !== x.due || (t.pri || 0) !== x.pri || (t.rep || null) !== x.rep || (t.note || "") !== x.note) update.push({ t, x });
  }
  return { add, update, done };
}
