/* Hawaii rental tax checker: the page.
   Reads the answers and fills in the tax statement as they come in. As soon
   as the stay, the island and the rent are known, the statement shows the
   due dates; once every question is answered, the full schedule and the
   written summary appear below. Nothing is sent anywhere: answers live in
   the form and in the URL hash so a statement can be bookmarked or shared.
   Analytics get only the choices (island, rental type, rent band), never
   anything typed. */

(function () {
  "use strict";
  var C = window.HRTChecker;
  var form = document.getElementById("checker-form");
  var out = document.getElementById("results");
  if (!C || !form || !out) { return; }

  var REQUIRED = ["stay", "county", "rent", "status", "home"];
  var SHOW_FIRST = 12;
  var started = false;
  var reported = false;

  function track(name, params) { if (window.hrtTrack) { window.hrtTrack(name, params || {}); } }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function val(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  function checked(id) { var el = document.getElementById(id); return !!(el && el.checked); }

  function answers() {
    return {
      stay: val("stay"), county: val("county"), rent: val("rent"), status: val("status"), home: val("home"),
      have: { get: checked("have-get"), tat: checked("have-tat") }
    };
  }
  function complete(a) { return REQUIRED.every(function (n) { return !!a[n]; }); }

  // The TAT registration box only makes sense for short-term rentals.
  function syncStay() {
    var stay = val("stay");
    var shortTerm = stay === "str" || stay === "both";
    var rows = form.querySelectorAll("[data-short-only]");
    for (var i = 0; i < rows.length; i++) {
      rows[i].hidden = !shortTerm;
      if (!shortTerm) { var box = rows[i].querySelector("input"); if (box) { box.checked = false; } }
    }
  }

  // ---------------------------------------------------------- URL hash
  var KEYS = { stay: "s", county: "c", rent: "r", status: "st", home: "o" };

  function toHash(a) {
    var parts = [];
    for (var k in KEYS) { if (a[k]) { parts.push(KEYS[k] + "=" + encodeURIComponent(a[k])); } }
    var h = [];
    if (a.have.get) { h.push("get"); }
    if (a.have.tat) { h.push("tat"); }
    if (h.length) { parts.push("h=" + h.join(",")); }
    return "#" + parts.join("&");
  }

  function fromHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    if (!raw || raw.indexOf("=") === -1) { return false; }
    var map = {};
    raw.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i > 0) { map[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); }
    });
    var any = false;
    for (var k in KEYS) {
      var v = map[KEYS[k]];
      var el = v && form.querySelector('input[name="' + k + '"][value="' + v.replace(/[^a-z0-9-]/gi, "") + '"]');
      if (el) { el.checked = true; any = true; }
    }
    var have = (map.h || "").split(",");
    ["get", "tat"].forEach(function (k) {
      var el = document.getElementById("have-" + k);
      if (el) { el.checked = have.indexOf(k) !== -1; }
    });
    return any;
  }

  // A test or a shared link can pin "today" with ?today=YYYY-MM-DD.
  function today() {
    var m = /[?&]today=(\d{4})-(\d{2})-(\d{2})/.exec(location.search);
    return m ? C.ymd(+m[1], +m[2], +m[3]) : C.hawaiiToday();
  }

  // ---------------------------------------------------------- validation
  function validate() {
    var firstBad = null;
    REQUIRED.forEach(function (name) {
      var fs = document.getElementById("q-" + name);
      var msg = fs && fs.querySelector(".field-error");
      var bad = !val(name);
      if (fs) { fs.classList.toggle("invalid", bad); }
      if (msg) { msg.hidden = !bad; }
      if (bad && !firstBad) { firstBad = fs; }
    });
    if (firstBad) {
      var input = firstBad.querySelector("input");
      if (input) { input.focus({ preventScroll: true }); }
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------- words
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var HOW = { monthly: "monthly", quarterly: "quarterly", semiannual: "twice a year" };
  var EVERY = { monthly: "every month", quarterly: "every quarter", semiannual: "twice a year" };
  var OWED = { monthly: "more than $4,000 a year", quarterly: "between $2,000 and $4,000 a year", semiannual: "$2,000 a year or less" };
  var STAY = { str: "Short-term", ltr: "Long-term", both: "Short and long stays" };
  var FREQ_RULE = {
    GET: "How often you file GET depends on the GET you owe in a year. Twice a year at $2,000 or less, quarterly at $4,000 or less, and monthly above that. In rent, that's about $44,000 and $89,000 a year.",
    TAT: "How often you file TAT depends on the TAT you owe in a year. Twice a year at $2,000 or less, quarterly at $4,000 or less, and monthly above that. In short-term rent, that's about $18,000 and $36,000 a year."
  };
  var BB1 = "You choose your schedule on the BB-1 when you register, and you can check it in Hawaii Tax Online.";
  var SOURCES = [
    "Hawaii Revised Statutes chapter 237 (general excise tax) and chapter 237D (transient accommodations tax). County rates come from each county's ordinance.",
    "A state TAT registration registers you with the county, and the state TA-1 and TA-2 count as filed with it.",
    "HRS §237-30 and §237D-6. Twice a year at $2,000 of tax or less, quarterly at $4,000 or less, monthly above that.",
    "HRS §237D-4. Fines run $500 to $5,000 a day, per unit.",
    "HRS §231-21 moves a state due date that falls on a weekend or a state holiday to the next business day."
  ];
  var KIND = {
    get: "GET return", tat: "State TAT return", county: "County TAT payment",
    "annual-get": "Annual GET return", "annual-tat": "Annual state TAT return",
    "county-annual": "County TAT top-up, if your TA-2 shows one"
  };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function joinList(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }
  function fn(n) { return "<sup class=\"fn\">" + n + "</sup>"; }
  function longDate(x) { return C.WEEKDAYS[C.weekday(x)] + ", " + C.MONTHS[x.m - 1] + " " + x.d + ", " + x.y; }
  function plainDate(x) { return C.MONTHS[x.m - 1] + " " + x.d + ", " + x.y; }
  function shortDate(x) { return MON[x.m - 1] + " " + x.d; }
  function place(county) { return county.county.replace(/^the /, ""); }
  function isCounty(e) { return e.kind === "county" || e.kind === "county-annual"; }
  function formLabel(e) { return isCounty(e) ? "County TAT" : e.form; }

  function freqs(a) {
    var known = a.rent && a.rent !== "unsure";
    return {
      get: known ? C.frequencyForBand(a.rent, C.RATES.get) : null,
      tat: known && a.stay === "str" ? C.frequencyForBand(a.rent, C.RATES.tat) : null
    };
  }

  // Due dates only depend on the stay, the island and the rent, so the
  // statement can show them before the last questions are answered.
  function previewPlan(a, t) {
    if (!a.stay || !a.county || !a.rent) { return null; }
    return C.yearPlan({ stay: a.stay, county: a.county, rent: a.rent, status: a.status || "current",
                        home: a.home || "island", have: a.have }, t);
  }

  function dueStatus(due, t) {
    var d = C.daysBetween(t, due);
    if (d === 0) { return { soon: true, text: "Due today", short: "Today" }; }
    if (d === 1) { return { soon: true, text: "Due tomorrow", short: "Tomorrow" }; }
    if (d <= 30) { return { soon: true, text: "Due in " + d + " days", short: "In " + d + " days" }; }
    return { soon: false, text: "Upcoming", short: "Upcoming" };
  }

  // A state date that isn't the 20th says why. The county's own dates only
  // move where the county says so.
  function movedNote(e, county) {
    if (isCounty(e) && !county.shifts) { return ""; }
    var sh = C.dueShift(e.due.y, e.due.m);
    return sh.moved && sh.due.d === e.due.d ? "Moved because " + sh.why : "";
  }

  function openForms(P, a) {
    if (!P.unknown.length) { return ""; }
    return "Plus your " + joinList(P.unknown) + (a.rent === "unsure"
      ? ", once you pick a rent range."
      : ", on the TAT schedule you picked when you registered.");
  }

  function scheduleSentence(a, f) {
    var shortTerm = a.stay !== "ltr";
    if (!f.get) { return "How often you file depends on your rent."; }
    if (!shortTerm) { return "GET is due " + EVERY[f.get] + "."; }
    if (!f.tat) { return "GET is due " + EVERY[f.get] + ". Your TAT schedule depends on how much of your rent is short-term."; }
    if (f.get === f.tat) { return "GET, TAT and the county's 3% are all due " + EVERY[f.get] + "."; }
    return "GET is due " + EVERY[f.get] + ". TAT and the county's 3% are due " + EVERY[f.tat] + ".";
  }

  // ---------------------------------------------------------- the statement
  function renderStatement(a, t, P) {
    var county = a.county ? C.COUNTIES[a.county] : null;
    var f = freqs(a);
    var band = C.BANDS.filter(function (b) { return b.id === a.rent; })[0];
    var rental = [a.stay ? STAY[a.stay] : null, county ? county.name : null].filter(Boolean).join(", ");
    var tat = !a.stay ? null : a.stay === "ltr" ? "Doesn't apply" : a.stay === "both" ? "11%, on short stays" : "11%" + (f.tat ? ", " + HOW[f.tat] : "");
    var ctat = !a.stay ? null : a.stay === "ltr" ? "Doesn't apply" : a.stay === "both" ? "3%, on short stays" : "3%" + (f.tat ? ", " + HOW[f.tat] : "");
    var facts = [
      ["Rental", rental || null, "Not answered yet"],
      ["Yearly rent", a.rent ? (band ? band.label : "Not sure yet") : null, "Not answered yet"],
      ["General excise tax", "4.5%" + (f.get ? ", " + HOW[f.get] : ""), ""],
      ["State TAT", tat, "Depends on question 1"],
      ["County TAT", ctat, "Depends on question 1"]
    ];
    document.getElementById("st-facts").innerHTML = facts.map(function (x) {
      return "<dt>" + esc(x[0]) + "</dt>" + (x[1] ? "<dd>" + esc(x[1]) + "</dd>" : "<dd class=\"pending\">" + esc(x[2]) + "</dd>");
    }).join("");

    var rows = document.getElementById("st-rows");
    var foot = document.getElementById("st-foot");
    var period = document.getElementById("st-period");
    if (!P) {
      period.textContent = "Fills in as you answer the questions below";
      rows.innerHTML = "<tr><td class=\"empty\" colspan=\"4\">Answer questions 1 to 3 and your due dates show up here.</td></tr>";
      foot.innerHTML = "<p><span class=\"label\">Next due</span> <b>shows after question 3</b></p>";
      return;
    }
    period.textContent = P.cols[0].month + " " + P.cols[0].y + " to " + P.cols[11].month + " " + P.cols[11].y;
    rows.innerHTML = P.events.slice(0, 5).map(function (e) {
      var s = dueStatus(e.due, t);
      return "<tr><td>" + esc(shortDate(e.due)) + "</td><td class=\"f\">" + esc(formLabel(e)) + "</td><td class=\"per\">" +
        esc(/^All of/.test(e.period) ? e.period : e.period.replace(/ \d{4}$/, "")) + "</td><td class=\"st\">" + (s.soon ? "<span class=\"pill\">" + esc(s.short) + "</span>" : esc(s.short)) + "</td></tr>";
    }).join("") + (P.unknown.length ? "<tr><td class=\"empty\" colspan=\"4\">" + esc(openForms(P, a)) + "</td></tr>" : "");
    foot.innerHTML = "<p><span class=\"label\">Next due</span> <b>" + esc(P.next.dueText) + "</b></p>" +
      (complete(a) ? "<a href=\"#results\" class=\"see-all\">See all " + P.events.length + " dates</a>" : "");
  }

  function renderStrip(a, t, P) {
    var el = document.getElementById("strip-text");
    if (!P) {
      el.innerHTML = "Answer the six questions and your statement fills in as you go.";
      return;
    }
    var n = P.next.items.length;
    el.innerHTML = esc(scheduleSentence(a, freqs(a))) + " Next due <b>" + esc(longDate(P.next.due)) + "</b>" +
      (n > 1 ? ", with " + n + " filings that day." : ".") +
      (complete(a) ? "" : " Answer the rest to see your full schedule.");
  }

  // ---------------------------------------------------------- the full schedule and summary
  function schedNotes(a, P, county) {
    var L = P.list, notes = [];
    var wk = P.moved.filter(function (c) { return c.weekend; });
    var hol = P.moved.filter(function (c) { return !c.weekend; });
    if (wk.length) {
      notes.push("In " + joinList(wk.map(function (c) { return c.month; })) + " the 20th lands on a weekend, so state returns are due the next business day." + fn(5));
    }
    hol.forEach(function (c) {
      notes.push("In " + c.month + " " + esc(c.why) + ", a state holiday, so that one's due " +
        C.WEEKDAYS[C.weekday(c.due)] + " the " + C.ordinal(c.due.d) + "." + fn(5));
    });
    var cf = L.file.filter(function (x) { return x.county; })[0];
    if (cf) {
      notes.push((cf.shifts
          ? cap(county.county) + " moves its payment dates off weekends and holidays the same way the state does."
          : cap(county.county) + " doesn't say its payment date moves, so its rows keep the plain 20th. Paying by then is always on time.") +
        " Once a year, by " + esc(cf.annualNext.dueText) + ", pay anything your TA-2 shows that wasn't on your TA-1s. " +
        "<a href=\"" + esc(cf.pay) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"county_pay_" + esc(a.county) + "\">" + esc(cf.payText) + "</a>." +
        (cf.payNote ? " " + esc(cf.payNote) : ""));
    }
    var f = freqs(a);
    if (f.get && f.tat && f.get !== f.tat) {
      notes.push("Why two schedules? GET and TAT are judged separately. Your TAT comes to " + OWED[f.tat] + ", so it's " + HOW[f.tat] +
        ". Your GET comes to " + OWED[f.get] + ", so it's " + HOW[f.get] + ".");
    }
    var openGet = P.unknown.indexOf("G-45") !== -1, openTat = P.unknown.indexOf("TA-1") !== -1;
    if (openGet) { notes.push(FREQ_RULE.GET + (openTat ? "" : " " + BB1)); }
    if (openTat) { notes.push((a.stay === "both" ? "Only your short-term rent counts for TAT. " : "") + FREQ_RULE.TAT + " " + BB1); }
    var g45 = L.file.filter(function (x) { return x.form === "G-45"; })[0];
    if (g45.note) { notes.push(esc(g45.note)); }
    return notes.length ? "<div class=\"sched-notes\">" + notes.map(function (x) { return "<p>" + x + "</p>"; }).join("") + "</div>" : "";
  }

  function renderResults(a, t, P) {
    var L = P.list;
    var county = C.COUNTIES[a.county];
    var shortTerm = a.stay !== "ltr";
    var f = freqs(a);
    var n = P.events.length;
    var open = openForms(P, a);

    // Part two: every date, as a table on wide screens and a list on phones
    var html = "<div class=\"wrap\"><section class=\"part-two\" aria-labelledby=\"results-title\">" +
      "<div class=\"part-head\"><div><p class=\"eyebrow\">Part two</p>" +
      "<h2 id=\"results-title\" tabindex=\"-1\">Your schedule, " + P.cols[0].month + " " + P.cols[0].y + " to " + P.cols[11].month + " " + P.cols[11].y + "</h2></div>" +
      "<p class=\"meta\">" + n + " dates. " + esc(scheduleSentence(a, f)) + "</p></div>";

    html += "<div class=\"sched-wrap\"><table class=\"sched\"><caption class=\"sr-only\">Every due date in order</caption><thead><tr>" +
      "<th scope=\"col\">Due date</th><th scope=\"col\">Form</th><th scope=\"col\">Return or payment</th><th scope=\"col\">Period</th><th scope=\"col\">Filed with</th><th scope=\"col\">Status</th>" +
      "</tr></thead><tbody>" + P.events.map(function (e, i) {
        var s = dueStatus(e.due, t), moved = movedNote(e, county);
        return "<tr" + (i >= SHOW_FIRST ? " class=\"extra\" hidden" : "") + "><td class=\"d\">" + esc(e.dueText) +
          (moved ? "<span class=\"moved\">" + esc(moved) + "</span>" : "") + "</td><td class=\"f\">" + esc(formLabel(e)) + "</td><td>" +
          esc(KIND[e.kind]) + "</td><td>" + esc(e.period) + "</td><td>" + esc(isCounty(e) ? place(county) : "State") + "</td><td class=\"st\">" +
          (s.soon ? "<span class=\"pill\">" + esc(s.text) + "</span>" : esc(s.text)) + "</td></tr>";
      }).join("") + "</tbody></table></div>";

    var seen = 0;
    html += "<ol class=\"date-list\" aria-label=\"Every due date in order\">" + P.groups.map(function (g) {
      var first = seen; seen += g.items.length;
      var s = dueStatus(g.due, t), moved = movedNote(g.items[0], county);
      return "<li" + (first >= SHOW_FIRST ? " class=\"extra\" hidden" : "") + "><p class=\"dl-head\"><span class=\"dl-date\">" + esc(g.dueText) + "</span>" +
        (s.soon ? "<span class=\"pill\">" + esc(s.text) + "</span>" : "") + "</p>" +
        (moved ? "<span class=\"moved\">" + esc(moved) + "</span>" : "") +
        "<ul class=\"dl-items\">" + g.items.map(function (e) {
          return "<li><b>" + esc(formLabel(e)) + "</b> " + esc(e.what) + "</li>";
        }).join("") + "</ul></li>";
    }).join("") + "</ol>";

    html += "<div class=\"sched-more\">" + (n > SHOW_FIRST
      ? "<button type=\"button\" class=\"btn ghost small\" id=\"show-all\" aria-expanded=\"false\">Show all " + n + " dates</button><p>Showing the next " + SHOW_FIRST + ".</p>"
      : "") + (open ? "<p>" + esc(open) + "</p>" : "") + "</div>";
    html += schedNotes(a, P, county) + "</section></div>";

    // Part three: what the law asks, in plain sentences
    html += "<section class=\"part-three\" aria-labelledby=\"p3-title\"><div class=\"wrap\"><div class=\"p3-head\">" +
      "<p class=\"eyebrow\">Part three</p><h2 id=\"p3-title\">What the law asks of you</h2><p class=\"prepared\">Prepared " + esc(plainDate(t)) + "</p></div><div class=\"p3-body\">";
    if (L.first) {
      html += "<div class=\"priority\"><h3>" + esc(L.first.title) + "</h3><ol>" +
        L.first.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ol></div>";
    }
    html += "<ol class=\"law\">";
    L.taxes.forEach(function (x, i) {
      html += "<li class=\"tax\"><b><span class=\"tax-name\">" + esc(x.name) + "</span>, <span class=\"tax-rate\">" + esc(x.rate) + "</span>.</b> " +
        esc(x.what) + " Paid to " + esc(x.who) + "." + (i === 0 ? fn(1) : "") + "</li>";
    });
    if (L.register.length) {
      L.register.forEach(function (r) {
        html += "<li class=\"register\"><b class=\"step-title\">" + esc(r.title) + ".</b><ol>" +
          r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
          (r.link ? "<a class=\"link\" href=\"" + esc(r.link.href) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"register_" + esc(r.id) + "\">" + esc(r.link.text) + "</a>" : "") + "</li>";
      });
    } else {
      html += "<li class=\"registered\"><b>You're registered for everything this rental needs.</b>" +
        (shortTerm ? " Your state TAT registration covers " + esc(county.county) + " too, so the county's 3% is the only thing you pay the county directly." + fn(2) : "") + "</li>";
    }
    html += "<li class=\"filing\"><b>How often you file.</b> " + (f.get
      ? "GET is filed " + HOW[f.get] + (shortTerm ? (f.tat ? " and TAT " + HOW[f.tat] : ", and TAT on the schedule your short-term rent sets") : "") + ", all through Hawaii Tax Online." + fn(3)
      : esc(FREQ_RULE.GET) + " " + esc(BB1) + fn(3)) + "</li>";
    L.also.forEach(function (x) {
      html += "<li class=\"also\">" + esc(x.text) + (x.link ? " <a href=\"" + esc(x.link.href) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"also_" + esc(x.id) + "\">" + esc(x.link.text) + "</a>" : "") +
        (x.id === "ads" ? fn(4) : "") + "</li>";
    });
    html += "</ol><div class=\"p3-actions\">" +
      "<button type=\"button\" class=\"text-btn\" id=\"edit-answers\">Change my answers</button>" +
      "<button type=\"button\" class=\"text-btn\" id=\"print-statement\">Print this statement</button>" +
      "<button type=\"button\" class=\"text-btn\" id=\"copy-link\">Copy a link to it</button></div>" +
      "<p class=\"copy-status\" role=\"status\" aria-live=\"polite\"></p></div></div></section>";

    // Sources and the services that can help
    html += "<div class=\"wrap\"><section class=\"notes-row\" aria-label=\"Notes, sources and services\"><div class=\"sources\"><h2>Notes and sources</h2><ol>" +
      SOURCES.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol><p class=\"checked\">" +
      L.notes.map(esc).join(" ") + " This is general information, not tax advice.</p></div>";
    if (L.tools.length) {
      html += "<div class=\"services\"><h2>Services some owners use</h2><ul class=\"tool-list\">" + L.tools.map(function (x) {
        var id = x.name.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
        return "<li class=\"tool-row\"><a class=\"tool-name\" href=\"" + esc(x.href) + "\" rel=\"" + (x.affiliate ? "sponsored noopener" : "noopener") +
          "\" target=\"_blank\" data-track=\"tool_" + id + "\">" + esc(x.name) + "</a><span>" + esc(x.why) +
          (x.affiliate && x.perk ? " " + esc(x.perk) : "") + "</span>" +
          (x.affiliate ? "<span class=\"tool-note\">We earn a commission if you sign up through this link. It doesn't change what we recommend.</span>" : "") +
          "</li>";
      }).join("") + "</ul></div>";
    }
    html += "</section></div>";

    out.innerHTML = html;
    out.hidden = false;
    wireResults();
  }

  function wireResults() {
    var more = document.getElementById("show-all");
    if (more) {
      more.addEventListener("click", function () {
        var open = more.getAttribute("aria-expanded") !== "true";
        out.querySelectorAll(".extra").forEach(function (el) { el.hidden = !open; });
        more.setAttribute("aria-expanded", open ? "true" : "false");
        more.textContent = open ? "Show fewer dates" : "Show all " + out.querySelectorAll(".sched tbody tr").length + " dates";
      });
    }
    document.getElementById("edit-answers").addEventListener("click", function () {
      var first = document.getElementById("checker");
      first.scrollIntoView({ behavior: "smooth", block: "start" });
      var q = document.getElementById("q-stay");
      var input = q.querySelector("input:checked") || q.querySelector("input");
      if (input) { input.focus({ preventScroll: true }); }
    });
    document.getElementById("print-statement").addEventListener("click", function () {
      track("checker_print", {});
      window.print();
    });
    document.getElementById("copy-link").addEventListener("click", function () {
      var status = out.querySelector(".copy-status");
      function done(ok) { status.textContent = ok ? "Link copied." : "Copy the address from your browser's address bar."; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(function () { done(true); }, function () { done(false); });
      } else { done(false); }
      track("checker_copy_link", {});
    });
  }

  // ---------------------------------------------------------- one pass, on every answer
  function update(source) {
    var a = answers();
    var t = today();
    var P = previewPlan(a, t);
    renderStatement(a, t, P);
    renderStrip(a, t, P);
    if (complete(a)) {
      renderResults(a, t, P);
      var h = toHash(a);
      if (location.hash !== h) { history.replaceState(null, "", location.pathname + location.search + h); }
      if (!reported) {
        reported = true;
        track("checker_complete", { stay: a.stay, county: a.county, rent: a.rent, status: a.status, home: a.home, source: source });
      }
    } else {
      out.hidden = true;
    }
  }

  form.addEventListener("change", function (ev) {
    if (!started) { started = true; track("checker_start", {}); }
    if (ev.target.name === "stay") { syncStay(); }
    var fs = ev.target.closest("fieldset");
    if (fs && fs.classList.contains("invalid") && val(ev.target.name)) {
      fs.classList.remove("invalid");
      var msg = fs.querySelector(".field-error");
      if (msg) { msg.hidden = true; }
    }
    update("live");
  });

  function goToSchedule(ev) {
    ev.preventDefault();
    if (!complete(answers())) {
      validate();
      track("checker_incomplete", {});
      return;
    }
    var title = document.getElementById("results-title");
    title.scrollIntoView({ behavior: "smooth", block: "start" });
    title.focus({ preventScroll: true });
  }
  document.getElementById("see-schedule").addEventListener("click", goToSchedule);
  document.getElementById("st-foot").addEventListener("click", function (ev) {
    if (ev.target.closest(".see-all")) { goToSchedule(ev); }
  });

  // Arriving on a shared or bookmarked link fills the form and the statement.
  var linked = fromHash();
  syncStay();
  update(linked ? "link" : "live");
})();
