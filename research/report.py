"""Summarise research results: how tool definitions changed from release to release.

    python research/report.py results/ > report.md      (results/ holds tool_history.py output)
"""

from __future__ import annotations

import difflib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "verfy-cli" / "src"))
from verfy.scanner import scan  # noqa: E402


def bump(a: str, b: str) -> str:
    pa, pb = (a.split(".") + ["0", "0"])[:3], (b.split(".") + ["0", "0"])[:3]
    if int(pa[0]) >= 2000 or int(pb[0]) >= 2000:  # date versions such as 2026.10.19
        return "date"
    if pa[0] != pb[0]:
        return "major"
    if pa[1] != pb[1]:
        return "minor"
    return "patch"


def changes(prev: dict, cur: dict) -> dict:
    p = {t["name"]: t for t in prev["tools"]}
    c = {t["name"]: t for t in cur["tools"]}
    changed = []
    for name in sorted(set(p) & set(c)):
        if p[name]["pin"] != c[name]["pin"]:
            what = []
            if (p[name]["description"] or "") != (c[name]["description"] or ""):
                what.append("description")
            if p[name]["inputSchema"] != c[name]["inputSchema"]:
                what.append("inputSchema")
            changed.append({"tool": name, "what": what, "before": p[name]["description"] or "", "after": c[name]["description"] or ""})
    return {"from": prev["version"], "to": cur["version"], "bump": bump(prev["version"], cur["version"]),
            "added": sorted(set(c) - set(p)), "removed": sorted(set(p) - set(c)), "changed": changed}


def main(folder: str) -> None:
    servers = []
    for f in sorted(Path(folder).rglob("*.json")):
        d = json.loads(f.read_text("utf-8"))
        ok = [r for r in d["releases"] if r["status"] == "ok"]
        for r in ok:  # rescan with this checkout's scanner; the run's own result stays in "scan_at_collection"
            rep = scan(r["tools"], d["server"]["id"])
            r["scan_at_collection"] = r["scan"]
            r["scan"] = {"grade": rep["grade"], "score": rep["score"], "findings": [{"tool": t["name"], **f} for t in rep["tools"] for f in t["findings"]]}
            if not any("annotations" in t for t in r["tools"]):
                # older runs did not keep annotations, which VFY-SCAN-012 reads; that rule is unchanged, so keep its result
                r["scan"]["findings"] += [f for f in r["scan_at_collection"]["findings"] if f["rule"] == "VFY-SCAN-012"]
        steps = [changes(a, b) for a, b in zip(ok, ok[1:])]
        servers.append({"id": d["server"]["id"], "pkg": d["server"]["pkg"], "eco": d["server"]["eco"], "releases": d["releases"], "ok": ok, "steps": steps})

    started = [s for s in servers if s["ok"]]
    multi = [s for s in started if len(s["ok"]) >= 2]
    all_steps = [st for s in multi for st in s["steps"]]
    touching = [st for st in all_steps if st["changed"] or st["added"] or st["removed"]]
    desc_steps = [st for st in all_steps if any("description" in c["what"] for c in st["changed"])]
    desc_changes = [c for st in all_steps for c in st["changed"] if "description" in c["what"]]
    servers_desc = [s for s in multi if any(any("description" in c["what"] for c in st["changed"]) for st in s["steps"])]
    by_bump = Counter(st["bump"] for st in desc_steps)

    print("# MCP tool definitions across releases\n")
    print(f"- Servers tried: {len(servers)}; started and listed tools in at least one release: {len(started)}; in two or more: {len(multi)}.")
    print(f"- Release-to-release steps compared: {len(all_steps)}. Steps that added, removed or changed a tool definition: {len(touching)}.")
    print(f"- Steps that changed an existing tool's description: {len(desc_steps)} ({', '.join(f'{v} {k}' for k, v in by_bump.most_common())}), "
          f"{len(desc_changes)} descriptions in all, on {len(servers_desc)} of {len(multi)} servers.")
    print()
    print("| Server | Package | Releases started | Steps with a change | Description changes | Latest scan |")
    print("|---|---|---|---|---|---|")
    for s in sorted(servers, key=lambda s: s["id"]):
        n_change = sum(1 for st in s["steps"] if st["changed"] or st["added"] or st["removed"])
        n_desc = sum(1 for st in s["steps"] for c in st["changed"] if "description" in c["what"])
        last = s["ok"][-1] if s["ok"] else None
        grade = f"{last['scan']['grade']} ({last['scan']['score']})" if last else "did not start"
        print(f"| {s['id']} | `{s['pkg']}` | {len(s['ok'])}/{len(s['releases'])} | {n_change}/{len(s['steps'])} | {n_desc} | {grade} |")

    print("\n## Description changes\n")
    for s in sorted(multi, key=lambda s: s["id"]):
        for st in s["steps"]:
            for c in st["changed"]:
                if "description" not in c["what"]:
                    continue
                print(f"### {s['id']} {st['from']} → {st['to']} ({st['bump']}): `{c['tool']}`\n")
                diff = difflib.unified_diff(c["before"].splitlines(), c["after"].splitlines(), "before", "after", lineterm="", n=1)
                print("```diff\n" + "\n".join(list(diff)[2:])[:2500] + "\n```\n")

    print("## Scanner findings on the latest release (medium and above)\n")
    rules = Counter()
    for s in started:
        for f in s["ok"][-1]["scan"]["findings"]:
            if f["severity"] in ("medium", "high", "critical"):
                rules[(f["rule"], f["severity"])] += 1
                print(f"- {s['id']} `{f['tool']}`: {f['severity']} {f['rule']} {f['message']}")
    print("\nBy rule: " + ", ".join(f"{r} ({sev}) {n}" for (r, sev), n in rules.most_common()))

    def serious(sc: dict) -> int:
        return sum(1 for f in sc["findings"] if f["severity"] in ("high", "critical"))

    before = sum(serious(s["ok"][-1]["scan_at_collection"]) for s in started)
    after = sum(serious(s["ok"][-1]["scan"]) for s in started)
    crit_before = sum(1 for s in started for f in s["ok"][-1]["scan_at_collection"]["findings"] if f["severity"] == "critical")
    crit_after = sum(1 for s in started for f in s["ok"][-1]["scan"]["findings"] if f["severity"] == "critical")
    print(f"\nHigh and critical findings on the latest releases: {before} with the scanner the run used, {after} with this checkout's scanner. "
          f"Critical ones (the gateway hides those tools): {crit_before} before, {crit_after} now.")

    print("\n## Did not start\n")
    for s in servers:
        for r in s["releases"]:
            if r["status"] != "ok":
                print(f"- {s['id']} {r['version']}: {r.get('error', '')[:160]}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "results")
