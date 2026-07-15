# Hawaii Rental Tax — coming-soon site

Static site for hawaiirentaltax.com. No build step, no framework. HTML + CSS + vanilla JS, deploys to GitHub Pages.

## Structure

- `index.html` — landing page (hero, problem, how it works, pricing, about, FAQ, two signup forms)
- `learn/` — SEO education hub + 3 articles (Bill 47 checklist, TAT 11%, GET for long-term rentals)
- `assets/css/style.css` — design system (ocean teal / sand / koa gold, Fraunces + Inter)
- `assets/js/main.js` — GA4 loader, click tracking, scroll depth, UTM capture, lead form
- `gas/lead-capture.gs` — Google Apps Script endpoint that writes leads to a Google Sheet
- `robots.txt`, `sitemap.xml`, `404.html`, `CNAME`, `favicon.svg`

## Preview locally

```bash
cd "/Users/veex/Documents/Developer/hawaii-rental-tax-site"
python3 -m http.server 8080
# open http://localhost:8080
```

(Open via the server, not file://, because paths are absolute.)

## Launch checklist

1. **Register hawaiirentaltax.com** (Porkbun or Cloudflare, ~$11/yr). Do this first.
2. **Create the GitHub repo** (public, required for free Pages): push this folder, enable Pages
   (Settings > Pages > Deploy from branch > main). The `CNAME` file is already in place.
3. **DNS at the registrar**: apex A records to GitHub Pages
   (185.199.108.153, .109.153, .110.153, .111.153) and `www` CNAME to `darthkanaka.github.io`.
   Enable "Enforce HTTPS" in repo settings once DNS propagates.
4. **Email**: set up forwarding for aloha@hawaiirentaltax.com (registrar forwarding or ImprovMX free tier).
5. **GA4**: create a property at analytics.google.com, paste the `G-...` ID into `HRT_CONFIG.GA_ID`
   in `assets/js/main.js`. Click tracking, scroll depth, and lead events start flowing automatically.
6. **Search Console**: add hawaiirentaltax.com as a Domain property (DNS TXT verification),
   submit `sitemap.xml`.
7. **Lead capture**: follow the comments in `gas/lead-capture.gs` (5 minutes), paste the web app URL
   into `HRT_CONFIG.FORM_ENDPOINT`.
8. **OG image**: shoot/design a 1200x630 image, save as `assets/img/og.jpg` (referenced on every page).
9. **About photo**: replace the placeholder block in `index.html` (#about) with a real photo of
   Kawika and Jordyn. This is the single highest-trust element on the site.

## Before-launch review (content)

- [ ] Verify every rate/deadline once more against DOTAX and Hawaii County sources
      (TAT 11%, county TAT 3%, GET rates table, Bill 47 Sept 1 deadline and fine amounts,
      penalty percentages, no-SOL claim).
- [ ] Confirm you're comfortable with full names in the JSON-LD founder block on `index.html`.
- [ ] Confirm final pricing ($49 founding / $59 regular / $249 setup / $500+ catch-up).
- [ ] Have the attorney skim the guarantee wording and footer disclaimer.
- [ ] Ask the attorney whether the footer should carry the legal-entity line
      ("Hawaii Rental Tax is a trade name of Veex Photo LLC") and add it if so.

## Content roadmap (post-launch)

One article per week, targeting long-tail owner questions: Maui/Oahu registration guides,
"GET vs income tax," what the G-49 is, HARPTA for sellers, per-island rate pages.
Every article ends in the same email capture.
