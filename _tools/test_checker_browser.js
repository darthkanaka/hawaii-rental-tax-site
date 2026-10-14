/* Browser test for the checker. Drives every control in a real Chrome,
   then checks the live statement, the full schedule, the summary and every
   date on screen against yearPlan() in checker-logic.js.

   Needs puppeteer-core somewhere on NODE_PATH and a local server:
     python3 -m http.server 8111   (from the repo root)
     NODE_PATH=<dir with node_modules> node _tools/test_checker_browser.js

   Google Analytics requests are blocked so tests never reach the real
   property; events are read from window.dataLayer instead. */
"use strict";
const puppeteer = require("puppeteer-core");
const C = require("../assets/js/checker-logic.js");
const CAL = require("./build_calendars.js");
const BASE = process.env.BASE || "http://localhost:8111";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TODAY = "2026-10-01";
const T = C.ymd(2026, 10, 1);

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; } else { fail++; console.log("FAIL " + label + (detail ? "\n   " + detail : "")); }
}
const same = (x, y, label) => ok(JSON.stringify(x) === JSON.stringify(y), label, `${JSON.stringify(x)}\n   vs ${JSON.stringify(y)}`);

async function page(browser, w) {
  const p = await browser.newPage();
  await p.setViewport({ width: w || 1100, height: 900 });
  await p.setRequestInterception(true);
  p.on("request", r => /google-analytics|googletagmanager|fonts\.g/.test(r.url()) ? r.abort() : r.continue());
  p.errors = [];
  p.on("pageerror", e => p.errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/net::ERR_FAILED|ERR_BLOCKED/.test(m.text())) p.errors.push(m.text()); });
  return p;
}

async function tap(p, sel) {
  await p.$eval(sel, el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await p.click(sel);
}

async function answer(p, a, keys) {
  for (const k of keys || ["stay", "county", "rent", "status", "home"]) await tap(p, `input[name="${k}"][value="${a[k]}"]`);
  if (keys) return;
  for (const k of ["get", "tat"]) {
    const box = await p.$(`#have-${k}`);
    const visible = await box.evaluate(el => !el.closest("[hidden]"));
    const checked = await box.evaluate(el => el.checked);
    if (visible && checked !== !!a.have[k]) await tap(p, `label:has(#have-${k})`);
  }
}
const events = p => p.evaluate(() => (window.dataLayer || []).filter(x => x[0] === "event"));

// ------------------------------------------------------------ what the rules say
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOW = { monthly: "monthly", quarterly: "quarterly", semiannual: "twice a year" };
const STAY = { str: "Short-term", ltr: "Long-term", both: "Short and long stays" };
const KIND = { get: "GET return", tat: "State TAT return", county: "County TAT payment", "annual-get": "Annual GET return",
               "annual-tat": "Annual state TAT return", "county-annual": "County TAT top-up, if your TA-2 shows one" };
const isCounty = e => e.kind === "county" || e.kind === "county-annual";
const formLabel = e => isCounty(e) ? "County TAT" : e.form;
function status(due) {
  const d = C.daysBetween(T, due);
  return d === 0 ? ["Due today", "Today"] : d === 1 ? ["Due tomorrow", "Tomorrow"] : d <= 30 ? [`Due in ${d} days`, `In ${d} days`] : ["Upcoming", "Upcoming"];
}
function freqs(a) {
  const known = a.rent && a.rent !== "unsure";
  return { get: known ? C.frequencyForBand(a.rent, C.RATES.get) : null, tat: known && a.stay === "str" ? C.frequencyForBand(a.rent, C.RATES.tat) : null };
}
function moved(e, county) {
  if (isCounty(e) && !county.shifts) return "";
  const sh = C.dueShift(e.due.y, e.due.m);
  return sh.moved && sh.due.d === e.due.d ? "Moved because " + sh.why : "";
}

function expected(a, partial) {
  const county = a.county ? C.COUNTIES[a.county] : null;
  const f = freqs(a);
  const band = C.BANDS.find(b => b.id === a.rent);
  const facts = [
    ["Rental", [a.stay && STAY[a.stay], county && county.name].filter(Boolean).join(", ") || "Not answered yet"],
    ["Yearly rent", a.rent ? (band ? band.label : "Not sure yet") : "Not answered yet"],
    ["General excise tax", "4.5%" + (f.get ? ", " + HOW[f.get] : "")],
    ["State TAT", !a.stay ? "Depends on question 1" : a.stay === "ltr" ? "Doesn't apply" : a.stay === "both" ? "11%, on short stays" : "11%" + (f.tat ? ", " + HOW[f.tat] : "")],
    ["County TAT", !a.stay ? "Depends on question 1" : a.stay === "ltr" ? "Doesn't apply" : a.stay === "both" ? "3%, on short stays" : "3%" + (f.tat ? ", " + HOW[f.tat] : "")]
  ];
  const canDate = a.stay && a.county && a.rent;
  if (!canDate) return { facts, coming: null };
  const P = C.yearPlan({ stay: a.stay, county: a.county, rent: a.rent, status: a.status || "current", home: a.home || "island", have: a.have || {} }, T);
  const coming = P.events.slice(0, 5).map(e => [MON[e.due.m - 1] + " " + e.due.d, formLabel(e),
    /^All of/.test(e.period) ? e.period : e.period.replace(/ \d{4}$/, ""), status(e.due)[1]]);
  const out = { facts, coming, unknown: P.unknown, next: P.next.dueText, nextLong: `${C.WEEKDAYS[C.weekday(P.next.due)]}, ${C.MONTHS[P.next.due.m - 1]} ${P.next.due.d}, ${P.next.due.y}`,
                nFilings: P.next.items.length, total: P.events.length };
  if (partial) return out;
  const L = P.list;
  return Object.assign(out, {
    title: `Your schedule, ${P.cols[0].month} ${P.cols[0].y} to ${P.cols[11].month} ${P.cols[11].y}`,
    rows: P.events.map((e, i) => ({ cells: [e.dueText, formLabel(e), KIND[e.kind], e.period, isCounty(e) ? county.county.replace(/^the /, "") : "State", status(e.due)[0]],
                                    moved: moved(e, county), hidden: i >= 12 })),
    groups: P.groups.map(g => g.dueText + " | " + g.items.map(e => formLabel(e) + " " + e.what).join(" / ")),
    rates: L.taxes.map(t => t.rate),
    register: L.register.map(r => r.title + "."),
    also: L.also.map(x => x.text + (x.link ? " " + x.link.text : "")),
    tools: L.tools.map(t => t.name),
    first: L.first ? L.first.title : null,
    countyAnnual: (L.file.find(x => x.county) || {}).annualNext
  });
}

async function shown(p) {
  return p.evaluate(() => {
    const txt = e => (e ? e.textContent.replace(/\s+/g, " ").trim() : null);
    // Footnote markers are checked separately, so compare the sentence without them.
    const bare = e => { if (!e) return null; const c = e.cloneNode(true); c.querySelectorAll("sup.fn").forEach(s => s.remove()); return txt(c); };
    const R = document.getElementById("results");
    const q = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const dts = q("#st-facts dt"), dds = q("#st-facts dd");
    return {
      facts: dts.map((d, i) => [txt(d), txt(dds[i])]),
      coming: q("#st-rows tr").map(tr => Array.from(tr.children).map(txt)),
      foot: txt(document.getElementById("st-foot")),
      strip: txt(document.getElementById("strip-text")),
      hidden: R.hidden,
      title: txt(R.querySelector("#results-title")),
      rows: q(".sched tbody tr", R).map(tr => {
        const cells = Array.from(tr.children).map(td => { const c = td.cloneNode(true); c.querySelectorAll(".moved").forEach(m => m.remove()); return txt(c); });
        return { cells, moved: txt(tr.querySelector(".moved")) || "", hidden: tr.hidden };
      }),
      groups: q(".date-list > li", R).map(li => txt(li.querySelector(".dl-date")) + " | " + q(".dl-items li", li).map(txt).join(" / ")),
      rates: q(".law .tax-rate", R).map(txt),
      register: q(".law .step-title", R).map(txt),
      also: q(".law li.also", R).map(bare),
      footnotes: q(".law sup.fn", R).map(txt),
      sourceCount: q(".notes-row .sources ol > li", R).length,
      tools: q(".tool-name", R).map(txt),
      first: txt(R.querySelector(".priority h3")),
      notes: txt(R.querySelector(".sched-notes")) || "",
      chartShown: !!R.querySelector(".sched-wrap") && getComputedStyle(R.querySelector(".sched-wrap")).display !== "none",
      listShown: !!R.querySelector(".date-list") && getComputedStyle(R.querySelector(".date-list")).display !== "none",
      focused: document.activeElement && document.activeElement.id,
      hash: location.hash,
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

function compareStatement(got, e, label) {
  same(got.facts, e.facts, `${label}: statement facts`);
  if (!e.coming) {
    ok(got.coming.length === 1 && /questions 1 to 3/.test(got.coming[0][0]), `${label}: statement waits for question 3`, JSON.stringify(got.coming));
    return;
  }
  same(got.coming.slice(0, e.coming.length), e.coming, `${label}: coming up rows`);
  ok(got.coming.length === e.coming.length + (e.unknown.length ? 1 : 0), `${label}: open schedules get one extra line`, JSON.stringify(got.coming));
  ok(got.foot.includes("Next due " + e.next), `${label}: next due in the statement`, got.foot);
  ok(got.strip.includes("Next due " + e.nextLong) && (e.nFilings > 1 ? got.strip.includes(`with ${e.nFilings} filings that day`) : true), `${label}: strip shows the next due date`, got.strip);
}

function compareResults(got, e, label) {
  ok(!got.hidden, `${label}: schedule and summary visible`);
  same(got.title, e.title, `${label}: schedule heading`);
  same(got.rows.map(r => r.cells), e.rows.map(r => r.cells), `${label}: every schedule row`);
  same(got.rows.map(r => r.moved), e.rows.map(r => r.moved), `${label}: moved dates say why`);
  same(got.rows.map(r => r.hidden), e.rows.map(r => r.hidden), `${label}: first 12 shown, the rest behind the button`);
  same(got.groups, e.groups, `${label}: phone list has every date`);
  same(got.rates, e.rates, `${label}: rates`);
  same(got.register, e.register, `${label}: registration steps`);
  same(got.also, e.also, `${label}: also required`);
  const fns = got.footnotes.map(Number);
  ok(fns.length >= 2 && fns.every((n, i) => n >= 1 && n <= got.sourceCount && (i === 0 || n > fns[i - 1])), `${label}: footnotes ascend and each has a source`, JSON.stringify(got.footnotes) + " of " + got.sourceCount);
  same(got.tools, e.tools, `${label}: tools`);
  same(got.first || null, e.first, `${label}: catch-up panel`);
  if (e.countyAnnual) ok(got.notes.includes(e.countyAnnual.dueText), `${label}: county annual date in the notes`, got.notes);
  ok(got.foot.includes(`See all ${e.total} dates`), `${label}: statement links to all ${e.total} dates`, got.foot);
  ok(!/Answer the rest/.test(got.strip), `${label}: strip stops asking once complete`, got.strip);
}

// The calendar offer: right links for the answers, the file it points at is
// the one the builder makes, and every control works.
async function checkCalendar(p, a, label) {
  const later = await p.$(".cal-later");
  if (a.rent === "unsure") {
    ok(!!later && !(await p.$("#cal-toggle")), `${label}: no calendar until the rent is known`);
    return;
  }
  const file = "/calendar/" + CAL.fileName(a);
  const c = await p.evaluate(() => {
    const t = document.getElementById("cal-toggle"), o = document.getElementById("cal-options");
    return t && { text: t.textContent.trim(), exp: t.getAttribute("aria-expanded"), hidden: o.hidden,
      note: document.querySelector(".cal-row p").textContent,
      apple: document.getElementById("cal-apple").getAttribute("href"),
      google: document.getElementById("cal-google").getAttribute("href"),
      googleRel: document.getElementById("cal-google").rel,
      copy: document.getElementById("cal-copy").getAttribute("data-link"), host: location.host, origin: location.origin };
  });
  if (!c) { ok(false, `${label}: calendar button shown`); return; }
  ok(c.text === "Add these dates to my calendar" && c.exp === "false" && c.hidden, `${label}: calendar button starts closed`, JSON.stringify(c));
  ok(/no email and no sign-up/.test(c.note), `${label}: calendar says no email`, c.note);
  const feed = "webcal://" + c.host + file;
  ok(c.apple === feed, `${label}: Apple link subscribes to the right file`, c.apple);
  ok(c.google === "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(feed) && c.googleRel.includes("noopener"), `${label}: Google link adds the right file`, c.google);
  ok(c.copy === c.origin + file, `${label}: copied link is the right file`, c.copy);
  const got = await p.evaluate(async f => { const r = await fetch(f, { cache: "no-store" }); return { status: r.status, type: r.headers.get("content-type"), body: await r.text() }; }, file);
  ok(got.status === 200 && /^text\/calendar/.test(got.type || ""), `${label}: calendar file is served as a calendar`, got.status + " " + got.type);
  ok(got.body === CAL.ics(a), `${label}: served calendar matches the builder`);
}

// Scenarios chosen so every option of every question appears at least once.
const SCEN = [
  { stay: "str",  county: "honolulu", rent: "b1", status: "current", home: "island",   have: { get: true, tat: true } },
  { stay: "str",  county: "maui",     rent: "b4", status: "behind",  home: "mainland", have: {} },
  { stay: "ltr",  county: "kauai",    rent: "b2", status: "letter",  home: "state",    have: { get: true } },
  { stay: "both", county: "hawaii",   rent: "b3", status: "new",     home: "abroad",   have: { get: true, tat: true } },
  { stay: "str",  county: "hawaii",   rent: "b5", status: "behind",  home: "island",   have: {} },
  { stay: "ltr",  county: "maui",     rent: "unsure", status: "current", home: "mainland", have: {} },
  { stay: "both", county: "honolulu", rent: "b5", status: "letter",  home: "abroad",   have: {} },
  { stay: "str",  county: "kauai",    rent: "unsure", status: "new", home: "state",    have: { get: true } },
  { stay: "ltr",  county: "honolulu", rent: "b5", status: "behind",  home: "island",   have: {} },
  { stay: "str",  county: "maui",     rent: "b2", status: "current", home: "island",   have: { get: true, tat: true } },
  { stay: "both", county: "kauai",    rent: "b1", status: "current", home: "mainland", have: { get: true, tat: true } },
  { stay: "ltr",  county: "hawaii",   rent: "b4", status: "new",     home: "abroad",   have: {} }
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

  // ---- 1. the empty page, then validation from the strip's button
  let p = await page(browser);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  let s = await shown(p);
  compareStatement(s, expected({}), "empty page");
  ok(s.hidden, "no schedule before any answer");
  ok(/shows after question 3/.test(s.foot), "next due waits for question 3", s.foot);
  const colophon = await p.$eval("#rules-checked", e => e.textContent);
  const rc = C.RULES_CHECKED.split("-").map(Number);
  ok(colophon === `Rules current as of ${C.MONTHS[rc[1] - 1]} ${rc[2]}, ${rc[0]}`, "colophon date matches RULES_CHECKED", colophon);
  await tap(p, "#see-schedule");
  const v = await p.evaluate(() => ({
    invalid: Array.from(document.querySelectorAll("fieldset.invalid")).map(f => f.id),
    errors: Array.from(document.querySelectorAll(".field-error")).filter(e => !e.hidden).length,
    focus: document.activeElement && document.activeElement.name,
    resultsHidden: document.getElementById("results").hidden
  }));
  ok(v.invalid.join() === "q-stay,q-county,q-rent,q-status,q-home", "the button flags all five missing answers", v.invalid.join());
  ok(v.errors === 5, "five error messages shown", String(v.errors));
  ok(v.focus === "stay", "focus moves to the first missing question", v.focus);
  ok(v.resultsHidden, "no schedule when incomplete");
  ok((await events(p)).map(x => x[1]).includes("checker_incomplete"), "incomplete event sent");
  await tap(p, 'input[name="stay"][value="str"]');
  ok(await p.$eval("#q-stay", f => !f.classList.contains("invalid")), "answering clears that question's error");
  ok((await events(p)).map(x => x[1]).includes("checker_start"), "start event sent on first answer");

  // ---- 2. the TAT box follows the stay answer
  const vis = async () => p.evaluate(() => !document.getElementById("have-tat").closest("[hidden]"));
  ok(await vis(), "TAT box visible for short-term");
  await tap(p, "label:has(#have-tat)");
  await tap(p, 'input[name="stay"][value="ltr"]');
  ok(!(await vis()), "TAT box hidden for long-term");
  ok(!(await p.$eval("#have-tat", e => e.checked)), "hidden TAT box is cleared");
  await tap(p, 'input[name="stay"][value="both"]');
  ok(await vis(), "TAT box back for mixed");
  ok(p.errors.length === 0, "no console errors on the form", p.errors.join(" | "));
  await p.close();

  // ---- 3. every scenario: the statement fills in live, then the full schedule
  for (let i = 0; i < SCEN.length; i++) {
    const a = SCEN[i], label = `scenario ${i + 1} (${a.stay}/${a.county}/${a.rent}/${a.status}/${a.home})`;
    p = await page(browser);
    await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
    await answer(p, a, ["stay", "county"]);
    s = await shown(p);
    compareStatement(s, expected({ stay: a.stay, county: a.county }), `${label} after two answers`);
    await answer(p, a, ["rent"]);
    s = await shown(p);
    compareStatement(s, expected({ stay: a.stay, county: a.county, rent: a.rent }, true), `${label} after three answers`);
    ok(s.hidden, `${label}: schedule waits for every answer`);
    ok(/Answer the rest/.test(s.strip), `${label}: strip asks for the rest`, s.strip);
    await answer(p, a);
    await new Promise(r => setTimeout(r, 100));
    s = await shown(p);
    const e = expected(a);
    compareStatement(s, e, label);
    compareResults(s, e, label);
    ok(s.chartShown && !s.listShown, `${label}: desktop shows the table`);
    await checkCalendar(p, a, label);
    const done = (await events(p)).filter(x => x[1] === "checker_complete").map(x => x[2]);
    ok(done.length === 1 && done[0].stay === a.stay && done[0].county === a.county && done[0].rent === a.rent && done[0].status === a.status && done[0].home === a.home && done[0].source === "live",
       `${label}: one complete event carrying the choices`, JSON.stringify(done));
    ok(!JSON.stringify(done).match(/@|\d{3}-\d{2}-\d{4}/), `${label}: event has nothing personal`);
    await tap(p, "#see-schedule");
    await new Promise(r => setTimeout(r, 200));
    ok((await p.evaluate(() => document.activeElement && document.activeElement.id)) === "results-title", `${label}: the button takes you to the schedule`);
    ok(p.errors.length === 0, `${label}: no console errors`, p.errors.join(" | "));

    // ---- 4. the link round-trips: a fresh page on the same hash shows the same statement
    const q = await page(browser);
    await q.goto(`${BASE}/?today=${TODAY}${s.hash}`, { waitUntil: "load" });
    await new Promise(r => setTimeout(r, 100));
    const again = await shown(q);
    compareStatement(again, e, `${label} via link`);
    compareResults(again, e, `${label} via link`);
    same(again.rows, s.rows, `${label}: link shows the identical schedule`);
    const prefilled = await q.evaluate(() => ["stay", "county", "rent", "status", "home"].map(n => (document.querySelector(`input[name="${n}"]:checked`) || {}).value));
    ok(prefilled.join() === [a.stay, a.county, a.rent, a.status, a.home].join(), `${label}: link prefills the form`, prefilled.join());
    const linkEv = (await events(q)).filter(x => x[1] === "checker_complete").map(x => x[2].source);
    ok(linkEv.join() === "link", `${label}: link visit reported as a link`, linkEv.join());
    await q.close();
    await p.close();
  }

  // ---- 5. changing an answer redraws everything, and the buttons work
  p = await page(browser);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  await answer(p, SCEN[1]);
  await tap(p, 'input[name="rent"][value="b5"]');
  await new Promise(r => setTimeout(r, 100));
  const changed = Object.assign({}, SCEN[1], { rent: "b5" });
  s = await shown(p);
  compareStatement(s, expected(changed), "after changing the rent");
  compareResults(s, expected(changed), "after changing the rent");
  ok(/r=b5/.test(s.hash), "the link follows the change", s.hash);
  ok((await events(p)).filter(x => x[1] === "checker_complete").length === 1, "a change doesn't send a second complete event");

  const total = s.rows.length;
  if (total > 12) {
    await tap(p, "#show-all");
    let st = await p.evaluate(() => ({ hidden: document.querySelectorAll(".sched tbody tr[hidden]").length, exp: document.getElementById("show-all").getAttribute("aria-expanded"), text: document.getElementById("show-all").textContent }));
    ok(st.hidden === 0 && st.exp === "true" && st.text === "Show fewer dates", "show all reveals every date", JSON.stringify(st));
    await tap(p, "#show-all");
    st = await p.evaluate(() => ({ hidden: document.querySelectorAll(".sched tbody tr[hidden]").length, exp: document.getElementById("show-all").getAttribute("aria-expanded"), text: document.getElementById("show-all").textContent }));
    ok(st.hidden === total - 12 && st.exp === "false" && st.text === `Show all ${total} dates`, "show fewer hides them again", JSON.stringify(st));
  }
  await tap(p, "#cal-toggle");
  let cs = await p.evaluate(() => ({ exp: document.getElementById("cal-toggle").getAttribute("aria-expanded"), hidden: document.getElementById("cal-options").hidden,
    names: Array.from(document.querySelectorAll(".cal-opt b")).map(b => b.textContent) }));
  ok(cs.exp === "true" && !cs.hidden && cs.names.join() === "Apple Calendar,Google Calendar,Other calendar apps", "calendar button opens three choices", JSON.stringify(cs));
  ok((await events(p)).some(x => x[1] === "calendar_open"), "opening the calendar choices is tracked");
  await p.evaluate(() => document.querySelectorAll("a.cal-opt").forEach(a => a.addEventListener("click", ev => ev.preventDefault())));
  await tap(p, "#cal-apple");
  await tap(p, "#cal-google");
  await tap(p, "#cal-copy");
  await new Promise(r => setTimeout(r, 300));
  const calClicks = (await events(p)).filter(x => x[1] === "click").map(x => x[2].label);
  ok(["calendar_apple", "calendar_google", "calendar_copy"].every(l => calClicks.includes(l)), "each calendar choice is tracked", calClicks.join());
  const calStatus = await p.$eval(".cal-status", e => e.textContent);
  ok(/^Link copied\./.test(calStatus) || calStatus.includes("/calendar/" + CAL.fileName(changed)), "copying the calendar link gives feedback", calStatus);
  await tap(p, "#cal-toggle");
  cs = await p.evaluate(() => ({ exp: document.getElementById("cal-toggle").getAttribute("aria-expanded"), hidden: document.getElementById("cal-options").hidden }));
  ok(cs.exp === "false" && cs.hidden, "calendar button closes the choices again", JSON.stringify(cs));
  await tap(p, "#copy-link");
  await new Promise(r => setTimeout(r, 300));
  ok(/Link copied|address bar/.test(await p.$eval(".copy-status", e => e.textContent)), "copy link gives feedback");
  await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await tap(p, "#print-statement");
  ok((await p.evaluate(() => window.__printed)) === 1, "print opens the print dialog");
  await tap(p, "#edit-answers");
  await new Promise(r => setTimeout(r, 600));
  ok(await p.evaluate(() => document.activeElement && document.activeElement.name === "stay"), "change my answers returns to question 1");
  await p.evaluate(() => document.querySelectorAll(".tool-row a").forEach(a => a.addEventListener("click", ev => ev.preventDefault())));
  const toolLinks = await p.$$(".tool-row a");
  const before = (await events(p)).filter(x => x[1] === "outbound_click").length;
  for (const l of toolLinks) await l.click();
  const clicks = (await events(p)).filter(x => x[1] === "outbound_click").length - before;
  ok(clicks === toolLinks.length, "every tool link records an outbound click", `${clicks} of ${toolLinks.length}`);
  const rows = await p.$$eval(".tool-row", lis => lis.map(li => {
    const a = li.querySelector("a");
    return { name: a.textContent.trim(), href: a.href, rel: a.rel, target: a.target, note: (li.querySelector(".tool-note") || {}).textContent || null, text: li.textContent };
  }));
  for (const r of rows) {
    const t = Object.values(C.TOOLS).find(x => x.name === r.name);
    ok(r.href === t.href, `${r.name}: links where the rules say`, r.href);
    ok(r.target === "_blank" && r.rel.split(" ").includes("noopener"), `${r.name}: opens safely in a new tab`, r.rel);
    ok(r.rel.split(" ").includes("sponsored") === t.affiliate, `${r.name}: rel sponsored only on an affiliate link`, r.rel);
    ok(!!r.note === t.affiliate, `${r.name}: commission note only on an affiliate link`, String(r.note));
    if (t.perk) ok(r.text.includes(t.perk) === t.affiliate, `${r.name}: the discount shows only through the affiliate link`, r.text);
  }
  ok(rows.some(r => r.name === "Hospitable") && rows.some(r => r.name === "Baselane"), "this scenario shows both affiliate links");
  ok(p.errors.length === 0, "no console errors on the buttons", p.errors.join(" | "));
  await p.close();

  // ---- 6. phone width: nothing spills sideways, and the list replaces the table
  p = await page(browser, 375);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  ok((await shown(p)).overflow <= 0, "375px: page fits before answering");
  await answer(p, SCEN[6]);
  await new Promise(r => setTimeout(r, 100));
  s = await shown(p);
  ok(s.overflow <= 0, "375px: page fits with the full schedule", String(s.overflow));
  ok(!s.chartShown && s.listShown, "375px: the date list replaces the table");
  await tap(p, "#cal-toggle");
  ok((await shown(p)).overflow <= 0, "375px: calendar choices fit");
  compareResults(s, expected(SCEN[6]), "375px");
  await p.screenshot({ path: process.env.SHOT || "/tmp/checker-375.png", fullPage: true });
  await p.close();

  // ---- 6b. the checklist prompt at the top of /rates/, where search visitors land
  for (const w of [1100, 375]) {
    p = await page(browser, w);
    await p.goto(`${BASE}/rates/`, { waitUntil: "load" });
    const strip = await p.evaluate(() => {
      const a = document.querySelector(".cta-strip a.btn");
      const h2 = document.querySelector("main h2");
      return a && { href: a.getAttribute("href"), text: a.textContent.trim(),
        beforeFirstH2: !!(a.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING),
        top: a.getBoundingClientRect().top, vh: window.innerHeight, overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    ok(!!strip && strip.href === "/#checker" && strip.text === "Begin the checklist", `${w}px: /rates/ has the checklist prompt`, JSON.stringify(strip));
    if (strip) {
      ok(strip.beforeFirstH2, `${w}px: the prompt sits above the first rate table`);
      if (w === 1100) ok(strip.top < strip.vh, "1100px: the prompt shows without scrolling", `${strip.top} of ${strip.vh}`);
      ok(strip.overflow <= 0, `${w}px: /rates/ fits`, String(strip.overflow));
    }
    if (w === 1100) {
      await p.evaluate(() => document.querySelector(".cta-strip a.btn").addEventListener("click", ev => ev.preventDefault(), { once: true }));
      await tap(p, ".cta-strip a.btn");
      const ev = (await events(p)).filter(x => x[1] === "click").map(x => x[2].label);
      ok(ev.includes("rates_top_cta"), "the prompt records its click", ev.join());
      await Promise.all([p.waitForNavigation({ waitUntil: "load" }), tap(p, ".cta-strip a.btn")]);
      await new Promise(r => setTimeout(r, 300));
      const land = await p.evaluate(() => ({ path: location.pathname, hash: location.hash, top: document.getElementById("checker").getBoundingClientRect().top, vh: window.innerHeight }));
      ok(land.path === "/" && land.hash === "#checker" && land.top < land.vh, "the prompt opens the checklist", JSON.stringify(land));
    }
    ok(p.errors.length === 0, `${w}px: /rates/ has no console errors`, p.errors.join(" | "));
    await p.close();
  }

  // ---- 7. every other page loads clean, fits a phone, and links to the checklist
  for (const path of ["/rates/", "/learn/", "/learn/bill-47-catch-up-checklist/", "/learn/hawaii-tat-11-percent/",
                      "/learn/get-tax-long-term-rentals/", "/privacy/", "/terms/", "/404.html"]) {
    for (const w of [1100, 375]) {
      p = await page(browser, w);
      const res = await p.goto(BASE + path, { waitUntil: "load" });
      ok(res.status() === 200, `${path} loads at ${w}px`, String(res.status()));
      ok(p.errors.length === 0, `${path} has no console errors at ${w}px`, p.errors.join(" | "));
      const info = await p.evaluate(() => ({ links: document.querySelectorAll('a[href="/#checker"]').length,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        logo: !!document.querySelector('.site-header img[src$="logo-horizontal-on-light.svg"]') }));
      ok(info.links >= 1, `${path} links to the checklist`, String(info.links));
      ok(info.overflow <= 0, `${path} fits at ${w}px`, String(info.overflow));
      ok(info.logo, `${path} shows the logo`);
      await p.close();
    }
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
