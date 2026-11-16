#!/usr/bin/env python3
"""
Static TrueType instances for the share cards (developer tool; the site build only consumes the output).

The share cards (src/pages/[lang]/card/…, rendered by satori) need TTF, OTF or WOFF: satori does not read
WOFF2, which is what the site serves. From the same pinned google/fonts sources as build_fonts.py, this
script cuts two static instances at the weights and optical size a 1200 × 630 card uses, subset to the
CORE slice (Portuguese and English typography):

  card-literata-600.ttf   Literata, opsz 36 (display size), wght 600: titles
  card-atkinson-500.ttf   Atkinson Hyperlegible Next, wght 500: everything else

Usage:  python3 -m pip install fonttools brotli
        python3 -I scripts/fonts/build_card_fonts.py      # writes src/assets/fonts/card/*
Provenance (source URL and sha256 of inputs and outputs) goes to src/assets/fonts/card/card-fonts.lock.json.
"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_fonts", HERE / "build_fonts.py")
assert _spec is not None and _spec.loader is not None
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

OUT = base.ROOT / "src" / "assets" / "fonts" / "card"

# (output file, family, source path in google/fonts, static axis values)
CARD_FONTS = [
    ("card-literata-600.ttf", "Literata", "ofl/literata/Literata%5Bopsz,wght%5D.ttf", {"opsz": 36, "wght": 600}),
    (
        "card-atkinson-500.ttf",
        "Atkinson Hyperlegible Next",
        "ofl/atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext%5Bwght%5D.ttf",
        {"wght": 500},
    ),
]


def subset_ttf(instanced: pathlib.Path, target: pathlib.Path) -> bytes:
    font = TTFont(instanced)
    options = Options()
    options.layout_features = ["kern", "liga", "clig", "calt", "ccmp", "locl", "mark", "mkmk", "lnum", "pnum"]
    options.hinting = False
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep copyright and licence names (OFL)
    options.notdef_outline = True
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=base.CORE)
    subsetter.subset(font)
    font.save(target)
    return target.read_bytes()


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, family, src, axes in CARD_FONTS:
            raw = base.fetch(src)
            source_file = pathlib.Path(tmp) / "source.ttf"
            source_file.write_bytes(raw)
            instanced = pathlib.Path(tmp) / "instanced.ttf"
            instancer.instantiateVariableFont(TTFont(source_file), axes, updateFontNames=False).save(instanced)
            data = subset_ttf(instanced, OUT / name)
            entries.append({
                "file": name,
                "family": family,
                "axes": axes,
                "source": f"{base.RAW}/{src}",
                "sourceSha256": base.sha256(raw),
                "bytes": len(data),
                "sha256": base.sha256(data),
            })
            print(f"{name:28} {len(data) / 1024:7.1f} KiB")
    lock = {"source": "https://github.com/google/fonts", "commit": base.GOOGLE_FONTS_COMMIT, "fonts": entries}
    (OUT / "card-fonts.lock.json").write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
