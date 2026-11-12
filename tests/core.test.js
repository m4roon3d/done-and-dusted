import test from "node:test";
import assert from "node:assert/strict";
import { parseQuick, parseWhen, guessCat, fmtDue, splitDictation, parseDictation, collapseRepeats, nextDue } from "../src/core.js";
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

test("repeat phrases are read and removed from the title", () => {
  const a = parseQuick("water plants every day 7am");
  assert.equal(a.rep, "day"); assert.equal(a.title, "water plants"); assert.equal(new Date(a.due).getHours(), 7);
  const b = parseQuick("team sync every monday 10am #Work");
  assert.equal(b.rep, "week"); assert.equal(b.title, "team sync"); assert.equal(new Date(b.due).getDay(), 1);
  assert.equal(parseQuick("pay rent monthly").rep, "month");
  assert.equal(parseQuick("pay rent monthly").title, "pay rent");
  assert.ok(parseQuick("pay rent monthly").due, "a repeat with no date starts at the next 9am");
  assert.equal(parseQuick("check tyres every 2 weeks").rep, "2week");
  const wd = parseQuick("standup every weekday 9:30am");
  assert.equal(wd.rep, "weekday"); assert.ok(![0, 6].includes(new Date(wd.due).getDay()));
  const keep = parseQuick("Weekly report fri 5pm");
  assert.equal(keep.rep, null); assert.equal(keep.title, "Weekly report");
  assert.equal(parseQuick("buy milk tomorrow").rep, null);
  assert.equal(parseDictation("call mom every sunday at 6pm")[0].rep, "week");
});

test("nextDue steps forward and never lands in the past", () => {
  const at = (y, m, d, h = 9) => new Date(y, m, d, h, 0).getTime();
  const now = at(2026, 10, 11, 12); // Wed 11 Nov 2026, noon
  assert.equal(nextDue(at(2026, 10, 11), "day", now), at(2026, 10, 12));
  assert.equal(nextDue(at(2026, 10, 1), "day", now), at(2026, 10, 12), "long overdue: skips to the next future day");
  assert.equal(nextDue(at(2026, 10, 13), "weekday", now), at(2026, 10, 16), "Friday -> Monday");
  assert.equal(nextDue(at(2026, 10, 9), "week", now), at(2026, 10, 16));
  assert.equal(nextDue(at(2026, 10, 9), "2week", now), at(2026, 10, 23));
  assert.equal(nextDue(at(2026, 10, 20), "week", now), at(2026, 10, 27), "done early: one step from its own date");
  assert.equal(nextDue(at(2027, 0, 31), "month", at(2027, 0, 31, 10)), at(2027, 1, 28), "31 Jan -> 28 Feb");
  assert.equal(nextDue(at(2028, 1, 29), "year", at(2028, 1, 29, 10)), at(2029, 1, 28), "29 Feb -> 28 Feb");
  assert.equal(nextDue(null, "day", now), null);
  assert.equal(nextDue(at(2026, 10, 11), "nope", now), null);
});

test("dictation: repeated words from the speech engine are dropped", () => {
  assert.equal(collapseRepeats("buy milk buy milk tomorrow"), "buy milk tomorrow");
  assert.equal(collapseRepeats("call mom call mom call mom at 6"), "call mom at 6");
  assert.equal(collapseRepeats("pay pay pay rent"), "pay rent");
  assert.equal(collapseRepeats("Pay rent tomorrow pay rent tomorrow at 9 am"), "Pay rent tomorrow at 9 am");
  assert.equal(collapseRepeats("book the the tickets"), "book the tickets");
  assert.equal(collapseRepeats("say bye bye to Ravi"), "say bye bye to Ravi");
  assert.equal(collapseRepeats("water plants and feed the cat"), "water plants and feed the cat");
});
