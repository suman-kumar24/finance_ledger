#!/usr/bin/env python3
"""Developer helper: adds or updates strings in src/i18n/en.ts and hi.ts.

Reads lines of `key<TAB>English<TAB>Hindi` from a file (or stdin) so both
languages are always edited together.

    python3 scripts/i18n-add.py new-strings.tsv
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "src" / "i18n"
ENTRY = re.compile(r"^  '([^']+)': (.*),$")


def load(path):
    entries = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            m = ENTRY.match(line)
            if m:
                entries[m.group(1)] = json.loads(m.group(2))
    return entries


def dump(entries):
    return "".join(
        f"  '{key}': {json.dumps(value, ensure_ascii=False)},\n" for key, value in entries.items()
    )


def main():
    source = open(sys.argv[1], encoding="utf-8") if len(sys.argv) > 1 else sys.stdin
    en = load(ROOT / "en.ts")
    hi = load(ROOT / "hi.ts")
    for raw in source:
        line = raw.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            raise SystemExit(f"Expected key<TAB>en<TAB>hi, got: {line!r}")
        key, english, hindi = (p.strip() for p in parts)
        en[key] = english
        hi[key] = hindi
    (ROOT / "en.ts").write_text(
        "/** English strings. Edit with scripts/i18n-add.py so Hindi stays in step. */\n"
        "export const en = {\n" + dump(en) + "};\n\nexport type StringKey = keyof typeof en;\n",
        encoding="utf-8",
    )
    (ROOT / "hi.ts").write_text(
        "/** Hindi strings. The type guarantees every English key has a translation. */\n"
        "import type { StringKey } from './en';\n\n"
        "export const hi: Record<StringKey, string> = {\n" + dump(hi) + "};\n",
        encoding="utf-8",
    )
    print(f"{len(en)} strings")


if __name__ == "__main__":
    main()
