# hawaiirentaltax.com

A free checker for Hawaii rental owners. Six questions in, a checklist out:
which taxes they owe (GET, state TAT, county TAT), what to register for, which
returns to file, how often, and the date each one is due. Plus the 2026 rate
table and three plain-English articles.

Run by Veex Photo LLC. It replaced a tax filing service that was wound down on
2026-09-23 (vault: `decisions/2026-09-23-hrt-wind-down.md`). Nothing on this
site offers that service any more, and `_tools/verify.py` blocks anything that
would.

Static HTML, one stylesheet, plain JavaScript, no build step. GitHub Pages
serves `main`.

## How the checker works

- `assets/js/checker-logic.js` holds every rule: rates, the $2,000 and $4,000
  liability thresholds, the rent bands, Hawaii state holidays (HRS 8-1), the
  weekend and holiday rollover of due dates, and the checklist itself. Pure
  functions, no DOM, so node can test it.
- `assets/js/checker.js` reads the form, renders the checklist, and keeps the
  answers in the URL hash so a checklist can be bookmarked or shared.
- **Nothing is sent or stored.** No forms post anywhere, no database. Google
  Analytics gets page views, clicks, and the options picked in the checker.
- `RULES_CHECKED` at the top of `checker-logic.js` is the date the rules were
  last checked against the Department of Taxation and the counties. Change a
  rule and that date together.

## Before every push

```bash
python3 _tools/sync.py                 # stamp the shared header and footer
python3 _tools/verify.py               # structured data, links, banned copy
node _tools/test_checker.js            # every rule, every answer combination, every day 2026-2030
python3 -m http.server 8111 &          # then, with puppeteer-core on NODE_PATH:
NODE_PATH=<dir>/node_modules node _tools/test_checker_browser.js
```

The browser test drives every control in Chrome and checks every date, rate
and line on screen against the rules. Analytics requests are blocked during
the test so it never reaches the real property.

## Shared blocks

The header and footer live once in `_partials/` and are stamped between
`<!-- hrt:header -->` and `<!-- hrt:footer -->` markers by `_tools/sync.py`.
Edit the partial, never the stamped copy.

## Affiliate links

Recommendations live in `TOOLS` in `checker-logic.js`. Each has an
`affiliate` flag. Switch a link to its affiliate URL and set the flag to
`true` only after that program approves the site; the commission disclosure
appears automatically when any recommendation shown is an affiliate link.
