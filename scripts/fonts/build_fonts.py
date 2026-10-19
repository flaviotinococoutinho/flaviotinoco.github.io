#!/usr/bin/env python3
"""
Reproducible web-font build (developer tool; the site build only consumes the output).

Why not the fontsource packages: their latin subsets strip OpenType features the
typography depends on (onum oldstyle figures, smcp/c2sc small caps, sups, ordn), and
the npm provider loaded no italic. Here the upstream OFL sources from google/fonts,
pinned to one commit, are instanced and subset with fontTools:

  Literata (text)                  opsz fixed at 12 (text optical size), wght 400-700, roman + italic
  Atkinson Hyperlegible Next (UI)  wght 400-700, roman + italic
  Atkinson Hyperlegible Mono       wght 400-700

Every face is cut into two unicode-range slices: CORE (Portuguese and English
typography) and EXT (Latin Extended-A and common combining marks: names such as
Gödel's colleagues Łukasiewicz or Erdős, romanised Greek such as epistēmē). Browsers
download the EXT slice only when a page contains one of its characters.

Usage:  python3 -m pip install fonttools brotli
        python3 -I scripts/fonts/build_fonts.py      # writes src/assets/fonts/*
Provenance (source URL and sha256 of inputs and outputs, unicode ranges) is written
to src/assets/fonts/fonts.lock.json, which the Astro font configuration reads.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import tempfile
import urllib.request

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GOOGLE_FONTS_COMMIT = "47d54ca1ebb14fd864695f1d39dc734f39017c33"
RAW = f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_COMMIT}"
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets" / "fonts"

CORE = (
    list(range(0x20, 0x7F))  # ASCII
    + list(range(0xA0, 0x100))  # Latin-1 Supplement: all Portuguese letters, º ª « » § ¶ · ×
    + [0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC]
    + list(range(0x2000, 0x2070))  # general punctuation: dashes, quotes, ellipsis, thin/narrow spaces
    + [0x20AC, 0x2116, 0x2122]
    + [0x2190, 0x2191, 0x2192, 0x2193, 0x21D2, 0x21D4]  # arrows used in prose
    + [0x2212, 0x2215, 0x2219, 0x221E, 0x2248, 0x2260, 0x2264, 0x2265]  # operators used in prose (math: KaTeX)
    + [0x25CC, 0xFEFF, 0xFFFD]
)
EXT = sorted(set(range(0x100, 0x180)) - {0x131, 0x152, 0x153}) + list(range(0x300, 0x30D)) + [0x327, 0x328]
SLICES = (("", CORE), ("-ext", EXT))

KEEP_FEATURES = [
    "kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk",
    "onum", "lnum", "pnum", "tnum", "frac", "sups", "subs", "ordn", "case", "smcp", "c2sc", "zero",
]

# (output stem, family, style, source path in google/fonts, axis limits, licence path)
FONTS = [
    ("literata-roman", "Literata", "normal", "ofl/literata/Literata%5Bopsz,wght%5D.ttf",
     {"opsz": 12, "wght": (400, 700)}, "ofl/literata/OFL.txt"),
    ("literata-italic", "Literata", "italic", "ofl/literata/Literata-Italic%5Bopsz,wght%5D.ttf",
     {"opsz": 12, "wght": (400, 700)}, "ofl/literata/OFL.txt"),
    ("atkinson-next-roman", "Atkinson Hyperlegible Next", "normal",
     "ofl/atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext%5Bwght%5D.ttf",
     {"wght": (400, 700)}, "ofl/atkinsonhyperlegiblenext/OFL.txt"),
    ("atkinson-next-italic", "Atkinson Hyperlegible Next", "italic",
     "ofl/atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext-Italic%5Bwght%5D.ttf",
     {"wght": (400, 700)}, "ofl/atkinsonhyperlegiblenext/OFL.txt"),
    ("atkinson-mono", "Atkinson Hyperlegible Mono", "normal",
     "ofl/atkinsonhyperlegiblemono/AtkinsonHyperlegibleMono%5Bwght%5D.ttf",
     {"wght": (400, 700)}, "ofl/atkinsonhyperlegiblemono/OFL.txt"),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(path: str) -> bytes:
    with urllib.request.urlopen(f"{RAW}/{path}", timeout=60) as response:  # noqa: S310 (pinned https URL)
        return response.read()


def css_ranges(codepoints: list[int]) -> str:
    """CSS unicode-range value for a list of code points (consecutive runs merged)."""
    cps = sorted(set(codepoints))
    parts: list[str] = []
    start = prev = cps[0]
    for cp in cps[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        start = prev = cp
    parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
    return ", ".join(parts)


def subset(instanced: pathlib.Path, unicodes: list[int], target: pathlib.Path) -> bytes:
    font = TTFont(instanced)
    options = Options()
    options.layout_features = KEEP_FEATURES
    options.flavor = "woff2"
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep copyright and licence names (OFL)
    options.notdef_outline = True
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(target)
    return target.read_bytes()


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    licences: dict[str, bytes] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for stem, family, style, src, limits, licence in FONTS:
            raw = fetch(src)
            source_file = pathlib.Path(tmp) / f"{stem}.ttf"
            source_file.write_bytes(raw)
            # Instance first and round-trip through a file: subsetting the in-memory
            # instancer result trips over lazily-loaded gvar data in fontTools 4.66.
            instanced = pathlib.Path(tmp) / f"{stem}.instanced.ttf"
            instancer.instantiateVariableFont(TTFont(source_file), limits, updateFontNames=False).save(instanced)
            weight = limits["wght"]
            for suffix, unicodes in SLICES:
                target = OUT / f"{stem}{suffix}.woff2"
                data = subset(instanced, unicodes, target)
                entries.append({
                    "file": target.name,
                    "family": family,
                    "style": style,
                    "weight": f"{weight[0]} {weight[1]}",
                    "unicodeRange": css_ranges(unicodes),
                    "source": f"{RAW}/{src}",
                    "sourceSha256": sha256(raw),
                    "axes": {k: list(v) if isinstance(v, tuple) else v for k, v in limits.items()},
                    "features": KEEP_FEATURES,
                    "bytes": len(data),
                    "sha256": sha256(data),
                })
                print(f"{target.name:32} {len(data) / 1024:7.1f} KiB")
            licences.setdefault(licence, fetch(licence))
    for path, text in licences.items():
        (OUT / f"OFL-{path.split('/')[1]}.txt").write_bytes(text)
    lock = {"source": "https://github.com/google/fonts", "commit": GOOGLE_FONTS_COMMIT, "fonts": entries}
    (OUT / "fonts.lock.json").write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
