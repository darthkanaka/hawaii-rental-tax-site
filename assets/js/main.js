/* Hawaii Rental Tax: analytics, click and scroll tracking, nav, reveals.
   No forms and no database: the checker runs entirely in the browser. */

window.HRT_CONFIG = {
  GA_ID: "G-2N3V0S9QT9"   // GA4 Measurement ID (property under kaveex@gmail.com)
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

  // let page scripts (the checker) send events through the same tracker
  window.hrtTrack = track;
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
