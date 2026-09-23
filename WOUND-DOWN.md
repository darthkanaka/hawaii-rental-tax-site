# Hawaii Rental Tax: wound down 2026-09-23

This site is no longer published. GitHub Pages was disabled for this repository
on 2026-09-23 and hawaiirentaltax.com no longer resolves to it.

The venture ran from 2026-07-14 to 2026-09-23 and took no clients. It was wound
down because it had become a licensed professional service holding client Social
Security numbers and bank details against a monthly legal deadline, which is the
opposite of what it was selected to be.

**The code here still contains a publishable Supabase key.** It cannot write
anything: the `anon` insert policies on `public.intakes` and `public.leads` were
dropped on 2026-09-23 and the notification trigger disabled. Both tables are
empty. Do not re-enable them without re-reading why they were closed.

Written up in the Obsidian vault:

- `decisions/2026-09-23-hrt-wind-down.md`, the decision and what was done
- `projects/hawaii-rental-tax-drift-retrospective.md`, kept as the worked
  example of scope drift
- `knowledge/venture-drift-checklist.md`, the reusable rules it produced

Worth keeping from this repo regardless of the venture: `_tools/sync.py` and
`_tools/verify.py` (shared partials plus a checker for structured data, link and
fragment resolution, and retired copy), and the "Bound Sheet" design system in
`assets/css/style.css`.
