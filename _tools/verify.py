#!/usr/bin/env python3
"""Pre-push checks for the static site. Run: python3 _tools/verify.py

Four passes, all against the files on disk so this works before a push as
well as after one:

  1. every JSON-LD block parses, and every page carries a page-level type
  2. every internal link resolves, including #fragments
  3. no forbidden strings (retired offers, stale claims, em dashes)
  4. the shared header/footer/intake blocks are in sync with _partials/

Prints `file:line: message` for anything it finds and exits 1.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"_partials", "_tools", ".git"}

PAGE_TYPES = {"WebPage", "AboutPage", "CollectionPage", "Article", "WebSite"}

# (label, pattern, files allowed to contain it, pattern that makes it OK)
# That last field matters: "we never hold your tax money" and "not a CPA
# firm" are exactly the sentences we want on the page, so a bare keyword
# search would flag the copy it is meant to protect.
FORBIDDEN = [
    ("em dash", re.compile("\u2014"), set(), None),
    ("retired email-list CTA", re.compile(r"founding list", re.I), set(), None),
    ("retired lead form hook", re.compile(r"data-lead-form"), set(), None),
    ("promises an email we never send", re.compile(r"checklist is on its way"), set(), None),
    ("retired 'locked for life' promise", re.compile(r"locked for life", re.I), set(), None),
    ("inaccurate self-description", re.compile(r"technology-enabled"), set(), None),
    ("stale sitewide date stamp", re.compile(r"as of July 2026"), set(), None),
    ("unkept maintenance promise", re.compile(r"re-checked monthly"), set(), None),
    ("unqualified CPA claim", re.compile(r"CPA firm", re.I), set(),
     re.compile(r"(not|never|n't)\s+an?\s*CPA firm", re.I)),
    ("implies we hold client money", re.compile(r"\bhold\b[^.]{0,25}\bmoney\b", re.I), set(),
     re.compile(r"(never|don't|doesn't|do not|not)\b[^.]{0,30}\bhold\b"
                r"|\bhold\b[^.?]{0,25}\bmoney\b\?", re.I)),
]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.ids, self.ld = [], set(), []
        self._in_ld = False
        self._ld_line = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        if a.get("id"):
            self.ids.add(a["id"])
        if a.get("name") and tag == "a":
            self.ids.add(a["name"])
        for key in ("href", "src"):
            if a.get(key):
                self.links.append((a[key], line))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld, self._ld_line = True, line

    def handle_data(self, data):
        if self._in_ld:
            self.ld.append((data, self._ld_line))

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_ld = False


def pages():
    for path in sorted(ROOT.rglob("*.html")):
        if SKIP_DIRS & set(path.parts):
            continue
        yield path


def resolve(href: str, path: Path) -> Path | None:
    """Map an internal href to the file that serves it."""
    target = href.split("#")[0].split("?")[0]
    if not target:
        return path
    base = ROOT if target.startswith("/") else path.parent
    cand = (base / target.lstrip("/")).resolve()
    if cand.is_dir():
        cand = cand / "index.html"
    elif not cand.suffix:
        cand = cand.parent / (cand.name + "/index.html")
    return cand if cand.exists() else None


def main() -> int:
    findings = []
    parsed = {}

    for path in pages():
        text = path.read_text()
        p = PageParser()
        p.feed(text)
        parsed[path] = p
        rel = path.relative_to(ROOT).as_posix()

        # --- 1. structured data ---
        types = set()
        for block, line in p.ld:
            try:
                data = json.loads(block)
            except json.JSONDecodeError as e:
                findings.append(f"{rel}:{line}: JSON-LD does not parse ({e.msg})")
                continue
            nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
            for node in nodes:
                t = node.get("@type", [])
                types.update([t] if isinstance(t, str) else t)
        if rel != "404.html" and not types & PAGE_TYPES:
            findings.append(f"{rel}:1: no page-level JSON-LD ({' or '.join(sorted(PAGE_TYPES))})")

        # --- 3. forbidden strings ---
        for num, line in enumerate(text.splitlines(), 1):
            for label, pattern, allowed, excuse in FORBIDDEN:
                if rel in allowed:
                    continue
                hit = pattern.search(line)
                if hit and not (excuse and excuse.search(line)):
                    findings.append(f"{rel}:{num}: {label}: {hit.group(0)!r}")

    # --- 2. internal links (needs every page's ids collected first) ---
    for path, p in parsed.items():
        rel = path.relative_to(ROOT).as_posix()
        for href, line in p.links:
            if re.match(r"^(https?:|mailto:|tel:|data:|#\Z)", href):
                continue
            target = resolve(href, path)
            if target is None:
                findings.append(f"{rel}:{line}: dead link {href!r}")
                continue
            if "#" in href:
                frag = href.split("#", 1)[1]
                tp = parsed.get(target)
                if tp is None:
                    tp = PageParser()
                    tp.feed(target.read_text())
                    parsed[target] = tp
                if frag and frag not in tp.ids:
                    findings.append(f"{rel}:{line}: {href!r} points at a missing #{frag}")

    for f in findings:
        print(f)

    # --- 4. partials in sync ---
    sync = subprocess.run(
        [sys.executable, str(ROOT / "_tools" / "sync.py"), "--check"],
        capture_output=True, text=True,
    )
    if sync.returncode:
        print(sync.stdout.strip())

    if findings or sync.returncode:
        print(f"\nFAIL: {len(findings)} finding(s)")
        return 1
    print(f"OK: {len(list(pages()))} pages, links resolve, schema parses, partials in sync")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
