# hawaiirentaltax.com

Static site for Hawaii Rental Tax, a trade name of Veex Photo LLC. No build step and no framework: HTML, one stylesheet, one script. GitHub Pages deploys from `main` on every push.

Its job is to convert people who arrive from outreach, referrals and a small ads test, and to look legitimate enough that someone is willing to hand over a Social Security number. It is not trying to rank: see `projects/hawaii-rental-tax-viability-audit-2026-09-21.md` in the vault for why.

## The offers, in the order the site leads with them

1. **Catch-up filing**, flat fee from $500. Letters, tax clearances, years of unfiled returns. This is the front door.
2. **Property manager filing desk**, $39 per owner per month, minimum four owners, no setup fee.
3. **Monthly filing**, $49 founding or $59 regular per property per month plus $249 setup.
4. **Long-term landlords**, $249 a year per property, general excise tax only.

Any price or guarantee wording on the site has to match `/terms/`. The guarantee in particular has one canonical wording, at `/terms/#guarantee`, and the engagement letter repeats it.

## Layout

- `index.html` front door: the four situations, who runs this, how it works, guarantee, FAQ
- `catch-up/`, `property-managers/`, `pricing/`, `about/`, `start/` the pages the front door feeds
- `rates/` the island-by-island rate table, the only page earning search impressions
- `learn/` three articles plus a hub
- `privacy/`, `terms/` published legal pages, written against real law. Do not reword casually
- `_partials/` the shared header, footer and enquiry form
- `_tools/sync.py`, `_tools/verify.py` see below
- `assets/css/style.css` the design system, "The Bound Sheet": Newsreader over Inter, paper, ink, pine, brass, copper
- `assets/js/main.js` GA4, click and scroll tracking, first-touch UTM capture, the enquiry form

Folders starting with an underscore are not served: Jekyll excludes them, and there is no `.nojekyll`.

## Shared blocks

The header, footer and enquiry form live once in `_partials/` and are stamped between marker comments in each page:

```html
<!-- hrt:header -->   ... generated ...   <!-- /hrt:header -->
<!-- hrt:footer -->   ... generated ...   <!-- /hrt:footer -->
<!-- hrt:intake id="cu" preset="behind" count="properties" --> ... <!-- /hrt:intake -->
```

Edit the partial, never the generated copy, then:

```bash
python3 _tools/sync.py
```

Three nav variants and three different footers were live at the same time before this existed.

## Before every push

```bash
python3 _tools/sync.py     # stamp the shared blocks
python3 _tools/verify.py   # must print OK
python3 -m http.server 8080   # then walk the site at 375px and desktop
```

`verify.py` parses every JSON-LD block, resolves every internal link including `#fragments`, greps for retired copy and stale claims, and checks the partials are in sync. Open the preview through the server, not `file://`, because paths are absolute.

## Enquiries

The form posts to the Supabase `intakes` table, which is insert-only under row level security. The anon key in `main.js` is publishable by design; row level security is the boundary, and there is no read policy, so nobody can pull the list out of the page source.

Schema, constraints and the notification trigger live in the private engine repo at `db/002_intakes.sql`. On insert, a Postgres trigger posts the row to a Google Apps Script web app running under the aloha@hawaiirentaltax.com Workspace account, which emails the enquiry to us and sends the person a fixed acknowledgment. The endpoint URL and its token sit in Supabase Vault, not in any repo.

Read enquiries in the Supabase table editor, or server-side with the service role key. The `leads` table is the retired email list and is no longer written to.

## Things that are deliberately not here

- **No buy button.** The live Stripe link stays private until the client paperwork clears review. The site takes enquiries, not payments.
- **No postal address**, because there is no PO box yet. That also blocks any marketing email, which legally needs one.
- **No claim to be a CPA firm**, and nothing suggesting the state endorses us. The Verified Practitioner registration is a registration, not an endorsement.
- **Nothing implying we hold client tax money.** The client's own bank account pays the state.

`verify.py` enforces the last two as string checks.

## When rates change

`rates/` carries a visible date stamp and a note saying when it was last checked. Change the numbers and the stamp together, and update `LEGAL_DATE` in `_tools/sync.py`, which is the "as of" date in every footer. Last checked 2026-09-22 against the Department of Taxation, which corrected Maui from 4% to 4.5% general excise tax: Maui adopted a 0.5% county surcharge on 2024-01-01 and the page had never reflected it.
