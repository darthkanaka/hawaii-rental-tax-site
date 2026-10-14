/* Builds the calendar files people add from the checker, one per set of
   answers that changes the dates: how long guests stay, the island and the
   rent range. Every file covers the month in RULES_CHECKED through the end of
   the next year, so refresh the rules, rerun this, and every calendar that
   added a file picks up the new dates on its own.

   Run:   node _tools/build_calendars.js           writes calendar/*.ics
          node _tools/build_calendars.js --check   fails if a file is stale */
"use strict";
const fs = require("fs");
const path = require("path");
const C = require("../assets/js/checker-logic.js");

const SITE = "https://hawaiirentaltax.com";
const DIR = path.join(__dirname, "..", "calendar");
const STAYS = ["str", "ltr", "both"];
const RENTS = C.BANDS.map(b => b.id);
const HTO = "https://hitax.hawaii.gov/";

function combos() {
  const out = [];
  for (const stay of STAYS) for (const county of Object.keys(C.COUNTIES)) for (const rent of RENTS) out.push({ stay, county, rent });
  return out;
}
function fileName(a) { return `${a.stay}-${a.county}-${a.rent}.ics`; }

const pad = n => String(n).padStart(2, "0");
const day = x => `${x.y}${pad(x.m)}${pad(x.d)}`;
const year = e => e.period.replace(/\D/g, "");

// RFC 5545 text: escape backslash, semicolon, comma and newlines.
const text = s => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// Lines longer than 75 octets fold onto continuation lines that start with a
// space, never splitting a character.
function fold(line) {
  const out = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

function isCounty(e) { return e.kind === "county" || e.kind === "county-annual"; }

function summary(e, county) {
  switch (e.kind) {
    case "get": return `GET return due for ${e.period} (G-45)`;
    case "tat": return `State TAT return due for ${e.period} (TA-1)`;
    case "county": return `County TAT payment due for ${e.period} (${county.short})`;
    case "annual-get": return `Annual GET return due for ${year(e)} (G-49)`;
    case "annual-tat": return `Annual state TAT return due for ${year(e)} (TA-2)`;
    case "county-annual": return `County TAT top-up due for ${year(e)}, if your TA-2 shows one`;
  }
  throw new Error("unknown kind " + e.kind);
}

function description(e, county) {
  const lines = [];
  switch (e.kind) {
    case "get": lines.push(`File Form G-45 and pay the GET for ${e.period} on Hawaii Tax Online.`, HTO); break;
    case "tat": lines.push(`File Form TA-1 and pay the state TAT for ${e.period} on Hawaii Tax Online. It counts as filed with ${county.county} too.`, HTO); break;
    case "county": lines.push(`Pay ${county.county} its 3% TAT for ${e.period}. There's no county return, just the payment.`, county.pay); break;
    case "annual-get": lines.push(`File Form G-49, the annual GET return for ${year(e)}, on Hawaii Tax Online.`, HTO); break;
    case "annual-tat": lines.push(`File Form TA-2, the annual state TAT return for ${year(e)}, on Hawaii Tax Online.`, HTO); break;
    case "county-annual": lines.push(`If your TA-2 for ${year(e)} shows county TAT that your ${county.short} payments missed, pay the rest to ${county.county}.`, county.pay); break;
  }
  if (e.kind === "county" && county.payNote) lines.push(county.payNote);
  // a state date that isn't the 20th says why; the county's own dates move
  // only where the county says so (the same rule the page uses)
  if (!isCounty(e) || county.shifts) {
    const sh = C.dueShift(e.due.y, e.due.m);
    if (sh.moved && sh.due.d === e.due.d) lines.push(`It's due ${C.WEEKDAYS[C.weekday(e.due)]} because ${sh.why}.`);
  }
  lines.push("", `From hawaiirentaltax.com. Rules checked ${C.fmtLong(C.RULES_CHECKED)}. This is general information, not tax advice.`);
  return lines.join("\n");
}

function ics(a) {
  const W = C.calendarWindow();
  const P = C.calendarPlan(a, W.from, W.to);
  const county = P.county;
  const stamp = C.RULES_CHECKED.replace(/-/g, "") + "T000000Z";
  const name = `Rental tax dates, ${county.name}`;
  const desc = `Your Hawaii rental tax due dates from hawaiirentaltax.com, ${C.MONTHS[W.from.m - 1]} ${W.from.y} to December ${W.to.y}.` +
    (P.unknown.length ? ` Your ${P.unknown.join(" and ")} dates aren't here because they follow the TAT schedule you picked when you registered.` : "");
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//hawaiirentaltax.com//Due dates//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "NAME:" + text(name),
    "X-WR-CALNAME:" + text(name),
    "DESCRIPTION:" + text(desc),
    "X-WR-CALDESC:" + text(desc),
    "X-WR-TIMEZONE:Pacific/Honolulu",
    "SOURCE;VALUE=URI:" + SITE + "/calendar/" + fileName(a),
    "REFRESH-INTERVAL;VALUE=DURATION:P1D",
    "X-PUBLISHED-TTL:P1D"
  ];
  for (const e of P.events) {
    const sum = summary(e, county);
    L.push(
      "BEGIN:VEVENT",
      `UID:${e.kind}-${e.due.y}${pad(e.due.m)}-${a.stay}-${a.county}-${a.rent}@hawaiirentaltax.com`,
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + day(e.due),
      "DTEND;VALUE=DATE:" + day(C.addDays(e.due, 1)),
      "SUMMARY:" + text(sum),
      "DESCRIPTION:" + text(description(e, county)),
      "URL:" + SITE + "/",
      "TRANSP:TRANSPARENT",
      // 9 in the morning, three days before
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + text(sum),
      "TRIGGER:-P2DT15H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

module.exports = { combos, fileName, ics, summary, description, DIR };

if (require.main === module) {
  const check = process.argv.includes("--check");
  const want = new Map(combos().map(a => [fileName(a), ics(a)]));
  if (check) {
    const stale = [];
    for (const [f, body] of want) {
      const p = path.join(DIR, f);
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== body) stale.push(f);
    }
    const extra = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => !want.has(f)) : [];
    if (stale.length || extra.length) {
      console.log(`Calendars out of date. Run node _tools/build_calendars.js\n  stale: ${stale.join(", ") || "none"}\n  extra: ${extra.join(", ") || "none"}`);
      process.exit(1);
    }
    console.log(`OK: ${want.size} calendar files current`);
  } else {
    fs.mkdirSync(DIR, { recursive: true });
    for (const f of fs.readdirSync(DIR)) if (!want.has(f)) fs.unlinkSync(path.join(DIR, f));
    for (const [f, body] of want) fs.writeFileSync(path.join(DIR, f), body);
    console.log(`Wrote ${want.size} calendar files to calendar/`);
  }
}
