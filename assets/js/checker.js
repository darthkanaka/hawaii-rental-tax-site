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
  var FREQ_RULE = {
    GET: "How often depends on the GET you owe in a year. Twice a year at $2,000 or less, quarterly at $4,000 or less, and monthly above that. In rent, that's about $44,000 and $89,000 a year.",
    TAT: "How often depends on the TAT you owe in a year. Twice a year at $2,000 or less, quarterly at $4,000 or less, and monthly above that. In short-term rent, that's about $18,000 and $36,000 a year."
  };

  function nextText(next) {
    if (!next || !next.length) { return ""; }
    var first = "Next due <strong class=\"due\">" + esc(next[0].dueText) + "</strong>, for " + esc(next[0].period) + ".";
    var then = next[1] ? " Then " + esc(next[1].dueText) + "." : "";
    return first + then;
  }

  function fileRow(f, county) {
    var body;
    if (f.county) {
      body = "<p>" + esc(f.text) + "</p>";
      if (f.frequency) {
        body += "<p>Paid <strong>" + esc(f.frequencyText) + "</strong>. Next payment due <strong class=\"due\">" + esc(f.next[0].dueText) + "</strong>, for " + esc(f.next[0].period) + "." +
                (f.next[1] ? " Then " + esc(f.next[1].dueText) + "." : "") + "</p>";
        if (!f.shifts) {
          body += "<p>The county doesn't say its payment date moves off weekends and holidays, so these are the plain 20th. Paying by then is always on time.</p>";
        }
      } else {
        body += "<p>Paid on the same schedule as your TA-1, due the 20th.</p>";
      }
      body += "<p>Once a year, by <strong class=\"due\">" + esc(f.annualNext.dueText) + "</strong>, pay anything your TA-2 shows that wasn't on your TA-1s.</p>";
      body += "<p><a href=\"" + esc(f.pay) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"county_pay_" + esc(county.key) + "\">" + esc(f.payText) + "</a>." +
              (f.payNote ? " " + esc(f.payNote) : "") + "</p>";
    } else if (f.annual) {
      body = "<p>Once a year. Next due <strong class=\"due\">" + esc(f.next[0].dueText) + "</strong>, covering " + esc(f.next[0].period) + ".</p>";
    } else if (f.frequency) {
      body = "<p>Filed <strong>" + esc(f.frequencyText) + "</strong>, most likely, based on your rent. " + nextText(f.next) + "</p>" +
             (f.note ? "<p>" + esc(f.note) + "</p>" : "");
    } else {
      var rule = f.tax === "GET" ? FREQ_RULE.GET : FREQ_RULE.TAT;
      body = "<p>" + (f.mode === "both" ? "Only your short-term rent counts for TAT. " : "") + esc(rule) + "</p>" +
             "<p>You choose your schedule on the BB-1 when you register, and you can check it in Hawaii Tax Online.</p>" +
             (f.note ? "<p>" + esc(f.note) + "</p>" : "");
    }
    var title = esc(f.form);
    var sub = f.county ? "County TAT payment" : (f.annual ? "Annual " + esc(f.tax).replace("State", "state") + " return" : esc(f.tax) + " return");
    return "<div class=\"file-row\"><div class=\"file-id\"><span class=\"form-id\">" + title + "</span><span class=\"form-sub\">" + sub + "</span></div><div class=\"file-body\">" + body + "</div></div>";
  }

  function render(a) {
    var t = today();
    var list = C.checklist(a, t);
    var county = C.COUNTIES[a.county];
    county.key = a.county;
    var taxes = list.taxes.length;

    var html = "<h2 id=\"results-title\" tabindex=\"-1\">Your checklist</h2>";
    html += "<p class=\"summary\">" + (taxes === 1
      ? "You owe one tax on this rental, general excise tax, filed with the state."
      : "You owe three taxes on this rental. All the returns go to the state, and the county's 3% is paid to " + esc(county.county) + " separately.") + "</p>";

    if (list.first) {
      html += "<div class=\"priority\"><h3>" + esc(list.first.title) + "</h3><ol>" +
        list.first.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ol></div>";
    }

    html += "<h3>What you owe</h3><div class=\"tax-list\">" + list.taxes.map(function (x) {
      return "<div class=\"tax-row\"><span class=\"tax-rate\">" + esc(x.rate) + "</span><div><p class=\"tax-name\">" + esc(x.name) +
             "</p><p>" + esc(x.what) + " Paid to " + esc(x.who) + ".</p></div></div>";
    }).join("") + "</div>";

    html += "<h3>Register</h3>";
    if (list.register.length) {
      html += list.register.map(function (r) {
        var steps = r.steps.length === 1 ? "<p>" + esc(r.steps[0]) + "</p>" :
          "<ol>" + r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>";
        return "<div class=\"step-block\"><p class=\"step-title\">" + esc(r.title) + "</p>" + steps +
          (r.link ? "<p><a href=\"" + esc(r.link.href) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"register_" + esc(r.id) + "\">" + esc(r.link.text) + "</a></p>" : "") +
          "</div>";
      }).join("");
    } else {
      html += "<p>You're registered for everything this rental needs.</p>";
    }

    html += "<h3>What to file, and when</h3><div class=\"file-list\">" +
      list.file.map(function (f) { return fileRow(f, county); }).join("") + "</div>" +
      "<p class=\"fine-print\">State returns are due the 20th. When that's a weekend or state holiday, they're due the next business day (HRS 231-21), and the dates above already account for it.</p>";

    if (list.also.length) {
      html += "<h3>Also required</h3><ul class=\"also-list\">" +
        list.also.map(function (x) {
          return "<li>" + esc(x.text) + (x.link ? " <a href=\"" + esc(x.link.href) + "\" rel=\"noopener\" target=\"_blank\" data-track=\"also_" + esc(x.id) + "\">" + esc(x.link.text) + "</a>" : "") + "</li>";
        }).join("") + "</ul>";
    }

    if (list.tools.length) {
      html += "<h3>Tools that can help</h3><div class=\"tool-list\">" + list.tools.map(function (x) {
        var id = x.name.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
        return "<div class=\"tool-row\"><p class=\"tool-name\">" + esc(x.name) + "</p><p>" + esc(x.why) + "</p>" +
          "<p><a href=\"" + esc(x.href) + "\" rel=\"" + (x.affiliate ? "sponsored noopener" : "noopener") + "\" target=\"_blank\" data-track=\"tool_" + id + "\">Visit " + esc(x.name) + "</a></p></div>";
      }).join("") + "</div>";
      if (list.tools.some(function (x) { return x.affiliate; })) {
        html += "<p class=\"fine-print\">Some of these links pay us a commission if you sign up. It doesn't change what you pay or what we recommend.</p>";
      }
    }

    html += "<p class=\"fine-print\">" + list.notes.map(esc).join(" ") + " This is general information, not tax advice.</p>";
    html += "<p class=\"actions\"><button type=\"button\" class=\"btn ghost\" id=\"edit-answers\">Change my answers</button>" +
            "<button type=\"button\" class=\"btn ghost\" id=\"copy-link\">Copy a link to this checklist</button></p>" +
            "<p class=\"copy-status\" role=\"status\" aria-live=\"polite\"></p>";

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

  // Arriving on a shared or bookmarked link: fill the form and show the list.
  if (fromHash()) {
    syncStay();
    var ok = REQUIRED.every(function (n) { return !!val(n); });
    if (ok) { show(answers(), "link"); }
  } else {
    syncStay();
  }
})();
