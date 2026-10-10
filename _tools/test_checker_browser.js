/* Browser test for the checker. Drives every control in a real Chrome,
   then checks every date, marker, rate and line on screen against
   yearPlan() in checker-logic.js.

   Needs puppeteer-core somewhere on NODE_PATH and a local server:
     python3 -m http.server 8111   (from the repo root)
     NODE_PATH=<dir with node_modules> node _tools/test_checker_browser.js

   Google Analytics requests are blocked so tests never reach the real
   property; events are read from window.dataLayer instead. */
"use strict";
const puppeteer = require("puppeteer-core");
const C = require("../assets/js/checker-logic.js");
const BASE = process.env.BASE || "http://localhost:8111";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TODAY = "2026-10-01";
const T = C.ymd(2026, 10, 1);

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; } else { fail++; console.log("FAIL " + label + (detail ? "\n   " + detail : "")); }
}

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

// Center the control first: the sticky header can sit over anything near
// the top of the window, and a click there lands on the header instead.
async function tap(p, sel) {
  await p.$eval(sel, el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await p.click(sel);
}

async function answer(p, a) {
  for (const k of ["stay", "county", "rent", "status", "home"]) await tap(p, `input[name="${k}"][value="${a[k]}"]`);
  for (const k of ["get", "tat"]) {
    const box = await p.$(`#have-${k}`);
    const visible = await box.evaluate(el => !el.closest("[hidden]"));
    const checked = await box.evaluate(el => el.checked);
    if (visible && checked !== !!a.have[k]) await tap(p, `label:has(#have-${k})`);
  }
}

// What the page should show, straight from the rules.
function expected(a) {
  const P = C.yearPlan(a, T), L = P.list;
  const cf = L.file.find(f => f.county);
  const n = P.next;
  return {
    rates: L.taxes.map(t => t.rate),
    register: L.register.map(r => r.title),
    cols: P.cols.map(c => c.mon + c.day),
    rows: P.rows.map(r => ({ form: r.form, grid: r.cells ? r.cells.map(c => c ? "x" : ".").join("") : "open",
                             dates: r.cells ? r.cells.filter(Boolean).map(c => "Due " + c.dueText) : [] })),
    groups: P.groups.map(g => g.dueText + " | " + g.items.map(i => i.form + " " + i.what).join(" / ")),
    next: n.dueText,
    nextBig: C.fmt(n.due).split(", ")[1],
    nextWhen: n.weekday + ", " + (n.days === 0 ? "today" : n.days === 1 ? "tomorrow" : n.days + " days from today"),
    nextItems: n.items.map(i => i.form + " " + i.what),
    sups: P.moved.length,
    stars: (P.moved.some(c => c.weekend) ? 1 : 0) + P.moved.filter(c => !c.weekend).length,
    countyAnnual: cf ? cf.annualNext.dueText : null,
    title: "Your year, " + P.cols[0].month + " to " + P.cols[11].month,
    also: L.also.map(x => x.text + (x.link ? " " + x.link.text : "")),
    tools: L.tools.map(t => t.name),
    first: L.first ? L.first.title : null,
    unknown: P.unknown
  };
}

async function shown(p) {
  return p.evaluate(() => {
    const R = document.getElementById("results");
    const q = (sel, root) => Array.from((root || R).querySelectorAll(sel));
    const txt = e => (e ? e.textContent.replace(/\s+/g, " ").trim() : null);
    const box = R.querySelector(".next-box");
    return {
      hidden: R.hidden,
      title: txt(R.querySelector("#results-title")),
      rates: q(".tax-rate").map(txt),
      register: q(".step-title").map(txt),
      cols: q(".year-chart thead .cols th:not(.due-h)").map(th => th.querySelector(".mon").textContent + th.querySelector(".day").childNodes[0].textContent),
      rows: q(".year-chart tbody tr").map(tr => ({
        form: tr.dataset.form,
        grid: tr.querySelector("td.open") ? "open" : Array.from(tr.querySelectorAll("td")).map(td => td.querySelector(".mk") ? "x" : ".").join(""),
        dates: Array.from(tr.querySelectorAll("td .sr-only")).map(e => e.textContent)
      })),
      groups: q(".date-list li").map(li => txt(li.querySelector(".dl-date")) + " | " + Array.from(li.querySelectorAll(".dl-items > span")).map(txt).join(" / ")),
      next: box && box.dataset.due,
      nextBig: txt(box && box.querySelector(".next-date")),
      nextWhen: txt(box && box.querySelector(".next-when")),
      nextItems: q(".next-items li").map(li => Array.from(li.children).map(txt).join(" ")),
      nextNote: txt(box && box.querySelector(".next-note")),
      sups: q(".year-chart thead sup").length,
      stars: q(".notes .star").length,
      notes: txt(R.querySelector(".notes")) || "",
      summary: txt(R.querySelector(".summary")),
      also: q(".also-list li").map(txt),
      tools: q(".tool-name").map(txt),
      first: (R.querySelector(".priority h3") || {}).textContent || null,
      chartShown: !!R.querySelector(".chart-wrap") && getComputedStyle(R.querySelector(".chart-wrap")).display !== "none",
      listShown: !!R.querySelector(".date-list") && getComputedStyle(R.querySelector(".date-list")).display !== "none",
      focused: document.activeElement && document.activeElement.id,
      hash: location.hash,
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

function compare(a, got, label) {
  const e = expected(a);
  const same = (x, y, what) => ok(JSON.stringify(x) === JSON.stringify(y), `${label}: ${what}`, `${JSON.stringify(x)}\n   vs ${JSON.stringify(y)}`);
  ok(!got.hidden, `${label}: results visible`);
  same(got.title, e.title, "heading names the twelve months");
  same(got.rates, e.rates, "rates");
  same(got.register, e.register, "registration steps");
  same(got.cols, e.cols, "column dates");
  same(got.rows.map(r => r.form), e.rows.map(r => r.form), "rows");
  e.rows.forEach((er, i) => {
    const gr = got.rows[i] || {};
    same(gr.grid, er.grid, `${er.form} markers`);
    same(gr.dates, er.dates, `${er.form} dates read aloud`);
  });
  same(got.groups, e.groups, "every due date in order");
  same(got.next, e.next, "next up date");
  same(got.nextBig, e.nextBig, "next up big date");
  same(got.nextWhen, e.nextWhen, "next up weekday and countdown");
  same(got.nextItems, e.nextItems, "next up items");
  ok(!!got.nextNote === e.unknown.length > 0, `${label}: open schedules get a note`, got.nextNote);
  if (e.unknown.length) ok(e.unknown.every(f => got.nextNote.includes(f)), `${label}: note names the open forms`, got.nextNote);
  same(got.sups, e.sups, "moved dates marked");
  same(got.stars, e.stars, "a note for each kind of move");
  if (e.countyAnnual) ok(got.notes.includes(e.countyAnnual), `${label}: county annual date in the notes`, got.notes);
  const dates = (got.summary + " " + got.notes).match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}, \d{4}/g) || [];
  ok(dates.every(d => e.groups.some(g => g.startsWith(d)) || d === e.countyAnnual), `${label}: notes show only rule dates`, dates.join(" | "));
  same(got.also, e.also, "also required");
  same(got.tools, e.tools, "tools");
  same(got.first || null, e.first, "catch-up panel");
}

// Scenarios chosen so every option of every question appears at least once.
const SCEN = [
  { stay: "str",  county: "honolulu", rent: "b1", status: "current", home: "island",   have: { get: true, tat: true, ctat: true } },
  { stay: "str",  county: "maui",     rent: "b4", status: "behind",  home: "mainland", have: {} },
  { stay: "ltr",  county: "kauai",    rent: "b2", status: "letter",  home: "state",    have: { get: true } },
  { stay: "both", county: "hawaii",   rent: "b3", status: "new",     home: "abroad",   have: { get: true, tat: true } },
  { stay: "str",  county: "hawaii",   rent: "b5", status: "behind",  home: "island",   have: { ctat: true } },
  { stay: "ltr",  county: "maui",     rent: "unsure", status: "current", home: "mainland", have: {} },
  { stay: "both", county: "honolulu", rent: "b5", status: "letter",  home: "abroad",   have: {} },
  { stay: "str",  county: "kauai",    rent: "unsure", status: "new", home: "state",    have: { get: true } },
  { stay: "ltr",  county: "honolulu", rent: "b5", status: "behind",  home: "island",   have: {} },
  { stay: "str",  county: "maui",     rent: "b2", status: "current", home: "island",   have: { get: true, tat: true } },
  { stay: "both", county: "kauai",    rent: "b1", status: "current", home: "mainland", have: { get: true, tat: true, ctat: true } },
  { stay: "ltr",  county: "hawaii",   rent: "b4", status: "new",     home: "abroad",   have: {} }
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

  // ---- 1. validation: submitting empty flags all five required questions
  let p = await page(browser);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  await tap(p, 'button[type="submit"]');
  const v = await p.evaluate(() => ({
    invalid: Array.from(document.querySelectorAll("fieldset.invalid")).map(f => f.id),
    errors: Array.from(document.querySelectorAll(".field-error")).filter(e => !e.hidden).length,
    focus: document.activeElement && document.activeElement.name,
    resultsHidden: document.getElementById("results").hidden,
    events: (window.dataLayer || []).filter(x => x[0] === "event").map(x => x[1])
  }));
  ok(v.invalid.join() === "q-stay,q-county,q-rent,q-status,q-home", "validation flags all five", v.invalid.join());
  const strip = await p.evaluate(() => ({
    year: document.getElementById("strip-year").textContent,
    sub: document.getElementById("strip-sub").textContent,
    days: Array.from(document.querySelectorAll("#strip-list li")).map(li => li.querySelector(".mon").textContent + li.querySelector(".day").textContent + (li.classList.contains("moved") ? "*" : ""))
  }));
  const sy = C.stripYear(T), st = C.yearStrip(sy);
  ok(strip.year === String(sy), "strip shows the right year", strip.year);
  ok(strip.days.join() === st.map(x => x.mon + x.day + (x.moved ? "*" : "")).join(), "strip shows every monthly due date", strip.days.join());
  ok(strip.sub.includes(["None", "One", "Two", "Three", "Four", "Five", "Six"][st.filter(x => x.moved).length]), "strip counts the moves", strip.sub);
  ok(v.errors === 5, "five error messages shown", String(v.errors));
  ok(v.focus === "stay", "focus moves to the first missing question", v.focus);
  ok(v.resultsHidden, "no results when incomplete");
  ok(v.events.includes("checker_incomplete"), "incomplete event sent", v.events.join());
  // answering a question clears its error
  await tap(p, 'input[name="stay"][value="str"]');
  ok(await p.$eval("#q-stay", f => !f.classList.contains("invalid")), "answering clears that question's error");
  ok((await p.evaluate(() => (window.dataLayer || []).filter(x => x[0] === "event").map(x => x[1]))).includes("checker_start"), "start event sent on first answer");

  // ---- 2. short-term-only boxes follow the stay answer
  const vis = async () => p.evaluate(() => ["have-tat"].map(id => !document.getElementById(id).closest("[hidden]")));
  ok((await vis()).every(Boolean), "TAT boxes visible for short-term");
  await tap(p, "label:has(#have-tat)");
  await tap(p, 'input[name="stay"][value="ltr"]');
  ok((await vis()).every(x => !x), "TAT boxes hidden for long-term");
  ok(!(await p.$eval("#have-tat", e => e.checked)), "hidden TAT box is cleared");
  await tap(p, 'input[name="stay"][value="both"]');
  ok((await vis()).every(Boolean), "TAT boxes back for mixed");
  ok(!(await p.$("#have-ctat")), "no county registration checkbox, since none exists");
  ok(p.errors.length === 0, "no console errors on the form", p.errors.join(" | "));
  await p.close();

  // ---- 3. every scenario, every number on screen
  for (let i = 0; i < SCEN.length; i++) {
    const a = SCEN[i], label = `scenario ${i + 1} (${a.stay}/${a.county}/${a.rent}/${a.status}/${a.home})`;
    p = await page(browser);
    await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
    await answer(p, a);
    await tap(p, 'button[type="submit"]');
    await new Promise(r => setTimeout(r, 150));
    const got = await shown(p);
    compare(a, got, label);
    ok(got.focused === "results-title", `${label}: focus moves to the checklist`, got.focused);
    ok(got.chartShown && !got.listShown, `${label}: desktop shows the chart`);
    const ev = await p.evaluate(() => (window.dataLayer || []).filter(x => x[0] === "event" && x[1] === "checker_complete").map(x => x[2]));
    ok(ev.length === 1 && ev[0].stay === a.stay && ev[0].county === a.county && ev[0].rent === a.rent && ev[0].status === a.status && ev[0].home === a.home,
       `${label}: complete event carries the choices`, JSON.stringify(ev));
    ok(!JSON.stringify(ev).match(/@|\d{3}-\d{2}-\d{4}/), `${label}: event has nothing personal`);
    ok(p.errors.length === 0, `${label}: no console errors`, p.errors.join(" | "));

    // ---- 4. the link round-trips: a fresh page on the same hash shows the same checklist
    const q = await page(browser);
    await q.goto(`${BASE}/?today=${TODAY}${got.hash}`, { waitUntil: "load" });
    await new Promise(r => setTimeout(r, 150));
    const again = await shown(q);
    compare(a, again, `${label} via link`);
    ok(JSON.stringify(again.rows) === JSON.stringify(got.rows) && JSON.stringify(again.groups) === JSON.stringify(got.groups), `${label}: link shows the identical year`);
    const prefilled = await q.evaluate(() => ["stay","county","rent","status","home"].map(n => (document.querySelector(`input[name="${n}"]:checked`) || {}).value));
    ok(prefilled.join() === [a.stay, a.county, a.rent, a.status, a.home].join(), `${label}: link prefills the form`, prefilled.join());
    await q.close();
    await p.close();
  }

  // ---- 5. the buttons under the checklist, and the tool links
  p = await page(browser);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  await answer(p, SCEN[1]);
  await tap(p, 'button[type="submit"]');
  await new Promise(r => setTimeout(r, 150));
  await tap(p, "#copy-link");
  await new Promise(r => setTimeout(r, 300));
  const copyMsg = await p.$eval(".copy-status", e => e.textContent);
  ok(/Link copied|address bar/.test(copyMsg), "copy link gives feedback", copyMsg);
  await tap(p, "#edit-answers");
  await new Promise(r => setTimeout(r, 600));
  ok(await p.evaluate(() => document.activeElement && document.activeElement.name === "stay"), "change answers returns to question 1");
  await p.evaluate(() => document.querySelectorAll(".tool-row a").forEach(a => a.addEventListener("click", e => e.preventDefault())));
  const toolLinks = await p.$$(".tool-row a");
  for (const l of toolLinks) await l.click();
  const clicks = await p.evaluate(() => (window.dataLayer || []).filter(x => x[0] === "event" && x[1] === "outbound_click").length);
  ok(clicks === toolLinks.length, "every tool link records an outbound click", `${clicks} of ${toolLinks.length}`);
  const rows = await p.$$eval(".tool-row", lis => lis.map(li => {
    const a = li.querySelector("a");
    return { name: a.textContent.trim(), href: a.href, rel: a.rel, target: a.target,
             note: (li.querySelector(".tool-note") || {}).textContent || null, text: li.textContent };
  }));
  for (const r of rows) {
    const t = Object.values(C.TOOLS).find(x => x.name === r.name);
    ok(r.href === t.href, `${r.name}: links where the rules say`, r.href);
    ok(r.target === "_blank" && r.rel.split(" ").includes("noopener"), `${r.name}: opens safely in a new tab`, r.rel);
    ok(r.rel.split(" ").includes("sponsored") === t.affiliate, `${r.name}: rel sponsored only on an affiliate link`, r.rel);
    ok(!!r.note === t.affiliate, `${r.name}: commission note only on an affiliate link`, String(r.note));
    if (t.perk) ok(r.text.includes(t.perk) === t.affiliate, `${r.name}: the discount shows only through the affiliate link`, r.text);
  }
  ok(rows.some(r => r.name === "Hospitable"), "this scenario shows Hospitable, so the affiliate path is tested");
  await p.close();

  // ---- 6. phone width: nothing spills sideways, before or after results
  p = await page(browser, 375);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  ok((await shown(p)).overflow <= 0, "375px: form fits");
  await answer(p, SCEN[6]);
  await tap(p, 'button[type="submit"]');
  await new Promise(r => setTimeout(r, 150));
  ok((await shown(p)).overflow <= 0, "375px: checklist fits", String((await shown(p)).overflow));
  const phone = await shown(p);
  ok(!phone.chartShown && phone.listShown, "375px: the date list replaces the chart");
  compare(SCEN[6], phone, "375px");
  await p.screenshot({ path: process.env.SHOT || "/tmp/checker-375.png", fullPage: true });
  await p.close();

  // ---- 6b. the checker prompt at the top of /rates/, where search visitors land
  for (const w of [1100, 375]) {
    p = await page(browser, w);
    await p.goto(`${BASE}/rates/`, { waitUntil: "load" });
    const strip = await p.evaluate(() => {
      const a = document.querySelector(".cta-strip a.btn");
      const h2 = document.querySelector("main h2");
      return a && {
        href: a.getAttribute("href"), text: a.textContent.trim(),
        beforeFirstH2: !!(a.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING),
        top: a.getBoundingClientRect().top, vh: window.innerHeight,
        overflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    ok(!!strip && strip.href === "/#checker" && strip.text === "Find my 20ths", `${w}px: /rates/ has the checker prompt`, JSON.stringify(strip));
    if (strip) {
      ok(strip.beforeFirstH2, `${w}px: the prompt sits above the first rate table`);
      if (w === 1100) ok(strip.top < strip.vh, "1100px: the prompt shows without scrolling", `${strip.top} of ${strip.vh}`);
      ok(strip.overflow <= 0, `${w}px: /rates/ fits`, String(strip.overflow));
    }
    if (w === 1100) {
      await p.evaluate(() => document.querySelector(".cta-strip a.btn").addEventListener("click", e => e.preventDefault(), { once: true }));
      await tap(p, ".cta-strip a.btn");
      const ev = await p.evaluate(() => (window.dataLayer || []).filter(x => x[0] === "event" && x[1] === "click").map(x => x[2].label));
      ok(ev.includes("rates_top_cta"), "the prompt records its click", ev.join());
      await Promise.all([p.waitForNavigation({ waitUntil: "load" }), tap(p, ".cta-strip a.btn")]);
      await new Promise(r => setTimeout(r, 300));
      const land = await p.evaluate(() => ({ path: location.pathname, hash: location.hash,
        top: document.getElementById("checker").getBoundingClientRect().top, vh: window.innerHeight }));
      ok(land.path === "/" && land.hash === "#checker" && land.top < land.vh, "the prompt opens the checker", JSON.stringify(land));
    }
    ok(p.errors.length === 0, `${w}px: /rates/ has no console errors`, p.errors.join(" | "));
    await p.close();
  }

  // ---- 7. every other page loads clean
  for (const path of ["/rates/", "/learn/", "/learn/bill-47-catch-up-checklist/", "/learn/hawaii-tat-11-percent/",
                      "/learn/get-tax-long-term-rentals/", "/privacy/", "/terms/", "/404.html"]) {
    p = await page(browser);
    const res = await p.goto(BASE + path, { waitUntil: "load" });
    ok(res.status() === 200, `${path} loads`, String(res.status()));
    ok(p.errors.length === 0, `${path} has no console errors`, p.errors.join(" | "));
    const checkerLinks = await p.$$eval('a[href="/#checker"]', as => as.length);
    ok(checkerLinks >= 1, `${path} links to the checker`, String(checkerLinks));
    await p.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
