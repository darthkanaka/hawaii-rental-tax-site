/* Hawaii rental tax checker: the rules.
   Pure functions only, no DOM, so the same file runs in the browser and
   under node for the unit tests in _tools/test_checker.js.

   Every figure here was checked against the Department of Taxation and
   the four counties on the date in RULES_CHECKED. Change a rule and the
   date together, and rerun the tests. */

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.HRTChecker = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RULES_CHECKED = "2026-10-01";

  var RATES = {
    get: 0.045,        // combined GET, all four counties since Maui's surcharge on 2024-01-01
    getPassOn: 0.04712,
    tat: 0.11,         // state TAT from 2026-01-01
    countyTat: 0.03    // every county
  };

  // Periodic filing frequency is set by estimated ANNUAL TAX LIABILITY:
  // semiannual at $2,000 or less, quarterly at $4,000 or less, otherwise monthly.
  var LIABILITY = { semiannual: 2000, quarterly: 4000 };

  function frequencyForLiability(annualTax) {
    if (annualTax <= LIABILITY.semiannual) { return "semiannual"; }
    if (annualTax <= LIABILITY.quarterly) { return "quarterly"; }
    return "monthly";
  }

  // Rent bands. Edges sit on the exact gross rent where a threshold flips:
  //   TAT  2000/0.11  = 18,182    4000/0.11  = 36,364
  //   GET  2000/0.045 = 44,445    4000/0.045 = 88,889
  var BANDS = [
    { id: "b1", label: "Under $18,000",       min: 0,     max: 18181 },
    { id: "b2", label: "$18,000 to $36,000",  min: 18182, max: 36363 },
    { id: "b3", label: "$36,000 to $44,000",  min: 36364, max: 44444 },
    { id: "b4", label: "$44,000 to $89,000",  min: 44445, max: 88888 },
    { id: "b5", label: "Over $89,000",        min: 88889, max: Infinity }
  ];

  function band(id) {
    for (var i = 0; i < BANDS.length; i++) { if (BANDS[i].id === id) { return BANDS[i]; } }
    return null;
  }

  // Frequency for a band and a tax rate. Because the edges sit on the
  // thresholds, the whole band lands on one answer; checked by the tests.
  function frequencyForBand(bandId, rate) {
    var b = band(bandId);
    if (!b) { return null; }
    return frequencyForLiability(b.min * rate);
  }

  // ----------------------------------------------------------------- dates
  // Dates are plain {y, m, d} with m 1 to 12, handled in UTC so no time zone
  // or daylight saving can move a day.

  function ymd(y, m, d) { return { y: y, m: m, d: d }; }
  function toUTC(x) { return Date.UTC(x.y, x.m - 1, x.d); }
  function fromUTC(t) { var dt = new Date(t); return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
  function addDays(x, n) { return fromUTC(toUTC(x) + n * 86400000); }
  function weekday(x) { return new Date(toUTC(x)).getUTCDay(); } // 0 Sun .. 6 Sat
  function same(a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; }
  function before(a, b) { return toUTC(a) < toUTC(b); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  // nth weekday of a month: wd 0 Sun .. 6 Sat, n 1-based
  function nthWeekday(y, m, wd, n) {
    var first = weekday(ymd(y, m, 1));
    return ymd(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
  }
  function lastWeekday(y, m, wd) {
    var last = ymd(y, m, daysInMonth(y, m));
    return addDays(last, -((weekday(last) - wd + 7) % 7));
  }

  // Easter Sunday, anonymous Gregorian algorithm.
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }

  // Hawaii state holidays, HRS 8-1. A fixed-date holiday that falls on a
  // Saturday is observed the Friday before, on a Sunday the Monday after.
  function observed(x) {
    var w = weekday(x);
    if (w === 6) { return addDays(x, -1); }
    if (w === 0) { return addDays(x, 1); }
    return x;
  }

  function holidays(y) {
    var list = [
      observed(ymd(y, 1, 1)),        // New Year's Day
      nthWeekday(y, 1, 1, 3),        // Dr. Martin Luther King, Jr. Day
      nthWeekday(y, 2, 1, 3),        // Presidents' Day
      observed(ymd(y, 3, 26)),       // Prince Jonah Kuhio Kalanianaole Day
      addDays(easter(y), -2),        // Good Friday
      lastWeekday(y, 5, 1),          // Memorial Day
      observed(ymd(y, 6, 11)),       // King Kamehameha I Day
      observed(ymd(y, 7, 4)),        // Independence Day
      nthWeekday(y, 8, 5, 3),        // Statehood Day
      nthWeekday(y, 9, 1, 1),        // Labor Day
      observed(ymd(y, 11, 11)),      // Veterans' Day
      nthWeekday(y, 11, 4, 4),       // Thanksgiving
      observed(ymd(y, 12, 25))       // Christmas
    ];
    if (y % 2 === 0) {               // general election day, even years:
      list.push(addDays(nthWeekday(y, 11, 1, 1), 1)); // Tuesday after the first Monday in November
    }
    // New Year's Day of the following year can be observed on Dec 31.
    var nextNY = observed(ymd(y + 1, 1, 1));
    if (nextNY.y === y) { list.push(nextNY); }
    return list;
  }

  function isHoliday(x) {
    var list = holidays(x.y);
    for (var i = 0; i < list.length; i++) { if (same(list[i], x)) { return true; } }
    return false;
  }

  // A due date on a weekend or state holiday moves to the next business day.
  function businessDay(x) {
    var cur = x;
    while (weekday(cur) === 0 || weekday(cur) === 6 || isHoliday(cur)) { cur = addDays(cur, 1); }
    return cur;
  }

  // Periodic returns are due the 20th of the month after the period ends.
  function periodicDue(periodEndY, periodEndM, noShift) {
    var y = periodEndY, m = periodEndM + 1;
    if (m === 13) { m = 1; y += 1; }
    return noShift ? ymd(y, m, 20) : businessDay(ymd(y, m, 20));
  }

  // Annual returns are due the 20th day of the 4th month after the year ends.
  function annualDue(taxYear, noShift) { return noShift ? ymd(taxYear + 1, 4, 20) : businessDay(ymd(taxYear + 1, 4, 20)); }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function fmt(x) { return DAYS[weekday(x)] + ", " + MON[x.m - 1] + " " + x.d + ", " + x.y; }

  // Periods for a frequency, as [startMonth, endMonth] pairs within a year.
  var PERIODS = {
    monthly: [[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9],[10,10],[11,11],[12,12]],
    quarterly: [[1,3],[4,6],[7,9],[10,12]],
    semiannual: [[1,6],[7,12]]
  };

  function periodLabel(y, s, e) {
    if (s === e) { return MONTHS[s - 1] + " " + y; }
    return MONTHS[s - 1] + " to " + MONTHS[e - 1] + " " + y;
  }

  // The next `count` periodic due dates on or after `today`.
  function upcoming(frequency, today, count, noShift) {
    var out = [];
    for (var y = today.y - 1; out.length < count && y <= today.y + 2; y++) {
      var ps = PERIODS[frequency];
      for (var i = 0; i < ps.length && out.length < count; i++) {
        var due = periodicDue(y, ps[i][1], noShift);
        if (!before(due, today)) {
          out.push({ due: due, dueText: fmt(due), period: periodLabel(y, ps[i][0], ps[i][1]) });
        }
      }
    }
    return out;
  }

  // The next annual return due on or after `today`, and the year it covers.
  function nextAnnual(today, noShift) {
    var due = annualDue(today.y - 1, noShift);
    if (!before(due, today)) { return { due: due, dueText: fmt(due), year: today.y - 1 }; }
    due = annualDue(today.y, noShift);
    return { due: due, dueText: fmt(due), year: today.y };
  }

  function hawaiiToday(now) {
    var d = now || new Date();
    // en-CA formats as YYYY-MM-DD
    var s = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    var p = s.split("-");
    return ymd(+p[0], +p[1], +p[2]);
  }

  // --------------------------------------------------------------- content

  var DOTAX = {
    hto: "https://hitax.hawaii.gov/",
    rental: "https://tax.hawaii.gov/rental/",
    forms: "https://tax.hawaii.gov/forms/",
    phoneOahu: "(808) 587-4242",
    phoneTollFree: "1-800-222-3229",
    hours: "Monday through Friday, 8 to 4"
  };

  // From the four county finance departments. In every county a state TAT
  // number counts as county registration, and the state TA-1 and TA-2 count as
  // filed with the county, so there is no county return. Only the 3% payment
  // goes to the county, on the TA-1's schedule. Only Hawaii County says its
  // payment due dates move off weekends and holidays (`shifts`); for the
  // others the checker shows the plain 20th, the safe date.
  var COUNTIES = {
    honolulu: { name: "O\u02bbahu", county: "the City and County of Honolulu",
                tax: "Oahu Transient Accommodations Tax (OTAT)", short: "OTAT", shifts: false,
                pay: "https://otatpay.honolulu.gov/", payText: "Pay OTAT online",
                payNote: "Paying from a bank account is free. Cards cost 3%." },
    maui:     { name: "Maui County", county: "Maui County",
                tax: "Maui County Transient Accommodations Tax (MCTAT)", short: "MCTAT", shifts: false,
                pay: "https://www.mauicounty.gov/tat", payText: "Pay MCTAT online",
                payNote: "Paying by eCheck is free." },
    hawaii:   { name: "Hawai\u02bbi Island", county: "the County of Hawai\u02bbi",
                tax: "Hawai\u02bbi County Transient Accommodations Tax (HCTAT)", short: "HCTAT", shifts: true,
                pay: "https://tat.ehawaii.gov/tat/hawaii/", payText: "Pay HCTAT online",
                payNote: "The county's payment site charges $2.50 per payment, plus $1 by eCheck or 2.5% by card." },
    kauai:    { name: "Kaua\u02bbi", county: "the County of Kaua\u02bbi",
                tax: "Kaua\u02bbi County Transient Accommodations Tax (KTAT)", short: "KTAT", shifts: false,
                pay: "https://tat.ehawaii.gov/tat/kauai/", payText: "Pay KTAT online",
                payNote: null }
  };

  var BILL47 = "https://portal.deckard.com/hi-hawaii-str-portal";
  var VDP = { email: "Tax.Voluntary.Disclosure@hawaii.gov", phone: "(808) 587-1611" };

  var FREQ_TEXT = { monthly: "monthly", quarterly: "quarterly", semiannual: "twice a year" };

  // Build the checklist for a set of answers. Pure: same answers and same
  // `today` always give the same result, which is what the tests rely on.
  function checklist(a, today) {
    var short = a.stay === "str" || a.stay === "both";
    var county = COUNTIES[a.county];
    var out = { taxes: [], first: null, register: [], file: [], also: [], tools: [], notes: [] };

    // ---- what you owe
    out.taxes.push({ id: "get", name: "General excise tax (GET)", rate: "4.5%", who: "the Hawaii Department of Taxation",
      what: "On every dollar of rent, including cleaning and other fees guests pay. It's a tax on gross rent, not profit." });
    if (short) {
      out.taxes.push({ id: "tat", name: "Transient accommodations tax (TAT)", rate: "11%", who: "the Hawaii Department of Taxation",
        what: (a.stay === "both" ? "On stays shorter than 180 days only. Your long-term rent is exempt." : "On stays shorter than 180 days.") +
              " Cleaning fees guests have to pay count too." });
      out.taxes.push({ id: "ctat", name: county.tax, rate: "3%", who: county.county,
        what: "The same stays as state TAT. Your state TAT number registers you with the county, and your state TAT returns count as filed with it. You just pay the county separately." });
    }

    // ---- get current first
    if (a.status === "behind" || a.status === "letter") {
      var letter = a.status === "letter";
      out.first = {
        title: letter ? "Deal with the letter first" : "Get current first",
        items: (letter ? [
          "Read the whole letter and note its deadline. Don't ignore it.",
          "Call the number on the letter, or Taxpayer Services at " + DOTAX.phoneOahu + " (toll-free " + DOTAX.phoneTollFree + ", " + DOTAX.hours + "), and ask exactly which periods and returns they want."
        ] : [
          "If the Department hasn't contacted you yet, ask about its voluntary disclosure program before you file. It can waive penalties and some interest, case by case, with no guarantee. Email " + VDP.email + " or call " + VDP.phone + ". It covers state taxes, not county TAT."
        ]).concat([
          "File every missing period, oldest first, on the return for that period and at the rates that applied then.",
          "Late returns cost 5% of the tax due per month, up to 25%, plus interest of two-thirds of 1% a month.",
          "If a year's annual return was never filed, that year's tax can be assessed at any time. The Department recommends non-filers go back at least 10 years.",
          "If it's more than a couple of periods, a Hawaii CPA or enrolled agent can file them for you. Ask for a flat quote."
        ])
      };
    }

    // ---- register
    var needGet = !(a.have && a.have.get);
    var needTat = short && !(a.have && a.have.tat);
    if (needGet || needTat) {
      var what = needGet && needTat ? "a GET license and a TAT registration" : (needGet ? "a GET license" : "a TAT registration");
      out.register.push({ id: "state", title: "Register with the state for " + what,
        steps: [
          needGet ? "Go to Hawaii Tax Online and choose Register New Business. That's Form BB-1 online. You can also mail in a paper BB-1."
                  : "Add TAT to your existing state tax account with Form BB-1, online through Hawaii Tax Online or on paper.",
          needGet ? "The GET license is a one-time $20." : null,
          needTat ? "TAT registration is a one-time $5 for 1 to 5 rental units, or $15 for 6 or more. List each unit." : null,
          "On the form you choose how often you'll file, based on the tax you expect to owe in a year. You can pick more often than your amount needs, but not less.",
          needTat ? "Your state TAT number registers you with " + county.county + " too. There's no separate county registration for the tax." : null
        ].filter(Boolean),
        link: { text: "Hawaii Tax Online", href: DOTAX.hto } });
    }

    // ---- file
    var freqKnown = a.rent && a.rent !== "unsure";
    var getFreq = freqKnown ? frequencyForBand(a.rent, RATES.get) : null;
    var tatFreq = freqKnown && a.stay === "str" ? frequencyForBand(a.rent, RATES.tat) : null;

    var g45 = fileRow("G-45", "GET", getFreq, today, null);
    if (a.rent === "b1") { g45.note = "If your GET for the whole year is $100 or less, you can skip the G-45s and file only the G-49."; }
    if (getFreq === "monthly") { g45.note = "At this amount the state requires you to file online, or it adds a 2% penalty."; }
    out.file.push(g45);
    out.file.push(annualRow("G-49", "GET", today));
    if (short) {
      out.file.push(fileRow("TA-1", "State TAT", tatFreq, today, a.stay === "both" ? "both" : null));
      out.file.push(annualRow("TA-2", "State TAT", today));
      var payFreq = tatFreq;
      out.file.push({ form: county.short, tax: county.short, county: true, frequency: payFreq,
        frequencyText: payFreq ? FREQ_TEXT[payFreq] : null,
        next: payFreq ? upcoming(payFreq, today, 2, !county.shifts) : null,
        annualNext: nextAnnual(today, !county.shifts),
        shifts: county.shifts,
        pay: county.pay, payText: county.payText, payNote: county.payNote,
        text: "No county return. Your state TA-1 counts as filed with " + county.county + ". You pay the 3% to the county separately, on the same schedule." });
    }

    // ---- also required
    if (short) {
      out.also.push({ id: "ads", text: "Every listing and ad has to show your TAT registration number, or a link to it, and your local contact's name, phone number and email. Fines run $500 to $5,000 a day, per unit." });
      out.also.push({ id: "local", text: a.home === "island"
        ? "Your local contact has to live on the same island as the rental. Since you do, that can be you."
        : "Your local contact has to live on the same island as the rental. Since you don't, you'll need someone who does, or a company with someone there." });
      if (a.county === "hawaii") {
        out.also.push({ id: "bill47", text: "Hawai\u02bbi County has required short-term rentals to register with the county since September 1, 2026. It's $250 for a hosted rental or $500 unhosted, then $100 or $250 a year. You'll need copies of your GET license and TAT registration, and proof you don't owe the county property tax or county TAT.", link: { text: "County rental registration", href: BILL47 } });
      }
      out.also.push({ id: "permits", text: "Your county may also require a rental permit. That's separate from taxes." });
    }
    if (a.home === "abroad") {
      out.also.push({ id: "abroad", text: "Registering takes a US tax ID, online or on paper, such as a Social Security number, an ITIN, or a business EIN. If you don't have one, get one from the IRS first." });
    }

    // ---- tools
    out.tools = toolsFor(a, short);

    out.notes.push("Rules checked against the Department of Taxation and " + county.county + " on " + fmtLong(RULES_CHECKED) + ".");
    return out;
  }

  function fileRow(form, tax, frequency, today, mode) {
    return {
      form: form, tax: tax, frequency: frequency, mode: mode,
      frequencyText: frequency ? FREQ_TEXT[frequency] : null,
      next: frequency ? upcoming(frequency, today, 2) : null
    };
  }

  function annualRow(form, tax, today) {
    var n = nextAnnual(today);
    return { form: form, tax: tax, annual: true, next: [{ due: n.due, dueText: n.dueText, period: "all of " + n.year }] };
  }

  function fmtLong(iso) {
    var p = iso.split("-");
    return MONTHS[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
  }

  // Recommendations. `affiliate: true` turns on the disclosure line; flip a
  // link to its affiliate URL only once that program has approved the site.
  var TOOLS = {
    baselane:   { name: "Baselane", href: "https://www.baselane.com/", affiliate: false,
                  why: "Free banking and bookkeeping built for landlords. Keeps every rent payment in one place, which is the number your returns start from." },
    hospitable: { name: "Hospitable", href: "https://hospitable.com/", affiliate: false,
                  why: "Pulls your Airbnb, VRBO and direct bookings into one place, so the month's rent is one report instead of three." },
    mylodgetax: { name: "Avalara MyLodgeTax", href: "https://www.avalara.com/mylodgetax/en/", affiliate: false,
                  why: "Files lodging taxes for you for a monthly fee. It covers TAT, not GET, so you'd still file GET yourself." },
    tati:       { name: "TATi Maui", href: "https://tatimaui.com/", affiliate: false,
                  why: "Tracks Maui GET, TAT and MCTAT and shows what you owe each period." }
  };

  function toolsFor(a, short) {
    var list = [TOOLS.baselane];
    if (short) {
      list.push(TOOLS.hospitable);
      if (a.county === "maui") { list.push(TOOLS.tati); }
      list.push(TOOLS.mylodgetax);
    }
    return list;
  }

  return {
    RULES_CHECKED: RULES_CHECKED, BILL47: BILL47, VDP: VDP, RATES: RATES, LIABILITY: LIABILITY, BANDS: BANDS, COUNTIES: COUNTIES, DOTAX: DOTAX, TOOLS: TOOLS,
    frequencyForLiability: frequencyForLiability, frequencyForBand: frequencyForBand,
    ymd: ymd, addDays: addDays, weekday: weekday, easter: easter, holidays: holidays, isHoliday: isHoliday,
    businessDay: businessDay, periodicDue: periodicDue, annualDue: annualDue, upcoming: upcoming, nextAnnual: nextAnnual,
    hawaiiToday: hawaiiToday, fmt: fmt, checklist: checklist
  };
});
