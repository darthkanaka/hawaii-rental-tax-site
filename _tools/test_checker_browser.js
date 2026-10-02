/* Browser test for the checker. Drives every control in a real Chrome,
   then checks every date, rate and line on screen against checker-logic.js.

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
  const L = C.checklist(a, T);
  return {
    rates: L.taxes.map(t => t.rate),
    register: L.register.map(r => r.title),
    files: L.file.map(f => ({ form: f.form, county: !!f.county,
      dates: (f.next || []).map(n => n.dueText).concat(f.county ? [f.annualNext.dueText] : []),
      freq: f.frequencyText || null })),
    also: L.also.map(x => x.text + (x.link ? " " + x.link.text : "")),
    tools: L.tools.map(t => t.name),
    first: L.first ? L.first.title : null
  };
}

async function shown(p) {
  return p.evaluate(() => {
    const R = document.getElementById("results");
    const q = (sel, root) => Array.from((root || R).querySelectorAll(sel));
    return {
      hidden: R.hidden,
      rates: q(".tax-rate").map(e => e.textContent.trim()),
      register: q(".step-title").map(e => e.textContent.trim()),
      files: q(".file-row").map(row => ({
        form: row.querySelector(".form-id").textContent.trim(),
        text: row.querySelector(".file-body").textContent.replace(/\s+/g, " ").trim()
      })),
      also: q(".also-list li").map(e => e.textContent.trim()),
      tools: q(".tool-name").map(e => e.textContent.trim()),
      first: (R.querySelector(".priority h3") || {}).textContent || null,
      focused: document.activeElement && document.activeElement.id,
      hash: location.hash,
      overflow: document.documentElement.scrollWidth - window.innerWidth
    };
  });
}

function compare(a, got, label) {
  const e = expected(a);
  ok(!got.hidden, `${label}: results visible`);
  ok(JSON.stringify(got.rates) === JSON.stringify(e.rates), `${label}: rates`, `${got.rates} vs ${e.rates}`);
  ok(JSON.stringify(got.register) === JSON.stringify(e.register), `${label}: registration steps`, `${got.register} vs ${e.register}`);
  ok(got.files.map(f => f.form).join() === e.files.map(f => f.form).join(), `${label}: returns listed`, `${got.files.map(f => f.form)} vs ${e.files.map(f => f.form)}`);
  e.files.forEach((ef, i) => {
    const gf = got.files[i] || { text: "" };
    for (const d of ef.dates) ok(gf.text.includes(d), `${label}: ${ef.form} shows ${d}`, gf.text);
    if (ef.freq) ok(gf.text.includes((ef.county ? "Paid " : "Filed ") + ef.freq), `${label}: ${ef.form} says how often`, gf.text);
    // and no date appears that the rules didn't produce
    const dates = gf.text.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}, \d{4}/g) || [];
    ok(dates.every(d => ef.dates.includes(d)), `${label}: ${ef.form} shows only rule dates`, dates.join(" | "));
  });
  ok(JSON.stringify(got.also) === JSON.stringify(e.also), `${label}: also required`, `${got.also.length} vs ${e.also.length}`);
  ok(JSON.stringify(got.tools) === JSON.stringify(e.tools), `${label}: tools`, `${got.tools} vs ${e.tools}`);
  ok((got.first || null) === e.first, `${label}: catch-up panel`, `${got.first} vs ${e.first}`);
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
    ok(JSON.stringify(again.files) === JSON.stringify(got.files), `${label}: link shows identical returns`);
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
  const rels = await p.$$eval(".tool-row a", as => as.map(a => a.rel + "|" + a.target));
  ok(rels.every(r => r.startsWith("noopener|_blank")), "tool links open safely in a new tab", rels.join());
  await p.close();

  // ---- 6. phone width: nothing spills sideways, before or after results
  p = await page(browser, 375);
  await p.goto(`${BASE}/?today=${TODAY}`, { waitUntil: "load" });
  ok((await shown(p)).overflow <= 0, "375px: form fits");
  await answer(p, SCEN[6]);
  await tap(p, 'button[type="submit"]');
  await new Promise(r => setTimeout(r, 150));
  ok((await shown(p)).overflow <= 0, "375px: checklist fits", String((await shown(p)).overflow));
  await p.screenshot({ path: process.env.SHOT || "/tmp/checker-375.png", fullPage: true });
  await p.close();

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
