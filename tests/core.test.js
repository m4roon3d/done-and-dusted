import test from "node:test";
import assert from "node:assert/strict";
import { parseQuick, parseWhen, guessCat, fmtDue, splitDictation, parseDictation } from "../src/core.js";
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

test("dictation: several tasks in one breath", () => {
  const r = parseDictation("Remind me to pay the electricity bill tomorrow at 6 p.m. and call the plumber on Friday, also I need to buy bread and milk");
  assert.deepEqual(r.map((x) => x.title), ["Pay the electricity bill", "Call the plumber", "Buy bread and milk"]);
  assert.equal(r[0].cat, "Finance");
  assert.equal(new Date(r[0].due).getHours(), 18);
  assert.ok(r[1].due);
  assert.equal(r[2].due, null);
});
test("dictation: 'and' inside one task does not split it", () => {
  assert.equal(splitDictation("buy bread and milk").length, 1);
  assert.equal(splitDictation("send the report to Ravi and Priya").length, 1);
});
test("dictation: spoken category and priority", () => {
  const r = parseDictation("book flight tickets under work it's important. Then renew car insurance by 20th November");
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].title, r[0].cat, r[0].pri], ["Book flight tickets", "Work", 1]);
  assert.equal(r[1].title, "Renew car insurance");
  assert.equal(new Date(r[1].due).getDate(), 20);
});
test("dictation: empty and filler input", () => {
  assert.deepEqual(parseDictation(""), []);
  assert.deepEqual(parseDictation("um"), []);
});

test("dictation reads day and hour words in Hindi, Kannada and Tamil", () => {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const kn = parseDictation("ನಾಳೆ 6 ಗಂಟೆಗೆ ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟು");
  assert.equal(kn.length, 1);
  assert.equal(kn[0].title, "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟು");
  assert.equal(new Date(kn[0].due).getDate(), tomorrow.getDate());
  const hi = parseDictation("कल 5 बजे बिजली का बिल भरना। दूध लाना");
  assert.deepEqual(hi.map(x => x.title), ["बिजली का बिल भरना", "दूध लाना"]);
  assert.equal(new Date(hi[0].due).getDate(), tomorrow.getDate());
  const ta = parseDictation("நாளை 6 மணிக்கு மருந்து வாங்கு");
  assert.equal(ta[0].title, "மருந்து வாங்கு");
  assert.ok(ta[0].due);
  assert.equal(parseDictation("கலம் வாங்கு")[0].due, null); // a word that only starts like a day word is left alone
});
