import test from "node:test";
import assert from "node:assert/strict";
import { parseQuick, parseWhen, guessCat, fmtDue } from "../src/core.js";
import { readBackup } from "../src/store.js";

const NOW = new Date(2026, 10, 11, 9, 0); // Wed 11 Nov 2026, 9:00
const at = (text) => { const d = parseWhen(text, NOW).due; return d ? new Date(d) : null; };

test("quick add pulls out category, priority and title", () => {
  const p = parseQuick("Pay electricity bill tomorrow 6pm #Home !");
  assert.equal(p.title, "Pay electricity bill");
  assert.equal(p.cat, "Home");
  assert.equal(p.pri, 1);
});
test("dates: tomorrow with time", () => { const d = at("x tomorrow 6pm"); assert.deepEqual([d.getDate(), d.getHours()], [12, 18]); });
test("dates: weekday rolls forward", () => { const d = at("dentist fri 5:30pm"); assert.deepEqual([d.getDate(), d.getHours(), d.getMinutes()], [13, 17, 30]); });
test("dates: day + month", () => { const d = at("send SOW 15 nov"); assert.deepEqual([d.getDate(), d.getMonth()], [15, 10]); });
test("dates: dd/mm", () => { const d = at("renew by 20/11"); assert.deepEqual([d.getDate(), d.getMonth()], [20, 10]); });
test("dates: in N days", () => { assert.equal(at("gym in 3 days").getDate(), 14); });
test("no date stays undated", () => { assert.equal(at("buy milk"), null); });
test("categories are guessed from wording", () => {
  assert.equal(guessCat("pay credit card bill"), "Finance");
  assert.equal(guessCat("doctor appointment"), "Health");
  assert.equal(guessCat("something vague"), "Inbox");
});
test("due labels", () => {
  assert.match(fmtDue(new Date(2026, 10, 11, 18, 0).getTime(), NOW.getTime()), /^Today/);
  assert.match(fmtDue(new Date(2026, 10, 12, 9, 0).getTime(), NOW.getTime()), /^Tomorrow$/);
});
test("backup: reads a valid file and cleans it", () => {
  const r = readBackup(JSON.stringify({ app: "done-and-dusted", format: 1, tasks: [{ id: "a", title: "T", due: 5, src: "example" }, { nope: 1 }] }));
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].cat, "Inbox");
  assert.equal(r.tasks[0].src, "manual");
});
test("backup: rejects junk and newer formats", () => {
  assert.throws(() => readBackup("not json"));
  assert.throws(() => readBackup(JSON.stringify({ tasks: [] })));
  assert.throws(() => readBackup(JSON.stringify({ format: 99, tasks: [{ id: "a", title: "T" }] })));
});
