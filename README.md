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
- `yearPlan()` in the same file lays the checklist out as a year: twelve
  monthly columns from the next state due date, one row per return or
  payment, every due date as an event, and the next one up. `yearStrip()`
  gives the front page its calendar year of 20ths and why each one moves.
- `assets/js/checker.js` reads the form, renders the year, and keeps the
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

## Design

"The Twentieth" (2026-10-01): almost every deadline lands on the 20th, so the
site reads like a tide table. Deep ocean ink for the header, hero and footer,
sand for the page, a paper band for results, coral for anything due. Sofia
Sans Extra Condensed for display and numerals, Sofia Sans for body. Tokens and
the contrast notes are at the top of `assets/css/style.css`. The favicon is a
drawn "20" in `favicon.svg`; the PNG icons and `og.jpg` were rendered from it.

## Shared blocks

The header and footer live once in `_partials/` and are stamped between
`<!-- hrt:header -->` and `<!-- hrt:footer -->` markers by `_tools/sync.py`.
Edit the partial, never the stamped copy.

## Affiliate links

Recommendations live in `TOOLS` in `checker-logic.js`. Each has an
`affiliate` flag. Switch a link to the program's own referral URL and set the
flag to `true` only once that account exists; the link then gets
`rel="sponsored"` and its own commission note, and an optional `perk` (a
discount only the referral link gets) shows beside it.

Live: **Hospitable** since 2026-10-09, $200 per qualified host, account
kawika@elevatemediahi.com under Veex Photo LLC, dashboard at
affiliates.hospitable.com.
