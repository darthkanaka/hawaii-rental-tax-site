/* Hawaii Rental Tax — analytics + lead capture
   Fill in the two values in HRT_CONFIG before launch (see README). */

window.HRT_CONFIG = {
  GA_ID: "G-XXXXXXXXXX",   // GA4 Measurement ID from analytics.google.com
  FORM_ENDPOINT: ""         // Google Apps Script web app URL (see gas/lead-capture.gs)
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

      var payload = new URLSearchParams();
      payload.set("email", email);
      payload.set("form", form.getAttribute("data-lead-form"));
      payload.set("page", location.pathname);
      try { payload.set("utm", localStorage.getItem("hrt_utm") || ""); } catch (e) {}

      if (!cfg.FORM_ENDPOINT) {
        // Endpoint not wired yet: still record the attempt locally so no lead is lost in testing.
        status.textContent = "Almost live. Email us at aloha@hawaiirentaltax.com and we'll add you by hand.";
        status.className = "form-status ok";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Adding you…";

      fetch(cfg.FORM_ENDPOINT, { method: "POST", mode: "no-cors", body: payload })
        .then(function () {
          form.querySelector(".form-fields") && (form.querySelector(".form-fields").style.display = "none");
          status.textContent = "You're on the list. The checklist is on its way to your inbox.";
          status.className = "form-status ok";
          track("lead_success", { form: form.getAttribute("data-lead-form") });
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
