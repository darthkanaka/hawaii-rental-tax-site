/* Hawaii Rental Tax — analytics + lead capture
   Fill in the two values in HRT_CONFIG before launch (see README). */

window.HRT_CONFIG = {
  GA_ID: "G-2N3V0S9QT9",   // GA4 Measurement ID (property under kaveex@gmail.com)
  SUPABASE_URL: "https://buasiiuvzxpbzrpqlnfy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXNpaXV2enhwYnpycHFsbmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NDM4MzgsImV4cCI6MjA3ODIxOTgzOH0.sQ8EOxm6MfMqUE5BBvvcIryNvFb-0anxvW3KvmabGC0" // publishable; leads table is insert-only via RLS
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

  /* ---------- click tracking: any element with data-track ---------- */
  document.addEventListener("click", function (ev) {
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

  /* ---------- lead form ---------- */
  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var emailInput = form.querySelector("input[type='email']");
      var btn = form.querySelector("button[type='submit']");
      var status = form.querySelector(".form-status");
      var email = (emailInput.value || "").trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = "That email doesn't look right. Mind checking it?";
        status.className = "form-status err";
        return;
      }

      track("lead_submit", { form: form.getAttribute("data-lead-form") });

      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
        // Database not wired yet: give people a working path so no lead is lost.
        status.textContent = "Almost live. Email us at aloha@hawaiirentaltax.com and we'll add you by hand.";
        status.className = "form-status ok";
        return;
      }

      var utm = null;
      try { utm = JSON.parse(localStorage.getItem("hrt_utm") || "null"); } catch (e) {}

      btn.disabled = true;
      btn.textContent = "Adding you…";

      fetch(cfg.SUPABASE_URL + "/rest/v1/leads", {
        method: "POST",
        headers: {
          "apikey": cfg.SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          email: email,
          form: form.getAttribute("data-lead-form"),
          page: location.pathname,
          utm: utm
        })
      })
        .then(function (res) {
          if (res.ok) {
            status.textContent = "You're on the list. The checklist is on its way to your inbox.";
            status.className = "form-status ok";
            track("lead_success", { form: form.getAttribute("data-lead-form") });
          } else if (res.status === 409) {
            status.textContent = "You're already on the list. See you at launch.";
            status.className = "form-status ok";
            track("lead_duplicate", {});
          } else {
            throw new Error("insert failed " + res.status);
          }
        })
        .catch(function () {
          status.textContent = "Something broke on our end. Email aloha@hawaiirentaltax.com and we'll add you ourselves.";
          status.className = "form-status err";
          track("lead_error", {});
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Join the founding list";
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
