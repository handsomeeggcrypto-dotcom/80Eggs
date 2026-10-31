#!/usr/bin/env python3
"""Builds the browse lists for Moekadex and Dream Things from their data.txt.

  python3 tools/gen_dex_index.py

Writes <dex>/index/: rarest.txt and moes.txt are 5-byte "nnnn\\n" records, values.txt is
fixed-size "value|pct|count|first" records, and types.txt lists "type|first|count", with
the size of a values.txt record on its first line. The app seeks instead of loading them.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "root" / "YOLK"


def build(dex):
    src = ROOT / dex / "data.txt"
    if not src.exists():
        print(f"{dex}: no data.txt, skipped")
        return
    out = ROOT / dex / "index"
    out.mkdir(exist_ok=True)
    rank, traits = {}, {}
    for n, line in enumerate(src.read_text(encoding="latin-1").splitlines(), 1):
        fields = line.rstrip().split("|")
        rank[n] = int(fields[0])
        for t in fields[2:]:
            typ, value, pct = t.split("~")
            traits.setdefault(typ, {}).setdefault(value, (pct, []))[1].append(n)
    (out / "rarest.txt").write_text("".join(f"{n:04d}\n" for n in sorted(rank, key=rank.get)))
    moes, values, types = [], [], []
    for typ in sorted(traits):
        first = len(values)
        for value, (pct, ns) in sorted(traits[typ].items(), key=lambda kv: (len(kv[1][1]), kv[0])):
            ns.sort(key=rank.get)
            values.append(f"{value}|{pct}|{len(ns)}|{len(moes)}")
            moes += ns
        types.append(f"{typ}|{first}|{len(values) - first}")
    width = max(map(len, values)) + 1
    (out / "moes.txt").write_text("".join(f"{n:04d}\n" for n in moes))
    with open(out / "values.txt", "w", encoding="latin-1", newline="") as f:
        f.write("".join(v.ljust(width - 1) + "\n" for v in values))
    (out / "types.txt").write_text("\n".join([str(width)] + types) + "\n", encoding="latin-1")
    print(f"{dex}: {len(types)} trait types, {len(values)} values")


if __name__ == "__main__":
    build("moekadex")
    build("dreams")
