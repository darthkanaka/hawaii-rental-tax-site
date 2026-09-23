/* Hawaii Rental Tax: analytics + inquiry capture.
   Inquiries insert into the Supabase `intakes` table, which is insert-only
   under row level security. Schema and the notification trigger live in the
   private engine repo, db/002_intakes.sql. */

window.HRT_CONFIG = {
  GA_ID: "G-2N3V0S9QT9",   // GA4 Measurement ID (property under kaveex@gmail.com)
  SUPABASE_URL: "https://buasiiuvzxpbzrpqlnfy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXNpaXV2enhwYnpycHFsbmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NDM4MzgsImV4cCI6MjA3ODIxOTgzOH0.sQ8EOxm6MfMqUE5BBvvcIryNvFb-0anxvW3KvmabGC0" // publishable; intakes table is insert-only via RLS
};

(function () {
  "use strict";
  var cfg = window.HRT_CONFIG;

  /* ---------- GA4 loader (skipped until a real ID is set) ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  var gaLive = cfg.GA_ID && cfg.GA_ID.indexOf("XXXX") === -1;
  if (gaLive) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.GA_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    gtag("config", cfg.GA_ID, { anonymize_ip: true });
  }

  function track(name, params) {
    params = params || {};
    params.page_path = location.pathname;
    if (gaLive) { gtag("event", name, params); }
    else if (window.console && console.debug) { console.debug("[track]", name, params); }
  }

  /* ---------- first-touch UTM capture ---------- */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  try {
    var qs = new URLSearchParams(location.search);
    var seen = localStorage.getItem("hrt_utm");
    if (!seen) {
      var utm = {};
      var any = false;
      UTM_KEYS.forEach(function (k) {
        if (qs.get(k)) { utm[k] = qs.get(k); any = true; }
      });
      utm.landing = location.pathname;
      utm.referrer = document.referrer || "direct";
      if (any || !localStorage.getItem("hrt_utm")) {
        localStorage.setItem("hrt_utm", JSON.stringify(utm));
      }
    }
  } catch (e) { /* private mode, ignore */ }

  /* ---------- click tracking ----------
     Phone and email links get their own events and stop there, so a tel:
     link carrying data-track doesn't also fire the generic click event.
     gtag sends with sendBeacon, so the dialer navigation doesn't lose it. */
  function linkLocation(a) {
    if (a.getAttribute("data-track")) { return a.getAttribute("data-track"); }
    if (a.closest(".site-header")) { return "header"; }
    if (a.closest(".site-footer")) { return "footer"; }
    if (a.closest(".hero")) { return "hero"; }
    return "body";
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("a");
    if (a && a.protocol === "tel:") {
      track("phone_click", { location: linkLocation(a) });
      return;
    }
    if (a && a.protocol === "mailto:") {
      track("email_click", { location: linkLocation(a) });
      return;
    }

    var el = ev.target.closest("[data-track]");
    if (el) {
      track("click", {
        label: el.getAttribute("data-track"),
        text: (el.textContent || "").trim().slice(0, 60)
      });
    }
    var out = ev.target.closest("a[href^='http']");
    if (out && out.hostname !== location.hostname) {
      track("outbound_click", { url: out.href });
    }
  });

  /* ---------- scroll depth ---------- */
  var marks = [25, 50, 75, 90];
  var fired = {};
  function onScroll() {
    var doc = document.documentElement;
    var total = doc.scrollHeight - window.innerHeight;
    if (total <= 0) { return; }
    var pct = Math.round((window.scrollY / total) * 100);
    marks.forEach(function (m) {
      if (pct >= m && !fired[m]) {
        fired[m] = true;
        track("scroll_depth", { percent: m });
      }
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- inquiry form ----------
     One handler for every intake form on the site. The row is built from an
     explicit column list: PostgREST rejects the whole insert with a 400 if
     it sees a key that isn't a column, and the honeypot is one of those. */
  var INTAKE_COLS = [
    "name", "email", "phone", "situation", "island", "rental_type",
    "property_count", "message"
  ];
  var PHONE_HTML = '<a href="tel:+18082326959">(808) 232-6959</a>';

  document.querySelectorAll("form[data-intake-form]").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var btn = form.querySelector("button[type='submit']");
      var status = form.querySelector(".form-status");
      var fields = form.querySelector(".form-fields");
      var data = new FormData(form);

      function say(text, kind) {
        status.innerHTML = text;
        status.className = "form-status " + kind;
      }

      // Honeypot: a bot filled in the off-screen field. Look successful,
      // send nothing.
      if ((data.get("website") || "").toString().trim()) {
        if (fields) { fields.hidden = true; }
        say("Thanks. We'll be in touch within one business day.", "ok");
        track("intake_bot", {});
        return;
      }

      // reportValidity still works on a novalidate form
      if (!form.reportValidity()) { return; }

      var email = (data.get("email") || "").toString().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        say("That email doesn't look right. Mind checking it?", "err");
        return;
      }

      var row = { page: location.pathname };
      INTAKE_COLS.forEach(function (key) {
        var value = (data.get(key) || "").toString().trim();
        if (value) { row[key] = value; }
      });
      try {
        row.utm = JSON.parse(localStorage.getItem("hrt_utm") || "null");
      } catch (e) { /* private mode, ignore */ }

      track("intake_submit", { situation: row.situation || "unknown" });

      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending\u2026";

      fetch(cfg.SUPABASE_URL + "/rest/v1/intakes", {
        method: "POST",
        headers: {
          "apikey": cfg.SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(row)
      })
        .then(function (res) {
          if (!res.ok) { throw new Error("insert failed " + res.status); }
          // hide the fields so a second click can't send it twice
          if (fields) { fields.hidden = true; }
          say("Got it. You'll hear back within one business day, by phone if you left a number.", "ok");
          track("intake_success", { situation: row.situation || "unknown" });
        })
        .catch(function (err) {
          var code = (err && err.message || "").replace(/\D+/g, "") || "0";
          say("Something broke on our end, sorry. Call us at " + PHONE_HTML +
              " or email aloha@hawaiirentaltax.com and we'll pick it up from there.", "err");
          track("intake_error", { status: code });
          btn.disabled = false;
          btn.textContent = label;
        });
    });
  });
})();

/* ---------- mobile nav toggle (2026-07 design overhaul) ---------- */
(function () {
  "use strict";
  var header = document.querySelector(".site-header");
  var btn = document.querySelector(".menu-toggle");
  if (!header || !btn) { return; }

  function setOpen(open) {
    header.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  btn.addEventListener("click", function () {
    setOpen(!header.classList.contains("nav-open"));
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && header.classList.contains("nav-open")) {
      setOpen(false);
      btn.focus();
    }
  });

  document.querySelectorAll(".nav-links a").forEach(function (a) {
    a.addEventListener("click", function () { setOpen(false); });
  });
})();

/* ---------- ink-settling reveals (2026-07 design overhaul)
   Progressive enhancement only: without JS (or with reduced motion)
   everything stays visible; this module just adds the animated state. */
(function () {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }
  if (!("IntersectionObserver" in window)) { return; }

  var targets = document.querySelectorAll(
    ".hero .container > *, .section-head, .card, .step, .guarantee, " +
    ".signup-card, .stakes, .faq details, .cta-inline, .article-list .card"
  );
  if (!targets.length) { return; }

  document.documentElement.classList.add("motion");

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

  targets.forEach(function (el) {
    var sec = el.closest("section, article, main") || document.body;
    var i = (sec.hrtRevealCount = (sec.hrtRevealCount || 0) + 1) - 1;
    el.style.setProperty("--d", Math.min(i * 80, 320) + "ms");
    el.classList.add("reveal");
    io.observe(el);
  });
})();
