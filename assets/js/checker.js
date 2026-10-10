/* Hawaii rental tax checker: the page.
   Reads the answers, asks checker-logic.js for the checklist, renders it.
   Nothing is sent anywhere: answers live in the form and in the URL hash
   so a checklist can be bookmarked or shared. Analytics get only the
   choices (island, rental type, rent band), never anything typed. */

(function () {
  "use strict";
  var C = window.HRTChecker;
  var form = document.getElementById("checker-form");
  var out = document.getElementById("results");
  if (!C || !form || !out) { return; }

  var REQUIRED = ["stay", "county", "rent", "status", "home"];
  var started = false;

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

  // Short-term questions only make sense for short-term rentals.
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
    if (!raw || raw.indexOf("=") === -1) { return null; }
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
      if (input) { input.focus(); }
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------- rendering
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NUM = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
  var EVERY = { monthly: "every month", quarterly: "every quarter", semiannual: "twice a year" };
  var HOW = { monthly: "monthly", quarterly: "quarterly", semiannual: "twice a year" };
  var OWED = { monthly: "more than $4,000 a year", quarterly: "between $2,000 and $4,000 a year", semiannual: "$2,000 a year or less" };
  var PLACE = { honolulu: "on Oʻahu", maui: "in Maui County", hawaii: "on Hawaiʻi Island", kauai: "on Kauaʻi" };
  var STATUS = { current: "every return is filed", behind: "you're behind on filing", letter: "you got a letter from the state or county", "new": "you're just starting out" };
  var HOME = { island: "you live on the same island", state: "you live elsewhere in Hawaii", mainland: "you live on the mainland", abroad: "you live outside the US" };
  var FREQ_RULE = {
    GET: "How often you file GET depends on the GET you owe in a year. Twice a year at $2,000 or less, quarterly at $4,000 or less, and monthly above that. In rent, that's about $44,000 and $89,000 a year.",
    TAT: "How often you file TAT depends on the TAT you owe in a year. Twice a year at $2,000 or less, quarterly at $4,000 or less, and monthly above that. In short-term rent, that's about $18,000 and $36,000 a year."
  };
  var ARROW = "<svg aria-hidden=\"true\" viewBox=\"0 0 16 16\"><path d=\"M8 2v11M3 8.5 8 13.5 13 8.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>";

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function joinList(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }
  function rowFreq(P, form) { var r = P.rows.filter(function (x) { return x.form === form; })[0]; return r ? r.frequency : null; }

  // The front page strip: one calendar year of monthly due dates.
  function renderStrip() {
    var list = document.getElementById("strip-list");
    if (!list) { return; }
    var y = C.stripYear(today());
    var st = C.yearStrip(y);
    var moved = st.filter(function (x) { return x.moved; }).length;
    document.getElementById("strip-year").textContent = y;
    document.getElementById("strip-sub").textContent = "The 20th, unless it lands on a weekend or a state holiday. " +
      (moved === 1 ? "One of them moves." : NUM[moved] + " of them move.");
    list.innerHTML = st.map(function (x) {
      return "<li" + (x.moved ? " class=\"moved\"" : "") + "><span class=\"mon\">" + x.mon + "</span><span class=\"day\">" + x.day +
        "</span><span class=\"wd\">" + x.wd + "</span>" + (x.moved ? "<span class=\"why\">" + esc(cap(x.why)) + "</span>" : "") + "</li>";
    }).join("");
  }

  function answerText(a) {
    var short = a.stay !== "ltr";
    var kind = a.stay === "str" ? "A short-term rental" : (a.stay === "ltr" ? "A long-term rental" : "A rental with short and long stays");
    var band = C.BANDS.filter(function (b) { return b.id === a.rent; })[0];
    var rent = !band ? ", rent not known yet" :
      ", " + (a.rent === "b1" || a.rent === "b5" ? band.label.charAt(0).toLowerCase() + band.label.slice(1) : "about " + band.label) + " a year";
    var get = a.have && a.have.get, tat = a.have && a.have.tat;
    var reg = short
      ? (get && tat ? "You're registered for GET and TAT" : get ? "You have a GET license but no TAT registration" :
         tat ? "You have a TAT registration but no GET license" : "You haven't registered yet")
      : (get ? "You have a GET license" : "You haven't registered yet");
    return kind + " " + PLACE[a.county] + rent + ". " + reg + ", " + STATUS[a.status] + ", and " + HOME[a.home] + ".";
  }

  function summaryText(a, P, county) {
    var L = P.list, short = a.stay !== "ltr";
    var s = L.taxes.length === 1
      ? "You owe one tax on this rental, general excise tax, filed with the state."
      : "You owe three taxes on this rental. All the returns go to the state, and the county's 3% is paid to " + county.county + " separately.";
    var g = rowFreq(P, "G-45"), t = rowFreq(P, "TA-1");
    var ad = P.rows[P.rows.length - 1].cells.filter(Boolean)[0].due;
    var aText = C.MONTHS[ad.m - 1] + " " + ad.d;
    if (!short && g) { s += " GET is due " + EVERY[g] + ", and the annual return on " + aText + "."; }
    else if (short && g && t) {
      s += g === t
        ? " GET, TAT and the county's 3% are all due " + EVERY[g] + ", and both annual returns on " + aText + "."
        : " TAT and the county's 3% are due " + EVERY[t] + ", GET " + EVERY[g] + ", and both annual returns on " + aText + ".";
    }
    return s;
  }

  function nextBox(a, P) {
    var n = P.next;
    var when = n.weekday + ", " + (n.days === 0 ? "today" : n.days === 1 ? "tomorrow" : n.days + " days from today");
    var h = "<aside class=\"next-box\" aria-labelledby=\"next-label\" data-due=\"" + esc(n.dueText) + "\">" +
      "<p class=\"next-label\" id=\"next-label\">" + (P.unknown.length ? "Next certain date" : "Next up") + (n.due.y !== today().y ? " in " + n.due.y : "") + "</p>" +
      "<p class=\"next-date\">" + MON[n.due.m - 1] + " " + n.due.d + "</p>" +
      "<p class=\"next-when\">" + esc(when) + "</p>" +
      "<ul class=\"next-items\">" + n.items.map(function (i) {
        return "<li><span class=\"f\">" + esc(i.form) + "</span><span>" + esc(i.what) + "</span></li>";
      }).join("") + "</ul>";
    if (P.unknown.length) {
      // the soonest an open schedule could come due is next month's state date
      var soon = C.upcoming("monthly", today(), 1)[0];
      var early = C.daysBetween(soon.due, n.due) > 0 ? ", which could be due as soon as " + soon.dueText : "";
      h += "<p class=\"next-note\">Plus your " + esc(joinList(P.unknown)) + esc(early) + (a.rent === "unsure"
        ? ". <a href=\"#q-rent\">Pick a rent range</a> to see them.</p>"
        : ", depending on the TAT schedule you picked when you registered.</p>");
    }
    return h + "</aside>";
  }

  function chart(a, P) {
    var cols = P.cols;
    function brk(i) { return i > 0 && cols[i].y !== cols[i - 1].y; }
    var years = [];
    cols.forEach(function (c, i) {
      var g = years[years.length - 1];
      if (g && g.y === c.y) { g.n += 1; } else { years.push({ y: c.y, n: 1, i: i }); }
    });
    var h = "<div class=\"chart-wrap\"><table class=\"year-chart\"><caption class=\"sr-only\">Your due dates from " +
      cols[0].month + " " + cols[0].y + " to " + cols[11].month + " " + cols[11].y + "</caption><thead><tr class=\"yr\"><td></td>" +
      years.map(function (g) { return "<th colspan=\"" + g.n + "\" scope=\"colgroup\"" + (g.i ? " class=\"yr-break\"" : "") + ">" + g.y + "</th>"; }).join("") +
      "</tr><tr class=\"cols\"><th scope=\"col\" class=\"due-h\">Due</th>" +
      cols.map(function (c, i) {
        var star = c.moved && c.marked;
        var cls = [star ? "moved" : "", brk(i) ? "yr-break" : ""].filter(Boolean).join(" ");
        return "<th scope=\"col\"" + (cls ? " class=\"" + cls + "\"" : "") + "><span class=\"mon\">" + c.mon + "</span><span class=\"day\">" +
          c.day + (star ? "<sup>*</sup>" : "") + "</span><span class=\"wd\">" + c.wd + "</span></th>";
      }).join("") + "</tr></thead><tbody>";
    P.rows.forEach(function (r) {
      var what = r.annual ? "Annual returns for " + r.year : r.label + ", " + (r.frequency ? HOW[r.frequency] : "schedule not set");
      h += "<tr data-form=\"" + esc(r.form) + "\"><th scope=\"row\"><span class=\"form\">" + esc(r.form) + "</span><span class=\"what\">" + esc(what) + "</span></th>";
      if (!r.cells) {
        h += "<td colspan=\"12\" class=\"open\">" + (a.rent === "unsure"
          ? "Depends on your rent. Pick a rent range to draw it."
          : "Depends on how much of your rent is short-term. See the notes below.") + "</td>";
      } else {
        h += r.cells.map(function (c, i) {
          return "<td" + (brk(i) ? " class=\"yr-break\"" : "") + ">" +
            (c ? "<span class=\"mk mk-" + r.kind + "\" aria-hidden=\"true\"></span><span class=\"sr-only\">Due " + esc(c.dueText) + "</span>" : "") + "</td>";
        }).join("");
      }
      h += "</tr>";
    });
    h += "</tbody></table></div>";
    h += "<ol class=\"date-list\" aria-label=\"Every due date in order\">" + P.groups.map(function (g) {
      return "<li><span class=\"dl-date\">" + esc(g.dueText) + "</span><span class=\"dl-items\">" + g.items.map(function (i) {
        return "<span><span class=\"f\">" + esc(i.form) + "</span> " + esc(i.what) + "</span>";
      }).join("") + "</span></li>";
    }).join("") + "</ol>";
    return h;
  }

  function notes(a, P, county) {
    var L = P.list, out = [];
    var wk = P.moved.filter(function (c) { return c.weekend; });
    var hol = P.moved.filter(function (c) { return !c.weekend; });
    if (wk.length) {
      out.push("<span class=\"star\">*</span> In " + joinList(wk.map(function (c) { return c.month; })) +
        " the 20th lands on a weekend, so state returns are due the next business day.");
    }
    hol.forEach(function (c) {
      out.push("<span class=\"star\">*</span> In " + c.month + " " + esc(c.why) + ", a state holiday, so that one's due " +
        C.WEEKDAYS[C.weekday(c.due)] + " the " + C.ordinal(c.due.d) + ".");
    });
    var cf = L.file.filter(function (f) { return f.county; })[0];
    if (cf) {
      out.push((cf.shifts
          ? cap(county.county) + " moves its payment dates off weekends and holidays the same way the state does."
          : cap(county.county) + " doesn't say its payment date moves, so pay " + esc(cf.form) + " by the plain 20th and you're always on time.") +
        " Once a year, by " + esc(cf.annualNext.dueText) + ", pay anything your TA-2 shows that wasn't on your TA-1s. " +
        "<a href=\"" + esc(cf.pay) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"county_pay_" + esc(a.county) + "\">" + esc(cf.payText) + "</a>." +
        (cf.payNote ? " " + esc(cf.payNote) : ""));
    }
    var g = rowFreq(P, "G-45"), t = rowFreq(P, "TA-1");
    if (g && t && g !== t) {
      out.push("Why two schedules? GET and TAT are judged separately. Your TAT comes to " + OWED[t] + ", so it's " + HOW[t] +
        ". Your GET comes to " + OWED[g] + ", so it's " + HOW[g] + ".");
    }
    var bb1 = " You choose your schedule on the BB-1 when you register, and you can check it in Hawaii Tax Online.";
    var openGet = P.unknown.indexOf("G-45") !== -1, openTat = P.unknown.indexOf("TA-1") !== -1;
    if (openGet) { out.push(FREQ_RULE.GET + (openTat ? "" : bb1)); }
    if (openTat) { out.push((a.stay === "both" ? "Only your short-term rent counts for TAT. " : "") + FREQ_RULE.TAT + bb1); }
    var g45 = L.file.filter(function (f) { return f.form === "G-45"; })[0];
    if (g45.note) { out.push(esc(g45.note)); }
    return out.length ? "<div class=\"notes\">" + out.map(function (x) { return "<p>" + x + "</p>"; }).join("") + "</div>" : "";
  }

  function render(a) {
    var t = today();
    var P = C.yearPlan(a, t);
    var list = P.list;
    var county = C.COUNTIES[a.county];

    var html = "<div class=\"container\"><div class=\"year-top\"><div class=\"year-intro\">" +
      "<p class=\"kicker\">Your checklist</p>" +
      "<h2 id=\"results-title\" tabindex=\"-1\">Your year, " + P.cols[0].month + " to " + P.cols[11].month + "</h2>" +
      "<p class=\"answers\">" + esc(answerText(a)) + " <a href=\"#checker\">Change my answers</a></p>" +
      "<p class=\"summary\">" + esc(summaryText(a, P, county)) + "</p>" +
      "</div>" + nextBox(a, P) + "</div>";

    if (list.first) {
      html += "<div class=\"priority\"><h3>" + esc(list.first.title) + "</h3><ol>" +
        list.first.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ol></div>";
    }

    if (list.register.length) {
      html += "<div class=\"register\"><h3>Register first</h3>" + list.register.map(function (r) {
        return "<div class=\"step-block\"><p class=\"step-title\">" + esc(r.title) + "</p><ol>" +
          r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
          (r.link ? "<p><a href=\"" + esc(r.link.href) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"register_" + esc(r.id) + "\">" + esc(r.link.text) + "</a></p>" : "") +
          "</div>";
      }).join("") + "</div>";
    }

    html += chart(a, P) + notes(a, P, county);

    html += "<h3 class=\"block-title owe-head\">What you owe</h3><div class=\"owe-grid\">" + list.taxes.map(function (x) {
      return "<div class=\"tax-row\"><p class=\"tax-rate\">" + esc(x.rate) + "</p><p class=\"tax-name\">" + esc(x.name) +
             "</p><p>" + esc(x.what) + " Paid to " + esc(x.who) + ".</p></div>";
    }).join("") + "</div>";

    html += "<div class=\"lists\"><div><h3 class=\"block-title\">Also on your list</h3>";
    if (list.also.length) {
      html += "<ul class=\"also-list\">" + list.also.map(function (x) {
        return "<li>" + esc(x.text) + (x.link ? " <a href=\"" + esc(x.link.href) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"also_" + esc(x.id) + "\">" + esc(x.link.text) + "</a>" : "") + "</li>";
      }).join("") + "</ul>";
    }
    if (!list.register.length) { html += "<p class=\"registered\">You're registered for everything this rental needs.</p>"; }
    else if (!list.also.length) { html += "<p class=\"registered\">Nothing else beyond registering, above.</p>"; }
    html += "</div>";

    if (list.tools.length) {
      html += "<div><h3 class=\"block-title\">Tools that can help</h3><ul class=\"tool-list\">" + list.tools.map(function (x) {
        var id = x.name.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
        return "<li class=\"tool-row\"><a class=\"tool-name\" href=\"" + esc(x.href) + "\" rel=\"" + (x.affiliate ? "sponsored noopener" : "noopener") +
          "\" target=\"_blank\" data-track=\"tool_" + id + "\">" + esc(x.name) + "</a><span>" + esc(x.why) +
          (x.affiliate && x.perk ? " " + esc(x.perk) : "") + "</span>" +
          (x.affiliate ? "<span class=\"tool-note\">We earn a commission if you sign up through this link. It doesn't change what we recommend.</span>" : "") +
          "</li>";
      }).join("") + "</ul>";
      html += "</div>";
    }
    html += "</div>";

    html += "<p class=\"actions\"><button type=\"button\" class=\"btn ghost\" id=\"edit-answers\">Change my answers</button>" +
            "<button type=\"button\" class=\"btn ghost\" id=\"copy-link\">Copy a link to this year</button></p>" +
            "<p class=\"copy-status\" role=\"status\" aria-live=\"polite\"></p>" +
            "<p class=\"fine-print\">State returns are due the 20th. When that's a weekend or state holiday, they're due the next business day (HRS 231-21), and the dates above already account for it. " +
            list.notes.map(esc).join(" ") + " This is general information, not tax advice.</p></div>";

    out.innerHTML = html;
    out.hidden = false;

    document.getElementById("edit-answers").addEventListener("click", function () {
      var first = document.getElementById("q-stay");
      first.scrollIntoView({ behavior: "smooth", block: "start" });
      var input = first.querySelector("input:checked") || first.querySelector("input");
      if (input) { input.focus({ preventScroll: true }); }
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

  function show(a, source) {
    render(a);
    var h = toHash(a);
    if (location.hash !== h) { history.replaceState(null, "", location.pathname + location.search + h); }
    if (source === "submit") {
      var title = document.getElementById("results-title");
      title.focus({ preventScroll: true });
      title.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    track("checker_complete", { stay: a.stay, county: a.county, rent: a.rent, status: a.status, home: a.home, source: source });
  }

  // ---------------------------------------------------------- events
  form.addEventListener("change", function (ev) {
    if (!started) { started = true; track("checker_start", {}); }
    if (ev.target.name === "stay") { syncStay(); }
    var fs = ev.target.closest("fieldset");
    if (fs && fs.classList.contains("invalid") && val(ev.target.name)) {
      fs.classList.remove("invalid");
      var msg = fs.querySelector(".field-error");
      if (msg) { msg.hidden = true; }
    }
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!validate()) { track("checker_incomplete", {}); return; }
    show(answers(), "submit");
  });

  renderStrip();

  // Arriving on a shared or bookmarked link: fill the form and show the list.
  if (fromHash()) {
    syncStay();
    var ok = REQUIRED.every(function (n) { return !!val(n); });
    if (ok) { show(answers(), "link"); }
  } else {
    syncStay();
  }
})();
