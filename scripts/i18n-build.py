#!/usr/bin/env python3
"""Builds src/i18n/en.ts and hi.ts from src/i18n/strings.tsv.

strings.tsv is the single source of truth: one line per string,
`key<TAB>English<TAB>Hindi`. Edit it, then run:

    npm run i18n
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "src" / "i18n"


def main():
    en, hi = {}, {}
    for number, raw in enumerate((ROOT / "strings.tsv").read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.startswith("#"):
            continue
        parts = raw.split("\t")
        if len(parts) != 3:
            raise SystemExit(f"strings.tsv line {number}: expected key<TAB>en<TAB>hi")
        key, english, hindi = (p.strip() for p in parts)
        if key in en:
            raise SystemExit(f"strings.tsv line {number}: duplicate key {key}")
        en[key], hi[key] = english, hindi

    def body(table):
        return "".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in table.items())

    note = "// Generated from strings.tsv by scripts/i18n-build.py. Do not edit by hand.\n"
    (ROOT / "en.ts").write_text(
        note + "export const en = {\n" + body(en) + "};\n\nexport type StringKey = keyof typeof en;\n",
        encoding="utf-8",
    )
    (ROOT / "hi.ts").write_text(
        note + "import type { StringKey } from './en';\n\n"
        "export const hi: Record<StringKey, string> = {\n" + body(hi) + "};\n",
        encoding="utf-8",
    )
    print(f"{len(en)} strings")


if __name__ == "__main__":
    main()
