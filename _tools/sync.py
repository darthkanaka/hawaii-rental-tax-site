#!/usr/bin/env python3
"""Stamp the shared header and footer into every page.

There is no build step on this site, so the nav and footer used to be
hand-copied into every file. That is how three different nav variants and
three different footers ended up live at the same time. This script keeps
one copy of each block in _partials/ and writes it between marker comments:

    <!-- hrt:header -->  ... generated ...  <!-- /hrt:header -->
    <!-- hrt:footer -->  ... generated ...  <!-- /hrt:footer -->

Run it before every commit. `--check` exits 1 and names the drifted files
without writing anything; verify.py calls it that way.

Underscore-prefixed folders are not served by GitHub Pages (Jekyll excludes
them), so _partials/ and _tools/ never reach the public site.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTIALS = ROOT / "_partials"

# Bumped whenever the tax content on the site is re-verified against DOTAX.
LEGAL_DATE = "September 2026"



def page_url(path: Path) -> str | None:
    """The public URL a file is served at, or None if it has no nav."""
    rel = path.relative_to(ROOT).as_posix()
    if rel == "404.html":
        return None
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def build_header(url: str | None) -> str:
    html = (PARTIALS / "header.html").read_text()
    if url:
        # mark the one nav link that points at this page
        html = html.replace(
            f'<a href="{url}">', f'<a href="{url}" aria-current="page">', 1
        )
    return html


def build_footer(_url: str | None) -> str:
    return (PARTIALS / "footer.html").read_text().replace("{{legal_date}}", LEGAL_DATE)




BUILDERS = {"header": build_header, "footer": build_footer}


def stamp(path: Path) -> str:
    text = path.read_text()
    url = page_url(path)

    for name in ("header", "footer"):
        pattern = re.compile(
            rf"(<!-- hrt:{name} -->\n)(.*?)(^\s*<!-- /hrt:{name} -->)",
            re.DOTALL | re.MULTILINE,
        )
        text = pattern.sub(
            lambda m: m.group(1) + BUILDERS[name](url) + m.group(3), text
        )

    return text


def main() -> int:
    check = "--check" in sys.argv
    drifted = []

    for path in sorted(ROOT.rglob("*.html")):
        if "_partials" in path.parts or "_tools" in path.parts:
            continue
        before = path.read_text()
        after = stamp(path)
        if before == after:
            continue
        drifted.append(path.relative_to(ROOT).as_posix())
        if not check:
            path.write_text(after)

    if check and drifted:
        print("shared blocks are out of date in:")
        for name in drifted:
            print(f"  {name}  (run python3 _tools/sync.py)")
        return 1
    if not check and drifted:
        print(f"synced {len(drifted)} file(s):")
        for name in drifted:
            print(f"  {name}")
    elif not check:
        print("all pages already in sync")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
