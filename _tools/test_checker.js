/* Unit tests for assets/js/checker-logic.js. No dependencies.
   Run: node _tools/test_checker.js */
"use strict";
const C = require("../assets/js/checker-logic.js");
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; } else { fail++; console.log(`FAIL ${label}\n   expected ${e}\n   actual   ${a}`); }
}
const D = (y, m, d) => C.ymd(y, m, d);
const s = x => `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;

// ---- frequency thresholds: on tax liability, $2,000 and $4,000 inclusive
eq(C.frequencyForLiability(0), "semiannual", "liability 0");
eq(C.frequencyForLiability(2000), "semiannual", "liability 2000 is semiannual");
eq(C.frequencyForLiability(2000.01), "quarterly", "liability just over 2000");
eq(C.frequencyForLiability(4000), "quarterly", "liability 4000 is quarterly");
eq(C.frequencyForLiability(4000.01), "monthly", "liability just over 4000");

// ---- every band lands on ONE frequency for each tax (edges on thresholds)
for (const b of C.BANDS) {
  const hi = isFinite(b.max) ? b.max : b.min * 10;
  for (const [tax, rate] of [["GET", C.RATES.get], ["TAT", C.RATES.tat]]) {
    eq(C.frequencyForLiability(b.min * rate), C.frequencyForLiability(hi * rate), `band ${b.id} homogeneous for ${tax}`);
  }
}
// and the bands are contiguous with no gaps or overlaps
for (let i = 1; i < C.BANDS.length; i++) eq(C.BANDS[i].min, C.BANDS[i - 1].max + 1, `bands contiguous at ${C.BANDS[i].id}`);
// the expected answers per band
const expect = { b1: ["semiannual", "semiannual"], b2: ["semiannual", "quarterly"], b3: ["semiannual", "monthly"],
                 b4: ["quarterly", "monthly"], b5: ["monthly", "monthly"] };
for (const [id, [g, t]] of Object.entries(expect)) {
  eq(C.frequencyForBand(id, C.RATES.get), g, `GET frequency ${id}`);
  eq(C.frequencyForBand(id, C.RATES.tat), t, `TAT frequency ${id}`);
}
eq(C.frequencyForBand("nope", 0.045), null, "unknown band");

// ---- Easter (published dates)
for (const [y, m, d] of [[2024,3,31],[2025,4,20],[2026,4,5],[2027,3,28],[2028,4,16],[2030,4,21],[2038,4,25],[2285,3,22]])
  eq(s(C.easter(y)), s(D(y, m, d)), `Easter ${y}`);

// ---- Hawaii state holidays 2026
const h26 = C.holidays(2026).map(s).sort();
for (const d of ["2026-01-01","2026-01-19","2026-02-16","2026-03-26","2026-04-03","2026-05-25","2026-06-11",
                 "2026-07-03","2026-08-21","2026-09-07","2026-11-03","2026-11-11","2026-11-26","2026-12-25"])
  eq(h26.includes(d), true, `2026 holiday ${d}`);
eq(h26.includes("2026-07-04"), false, "July 4 2026 is a Saturday, observed Friday the 3rd");
eq(C.holidays(2027).map(s).some(d => d.startsWith("2027-11-02")), false, "no election day in odd years");
// New Year's 2028 falls on Saturday: observed Friday Dec 31, 2027
eq(C.isHoliday(D(2027, 12, 31)), true, "Dec 31 2027 observed New Year's");

// ---- due dates move off weekends and state holidays
eq(s(C.businessDay(D(2026, 4, 20))), "2026-04-20", "Mon Apr 20 2026 stays");
eq(s(C.businessDay(D(2026, 9, 20))), "2026-09-21", "Sun Sep 20 2026 moves to Monday");
eq(s(C.businessDay(D(2025, 1, 20))), "2025-01-21", "MLK Day Jan 20 2025 moves");
eq(s(C.businessDay(D(2023, 2, 20))), "2023-02-21", "Presidents' Day Feb 20 2023 moves");
eq(s(C.businessDay(D(2027, 2, 20))), "2027-02-22", "Sat Feb 20 2027 moves to Monday");
eq(s(C.businessDay(D(2027, 8, 20))), "2027-08-23", "Statehood Day Fri Aug 20 2027 moves to Monday");
eq(s(C.businessDay(D(2030, 1, 20))), "2030-01-22", "Sun Jan 20 2030, then MLK Mon Jan 21, lands Tuesday");

// ---- periodic and annual due dates
eq(s(C.periodicDue(2026, 9)), "2026-10-20", "September 2026 due Oct 20");
eq(s(C.periodicDue(2026, 12)), "2027-01-20", "December 2026 due Jan 20 2027");
eq(s(C.annualDue(2026)), "2027-04-20", "2026 annual due Apr 20 2027");
eq(s(C.annualDue(2029)), "2030-04-22", "2029 annual: Sat Apr 20 2030 moves to Monday");

// ---- what's next, from Oct 1 2026
const oct1 = D(2026, 10, 1);
const up = (f, t, n) => C.upcoming(f, t, n).map(x => [s(x.due), x.period]);
eq(up("monthly", oct1, 2), [["2026-10-20","September 2026"],["2026-11-20","October 2026"]], "monthly from Oct 1");
eq(up("quarterly", oct1, 2), [["2026-10-20","July to September 2026"],["2027-01-20","October to December 2026"]], "quarterly from Oct 1");
eq(up("semiannual", oct1, 2), [["2027-01-20","July to December 2026"],["2027-07-20","January to June 2027"]], "semiannual from Oct 1");
eq(up("monthly", D(2026, 10, 20), 1), [["2026-10-20","September 2026"]], "due today still counts");
eq(up("monthly", D(2026, 10, 21), 1), [["2026-11-20","October 2026"]], "day after moves on");
eq(up("quarterly", D(2026, 12, 31), 1), [["2027-01-20","October to December 2026"]], "year boundary");
eq([s(C.nextAnnual(oct1).due), C.nextAnnual(oct1).year], ["2027-04-20", 2026], "annual from Oct 1 2026");
eq([s(C.nextAnnual(D(2027, 4, 20)).due), C.nextAnnual(D(2027, 4, 20)).year], ["2027-04-20", 2026], "annual due today");
eq([s(C.nextAnnual(D(2027, 4, 21)).due), C.nextAnnual(D(2027, 4, 21)).year], ["2028-04-20", 2027], "annual day after");
eq(C.fmt(D(2026, 10, 20)), "Tue, Oct 20, 2026", "date format");

// ---- whole checklists
const ltr = C.checklist({ stay: "ltr", county: "honolulu", rent: "b2", status: "current", home: "island", have: { get: true } }, oct1);
eq(ltr.taxes.map(t => t.id), ["get"], "LTR owes GET only");
eq(ltr.first, null, "current filer has no catch-up section");
eq(ltr.register.length, 0, "LTR with GET license needs no registration");
eq(ltr.file.map(f => [f.form, f.frequency || (f.annual ? "annual" : null)]), [["G-45","semiannual"],["G-49","annual"]], "LTR files G-45 twice a year and G-49");
eq(ltr.also.length, 0, "LTR on-island has nothing extra");
eq(ltr.tools.map(t => t.name), ["Baselane"], "LTR tools");

const str = C.checklist({ stay: "str", county: "maui", rent: "b4", status: "behind", home: "mainland", have: {} }, oct1);
eq(str.taxes.map(t => t.id), ["get","tat","ctat"], "STR owes all three");
eq(!!str.first && str.first.title, "Get current first", "behind gets the catch-up section");
eq(str.register.map(r => r.id), ["state"], "unregistered STR registers with the state only; that covers the county");
eq(str.file.map(f => [f.form, f.frequency || (f.annual ? "annual" : (f.county ? "county" : null))]),
   [["G-45","quarterly"],["G-49","annual"],["TA-1","monthly"],["TA-2","annual"],["MCTAT","monthly"]], "STR $44k-89k on Maui, county paid on the TA-1 schedule");
eq(str.also.map(x => x.id), ["ads","local","permits"], "off-island STR needs a local contact");
eq(str.tools.map(t => t.name), ["Baselane","Hospitable","TATi Maui","Avalara MyLodgeTax"], "Maui STR tools");

const both = C.checklist({ stay: "both", county: "hawaii", rent: "b3", status: "letter", home: "island", have: { get: true, tat: true } }, oct1);
eq(both.first.title, "Deal with the letter first", "letter heads the list");
eq(both.register.map(r => r.id), [], "state GET and TAT registered means fully registered");
eq(both.file.find(f => f.form === "TA-1").frequency, null, "mixed rental: TAT frequency depends on short-term rent");
eq(both.file.find(f => f.form === "TA-1").mode, "both", "mixed rental flagged");
eq(both.also.map(x => x.id), ["ads","local","bill47","permits"], "Big Island STR gets Bill 47, and every STR gets the local contact rule");

const unsure = C.checklist({ stay: "str", county: "kauai", rent: "unsure", status: "new", home: "abroad", have: {} }, oct1);
eq(unsure.file.find(f => f.form === "G-45").frequency, null, "unknown rent: no frequency guess");
eq(unsure.also.map(x => x.id), ["ads","local","permits","abroad"], "abroad owner");

// ---- county payment dates
const sep1 = D(2026, 9, 1); // Sep 20 2026 is a Sunday
const hnl = C.checklist({ stay: "str", county: "honolulu", rent: "b4", status: "current", home: "island", have: { get: true, tat: true } }, sep1);
eq(hnl.file.find(f => f.county).next.map(n => s(n.due)), ["2026-09-20","2026-10-20"], "Honolulu county payment shows the plain 20th");
eq(hnl.file.find(f => f.form === "TA-1").next.map(n => s(n.due)), ["2026-09-21","2026-10-20"], "while the state TA-1 rolls to Monday");
const hi = C.checklist({ stay: "str", county: "hawaii", rent: "b4", status: "current", home: "island", have: { get: true, tat: true } }, sep1);
eq(hi.file.find(f => f.county).next.map(n => s(n.due)), ["2026-09-21","2026-10-20"], "Hawaii County payment rolls like the state");
eq(hnl.file.find(f => f.county).frequency, "monthly", "county paid on the TA-1 frequency");
eq(C.checklist({ stay: "both", county: "kauai", rent: "b2", status: "current", home: "island", have: {} }, sep1).file.find(f => f.county).frequency, null, "mixed rental: county schedule follows the TA-1, unknown here");
eq(C.checklist({ stay: "str", county: "maui", rent: "b1", status: "current", home: "island", have: {} }, sep1).file.find(f => f.form === "G-45").note.includes("$100"), true, "smallest band gets the $100 G-45 note");
eq(C.checklist({ stay: "ltr", county: "maui", rent: "b5", status: "current", home: "island", have: {} }, sep1).file.find(f => f.form === "G-45").note.includes("online"), true, "monthly GET gets the file-online note");

// ---- affiliate links: the program's own link, and only where approved
eq([C.TOOLS.hospitable.affiliate, C.TOOLS.hospitable.href.startsWith("https://hospitable.com/partners/refer?") && C.TOOLS.hospitable.href.includes("utm_campaign=UYDR3S47")], [true, true], "Hospitable uses the Veex Photo referral link");
eq(Object.values(C.TOOLS).filter(t => t.affiliate).map(t => t.name), ["Hospitable"], "Hospitable is the only affiliate link so far");
eq(Object.values(C.TOOLS).every(t => /^https:\/\//.test(t.href)), true, "every tool link is https");

// ---- no em dashes, no undefined, anywhere in any output
const all = JSON.stringify([ltr, str, both, unsure]);
eq(all.includes("\u2014"), false, "no em dashes in output");
eq(/undefined|NaN/.test(all), false, "no undefined or NaN in output");


// ---- why a 20th moves, for the front-page strip and the year chart
eq(C.holidayName(D(2027, 8, 20)), "Statehood Day", "Aug 20 2027 is Statehood Day");
eq(C.holidayName(D(2026, 1, 19)), "Martin Luther King Jr. Day", "MLK Day 2026");
eq(C.holidayName(D(2026, 3, 26)), "Prince Kūhiō Day", "Kuhio Day name keeps its diacritics");
eq(C.holidayName(D(2027, 12, 31)), "New Year's Day", "observed New Year's on Dec 31 2027 is named");
eq(C.holidayName(D(2026, 10, 20)), null, "an ordinary Tuesday has no name");
eq([1, 2, 3, 4, 11, 12, 13, 20, 21, 22, 23, 24].map(C.ordinal).join(), "1st,2nd,3rd,4th,11th,12th,13th,20th,21st,22nd,23rd,24th", "ordinals");
const sh = (y, m) => { const x = C.dueShift(y, m); return [s(x.due), x.moved, x.weekend, x.why]; };
eq(sh(2027, 1), ["2027-01-20", false, false, null], "Jan 20 2027 stays");
eq(sh(2027, 2), ["2027-02-22", true, true, "the 20th is a Saturday"], "Feb 2027 moves for a Saturday");
eq(sh(2027, 6), ["2027-06-21", true, true, "the 20th is a Sunday"], "Jun 2027 moves for a Sunday");
eq(sh(2027, 8), ["2027-08-23", true, false, "the 20th is Statehood Day"], "Aug 2027 moves for Statehood Day");
eq(sh(2030, 1), ["2030-01-22", true, false, "the 20th is a Sunday and the 21st is Martin Luther King Jr. Day"], "Jan 2030 moves twice");
eq(sh(2025, 1), ["2025-01-21", true, false, "the 20th is Martin Luther King Jr. Day"], "MLK Day on the 20th");
const strip27 = C.yearStrip(2027);
eq(strip27.map(x => x.day).join(), "20,22,22,20,20,21,20,23,20,20,22,20", "2027 monthly due days");
eq(strip27.filter(x => x.moved).map(x => x.mon).join(), "Feb,Mar,Jun,Aug,Nov", "five 2027 dates move");
eq(strip27.map(x => x.wd).join(), "Wed,Mon,Mon,Tue,Thu,Mon,Tue,Mon,Mon,Wed,Mon,Mon", "2027 weekdays");
eq([C.stripYear(D(2026, 9, 30)), C.stripYear(D(2026, 10, 1)), C.stripYear(D(2027, 1, 1))], [2026, 2027, 2027], "strip shows next year from October");

// ---- the year plan for one Maui owner on Oct 1 2026
const mauiA = { stay: "str", county: "maui", rent: "b4", status: "current", home: "island", have: { get: true, tat: true } };
const P = C.yearPlan(mauiA, oct1);
const grid = r => r.cells ? r.cells.map(c => c ? "x" : ".").join("") : null;
eq(P.cols.map(c => c.mon + c.day).join(" "), "Oct20 Nov20 Dec21 Jan20 Feb22 Mar22 Apr20 May20 Jun21 Jul20 Aug23 Sep20", "columns Oct 2026 to Sep 2027");
eq(P.rows.map(r => [r.form, grid(r)]), [["G-45", "x..x..x..x.."], ["TA-1", "xxxxxxxxxxxx"], ["MCTAT", "xxxxxxxxxxxx"], ["G-49, TA-2", "......x....."]], "rows and markers");
eq(s(P.rows[2].cells[2].due), "2026-12-20", "Maui County's December payment is the plain 20th, a Sunday");
eq(s(P.rows[1].cells[2].due), "2026-12-21", "the state TA-1 rolls to Monday");
eq([P.next.dueText, P.next.weekday, P.next.days], ["Tue, Oct 20, 2026", "Tuesday", 19], "next up");
eq(P.next.items.map(i => i.form + " " + i.what), ["G-45 GET for July to September 2026", "TA-1 State TAT for September 2026", "MCTAT County payment for September 2026"], "next up items");
eq(P.groups.slice(1, 4).map(g => g.dueText + " " + g.items.map(i => i.form).join("+")), ["Fri, Nov 20, 2026 TA-1+MCTAT", "Sun, Dec 20, 2026 MCTAT", "Mon, Dec 21, 2026 TA-1"], "dates in order, county and state apart in December");
eq(P.moved.map(c => c.mon), ["Dec", "Feb", "Mar", "Jun", "Aug"], "moved months that carry a state return");
eq(P.unknown, [], "every schedule known");
eq(P.groups.find(g => s(g.due) === "2027-04-20").items.map(i => i.form).join(), "G-45,TA-1,MCTAT,G-49,TA-2,MCTAT", "April 20 carries the quarter, the month, both annuals and the county top-up");

// columns start at the first state due date that hasn't passed
eq(C.yearPlan(mauiA, D(2026, 10, 21)).cols[0].mon, "Nov", "day after the 20th starts with next month");
const dec21 = C.yearPlan(mauiA, D(2026, 12, 21));
eq([dec21.cols[0].mon, grid(dec21.rows[1]).slice(0, 1), grid(dec21.rows[2]).slice(0, 1)], ["Dec", "x", "."], "Dec 21: state TA-1 still due today, county's Sunday date has passed");
eq(dec21.next.dueText, "Mon, Dec 21, 2026", "next up on Dec 21 is that day");

const ltrP = C.yearPlan({ stay: "ltr", county: "kauai", rent: "b2", status: "current", home: "island", have: { get: true } }, oct1);
eq(ltrP.rows.map(r => [r.form, grid(r)]), [["G-45", "...x.....x.."], ["G-49", "......x....."]], "long-term: GET twice a year and the annual");
eq(ltrP.next.dueText, "Wed, Jan 20, 2027", "long-term semiannual filer's next date");
eq(ltrP.moved.map(c => c.mon), [], "no state return lands in a moved month");

const unsureP = C.yearPlan({ stay: "str", county: "kauai", rent: "unsure", status: "new", home: "abroad", have: {} }, oct1);
eq(unsureP.unknown, ["G-45", "TA-1", "KTAT"], "unknown rent leaves the periodic rows open");
eq(unsureP.next.dueText, "Tue, Apr 20, 2027", "with no schedule, the next known date is the annual");
const bothP = C.yearPlan({ stay: "both", county: "hawaii", rent: "b3", status: "letter", home: "island", have: { get: true, tat: true } }, oct1);
eq(bothP.unknown, ["TA-1", "HCTAT"], "mixed rental: TAT and county schedules open, GET known");
eq(grid(bothP.rows[0]), "...x.....x..", "mixed rental $36k to $44k: GET twice a year");

// ================================================================ exhaustive
// Every combination of answers, on three different "todays", must satisfy
// the rules below. One failure per rule is reported, with the answers.
const reported = new Set();
function inv(cond, rule, ctx) {
  if (cond) { pass++; return; }
  if (reported.has(rule)) { fail++; return; }
  reported.add(rule); fail++;
  console.log(`FAIL invariant: ${rule}\n   ${JSON.stringify(ctx)}`);
}
const isBiz = x => { const w = C.weekday(x); return w !== 0 && w !== 6 && !C.isHoliday(x); };
const ge = (a, b) => Date.UTC(a.y, a.m - 1, a.d) >= Date.UTC(b.y, b.m - 1, b.d);
let combos = 0;
for (const today of [D(2026, 1, 1), D(2026, 10, 1), D(2027, 12, 20)])
for (const stay of ["str", "ltr", "both"])
for (const county of ["honolulu", "maui", "hawaii", "kauai"])
for (const rent of ["b1", "b2", "b3", "b4", "b5", "unsure"])
for (const status of ["current", "behind", "letter", "new"])
for (const home of ["island", "state", "mainland", "abroad"])
for (let hv = 0; hv < 4; hv++) {
  const have = { get: !!(hv & 1), tat: !!(hv & 2) };
  const a = { stay, county, rent, status, home, have };
  const L = C.checklist(a, today);
  const ctx = { a, today: s(today) };
  const short = stay !== "ltr";
  combos++;
  inv(L.taxes.length === (short ? 3 : 1), "tax count matches rental type", ctx);
  inv(!!L.first === (status === "behind" || status === "letter"), "catch-up section only when behind or got a letter", ctx);
  const g45 = L.file.find(f => f.form === "G-45");
  inv(g45.frequency === (rent === "unsure" ? null : C.frequencyForBand(rent, C.RATES.get)), "G-45 frequency from the band", ctx);
  const ta1 = L.file.find(f => f.form === "TA-1");
  inv(!!ta1 === short, "TA-1 only for short-term", ctx);
  if (ta1) inv(ta1.frequency === (stay === "str" && rent !== "unsure" ? C.frequencyForBand(rent, C.RATES.tat) : null), "TA-1 frequency from the band, or none for mixed", ctx);
  inv(L.file.some(f => f.county) === short, "county row only for short-term", ctx);
  const needState = !have.get || (short && !have.tat);
  inv(L.register.some(r => r.id === "state") === needState, "state registration shown exactly when missing", ctx);
  inv(!L.register.some(r => r.id === "county"), "never a county registration step: the state TAT number covers it", ctx);
  inv(L.also.some(x => x.id === "local") === short, "every short-term rental gets the local contact rule", ctx);
  const cty = L.file.find(f => f.county);
  if (cty) {
    inv(cty.frequency === (ta1 ? ta1.frequency : null), "county paid on the TA-1 frequency", ctx);
    for (const n of (cty.next || [])) {
      inv(cty.shifts ? isBiz(n.due) : n.due.d === 20, "county dates: shifted only where the county says so", ctx);
      inv(ge(n.due, today), "county dates are today or later", ctx);
    }
    inv(cty.annualNext.due.m === 4 && ge(cty.annualNext.due, today), "county annual reconciliation in April, upcoming", ctx);
    inv(/^https:\/\//.test(cty.pay), "county pay link present", ctx);
  }
  inv(L.also.some(x => x.id === "bill47") === (short && county === "hawaii"), "Bill 47 only for Big Island short-term", ctx);
  inv(L.also.some(x => x.id === "abroad") === (home === "abroad"), "abroad note", ctx);
  for (const f of L.file) for (const n of (f.next || [])) {
    inv(isBiz(n.due), "every due date is a business day", ctx);
    inv(ge(n.due, today), "every due date is today or later", ctx);
  }
  for (const f of L.file) if (f.next && f.next.length === 2) inv(!ge(f.next[0].due, f.next[1].due), "next dates in order", ctx);
  const json = JSON.stringify(L);
  inv(!/undefined|NaN|\u2014/.test(json), "no undefined, NaN, or em dash", ctx);

  // the year plan the page draws
  const Y = C.yearPlan(a, today);
  inv(Y.cols.length === 12, "plan: twelve columns", ctx);
  Y.cols.forEach((c, j) => {
    inv(s(c.due) === s(C.businessDay(D(c.y, c.m, 20))), "plan: column date is that month's state due date", ctx);
    if (j) { const p0 = Y.cols[j - 1]; inv(c.y * 12 + c.m === p0.y * 12 + p0.m + 1, "plan: columns are consecutive months", ctx); }
    inv(c.moved === !!c.why, "plan: a moved column says why", ctx);
  });
  inv(ge(Y.cols[0].due, today), "plan: first column's date hasn't passed", ctx);
  const expectCount = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
  for (const r of Y.rows) {
    if (!r.frequency) { inv(r.cells === null, "plan: unknown schedule has no markers", ctx); continue; }
    const n = r.cells.filter(Boolean).length;
    inv(n === expectCount[r.frequency], `plan: ${r.frequency} row has ${expectCount[r.frequency]} markers`, Object.assign({ form: r.form, n }, ctx));
    r.cells.forEach((c, j) => { if (c) inv(c.due.y === Y.cols[j].y && c.due.m === Y.cols[j].m, "plan: marker sits in its month", ctx); });
  }
  inv(JSON.stringify(Y.unknown) === JSON.stringify(L.file.filter(f => !f.annual && !f.frequency).map(f => f.form)), "plan: unknown rows match the checklist", ctx);
  inv(Y.events.every(e => ge(e.due, today)), "plan: every event today or later", ctx);
  inv(Y.events.every(e => ge(e.due, Y.next.due)), "plan: next up is the earliest event", ctx);
  inv(Y.next.days === C.daysBetween(today, Y.next.due) && Y.next.days >= 0, "plan: days until next", ctx);
  inv(Y.moved.every(c => c.moved && c.marked), "plan: moved notes only where a state date moved", ctx);
  inv(!/undefined|NaN|\u2014/.test(JSON.stringify(Y)), "plan: no undefined, NaN, or em dash", ctx);
}
console.log(`swept ${combos} answer combinations`);

// Every day for five years, every frequency: the first upcoming due date is
// a business day, on or after today, and only moves forward on the day after
// it passes.
let days = 0;
for (const freq of ["monthly", "quarterly", "semiannual"]) {
  let prev = null;
  for (let t = D(2026, 1, 1); ge(D(2030, 12, 31), t); t = C.addDays(t, 1)) {
    const [n0, n1] = C.upcoming(freq, t, 2);
    days++;
    inv(isBiz(n0.due) && isBiz(n1.due), `${freq}: due dates are business days`, { t: s(t) });
    inv(ge(n0.due, t), `${freq}: first due is on or after today`, { t: s(t) });
    inv(!ge(n0.due, n1.due), `${freq}: second due after first`, { t: s(t) });
    if (prev && s(prev.due) !== s(n0.due)) inv(s(C.addDays(prev.due, 1)) === s(t), `${freq}: rolls forward only the day after a due date`, { t: s(t), was: s(prev.due) });
    prev = n0;
  }
  // annual too
}
for (let t = D(2026, 1, 1); ge(D(2030, 12, 31), t); t = C.addDays(t, 1)) {
  const n = C.nextAnnual(t);
  inv(isBiz(n.due) && ge(n.due, t), "annual: business day on or after today", { t: s(t) });
  inv(n.due.y === n.year + 1 && n.due.m === 4, "annual: April of the following year", { t: s(t) });
}
console.log(`swept ${days} day-frequency pairs`);

// Every day for five years: the plan's first column and next date never
// sit in the past, and the strip always shows the same twelve 20ths.
let planDays = 0;
const planA = [mauiA, { stay: "ltr", county: "honolulu", rent: "b1", status: "current", home: "island", have: { get: true } },
               { stay: "str", county: "hawaii", rent: "b5", status: "behind", home: "mainland", have: {} }];
for (let t = D(2026, 1, 1); ge(D(2030, 12, 31), t); t = C.addDays(t, 1)) {
  for (const a of planA) {
    const Y = C.yearPlan(a, t);
    planDays++;
    inv(ge(Y.cols[0].due, t) && ge(Y.next.due, t), "plan by day: nothing in the past", { t: s(t), a });
    inv(!ge(Y.cols[0].due, C.addDays(t, 62)), "plan by day: first column within two months", { t: s(t) });
  }
  const st = C.yearStrip(C.stripYear(t));
  inv(st.length === 12 && st.every(x => x.day >= 20 && x.day <= 24), "strip by day: twelve dates, 20th to 24th", { t: s(t) });
}
console.log(`swept ${planDays} day-plan pairs`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
