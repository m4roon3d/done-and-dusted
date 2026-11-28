import test from "node:test";
import assert from "node:assert/strict";
import { parseQuick, parseWhen, guessCat, fmtDue, splitDictation, parseDictation, collapseRepeats, briefText, parseWho, parseEffort, nextDue } from "../src/core.js";
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

test("morning brief: counts, picks the important one first", () => {
  const due=[{title:"Pay rent",due:2},{title:"Call bank",due:1,pri:1}], late=[{title:"Old thing",due:0}];
  assert.equal(briefText(due,late), "2 due today · 1 overdue · Start with: Call bank");
  assert.equal(briefText([],[{title:"A",due:5},{title:"B",due:3}]), "2 overdue · Start with: B");
  assert.equal(briefText([],[]), "");
});

test("who a task involves", () => {
  assert.equal(parseWho("Call Amma"), "Amma");
  assert.equal(parseWho("call amma"), "Amma");
  assert.equal(parseWho("Email Ravi Kumar about the SOW"), "Ravi Kumar");
  assert.equal(parseWho("Meet with Priya"), "Priya");
  assert.equal(parseWho("Pay rent"), null);
  assert.equal(parseWho("Call the bank"), null);
  assert.equal(parseWho("Water the plants"), null);
});
test("effort: durations come out of the title, words stay", () => {
  assert.deepEqual(parseEffort("Write report for 2 hours"), { rest: "Write report", effort: "big", mins: 120 });
  assert.deepEqual(parseEffort("Reply to Ravi (10 min)"), { rest: "Reply to Ravi", effort: "quick", mins: 10 });
  assert.deepEqual(parseEffort("Quick call with bank"), { rest: "Quick call with bank", effort: "quick", mins: null });
  assert.deepEqual(parseEffort("Data model overhaul"), { rest: "Data model overhaul", effort: "big", mins: null });
  assert.deepEqual(parseEffort("Pay rent"), { rest: "Pay rent", effort: null, mins: null });
});
test("quick add keeps who and effort, and still reads the date", () => {
  const p = parseQuick("call Amma tomorrow 6pm for 15 min");
  assert.equal(p.title, "call Amma");
  assert.equal(p.who, "Amma");
  assert.equal(p.effort, "quick");
  assert.ok(p.due);
});

test("shared lists: round trip, and resending updates instead of duplicating", async () => {
  const { encodeList, decodeList, planImport } = await import("../src/share.js");
  const now = Date.now();
  const mine = [
    { id: "a", title: "Buy milk", cat: "Home", due: now + 1e6, pri: 0, done: false },
    { id: "b", title: "Fix tap", cat: "Home", due: null, pri: 1, done: false, who: "Plumber" },
    { id: "c", title: "Old done", cat: "Home", done: true, doneAt: now - 30 * 864e5 },
    { id: "d", title: "Work thing", cat: "Work", done: false },
  ];
  const got = await decodeList(await encodeList("Home", mine, now));
  assert.equal(got.cat, "Home");
  assert.deepEqual(got.tasks.map((t) => t.id), ["a", "b"]);
  assert.equal(got.tasks[1].who, "Plumber");
  let plan = planImport(got, []);
  assert.equal(plan.add.length, 2);
  const theirs = got.tasks.map((t) => ({ ...t, cat: "Home" }));
  mine[0].done = true; mine[0].doneAt = now; mine[1].title = "Fix kitchen tap";
  plan = planImport(await decodeList(await encodeList("Home", mine, now)), theirs);
  assert.equal(plan.add.length, 0);
  assert.equal(plan.done.length, 1);
  assert.equal(plan.update.length, 1);
});
test("dates: bare 'today' is never already overdue", () => {
  const morning = new Date(2026, 10, 28, 7, 30), evening = new Date(2026, 10, 28, 19, 42), late = new Date(2026, 10, 28, 22, 10);
  const h = (now) => new Date(parseWhen("call mom today", now).due).getHours();
  assert.equal(h(morning), 9);   // before 9am: 9am as before
  assert.equal(h(evening), 21);  // after 9am: this evening
  assert.equal(h(late), 23);     // after 9pm: the last minute of the day
  assert.equal(new Date(parseWhen("call mom today 6pm", evening).due).getHours(), 18); // a time you give is kept
});
