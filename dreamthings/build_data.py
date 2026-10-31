#!/usr/bin/env python3
"""Builds data.js for the Dream Things page from the Yumemono metadata cache.

  python3 dreamthings/build_data.py

Reads shell/tools/cache/yumemono/json (filled by shell/tools/gen_dreams.py). Rarity is
worked out the same way as on SHELL, so ranks match.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "shell" / "tools" / "cache" / "yumemono" / "json"
N = 5200

metas = {n: json.loads((CACHE / f"{n}.json").read_text()) for n in range(1, N + 1)}
traits = {}
for n, m in metas.items():
    # tokens with no traits are the animated ones; give them a trait so they count
    attrs = [(a["trait_type"], str(a["value"])) for a in m.get("attributes", [])]
    traits[n] = dict(attrs or [("Type", "Animated")])
types = sorted({t for d in traits.values() for t in d})
counts = {t: {} for t in types}
for d in traits.values():
    for t in types:
        counts[t][d.get(t)] = counts[t].get(d.get(t), 0) + 1
score = {n: sum(N / counts[t][d.get(t)] for t in types) for n, d in traits.items()}
rank = {n: i + 1 for i, n in enumerate(sorted(score, key=lambda n: -score[n]))}

values = [sorted((v for v in counts[t] if v is not None), key=lambda v: (counts[t][v], v)) for t in types]
index = [{v: i for i, v in enumerate(vs)} for vs in values]
tokens = []
for n in range(1, N + 1):
    flat = []
    for t, v in traits[n].items():
        i = types.index(t)
        flat += [i, index[i][v]]
    tokens.append(flat)
data = {
    "types": types,
    "values": values,
    "counts": [[counts[t][v] for v in vs] for t, vs in zip(types, values)],
    "tokens": tokens,
    "rank": [rank[n] for n in range(1, N + 1)],
    "gif": [n for n, m in metas.items() if m["image"].endswith(".gif")],
}
out = "window.DREAMS=" + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n"
(HERE / "data.js").write_text(out, encoding="utf-8")
print(f"data.js: {len(out) // 1024} KB, {len(types)} trait types, {sum(map(len, values))} values")
