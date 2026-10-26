"""Import findings from other MCP scanners, so Verfy can enforce them.

Scanners find problems; Verfy enforces and records. ``verfy scan import FILE`` reads the JSON
output of:

* Snyk Agent Scan (``snyk-agent-scan --json``): the v0.6+ ``scan_path_responses`` shape and the
  v0.5 path-keyed shape;
* Cisco MCP Scanner (``mcp-scanner --format raw``): the envelope with ``scan_results`` or a bare list.

Each finding becomes ``{source, server, tool, severity, rule, message}``. With ``--save`` the
findings are kept in ``~/.verfy/imported/<source>.json``, and the Verfy gateway hides tools that an
imported finding rates high (matched by server and tool name) and denies calls to them.

The parsers follow each project's documented JSON format. The severity mapping for scores and
issue codes is Verfy's own, stated in ``SNYK_SCORE`` and ``severity_*`` below; the other projects do
not define these thresholds.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .fileio import atomic_write
from .receipts import now_iso

VERSION = "verfy.import/1"
SOURCES = ("snyk-agent-scan", "cisco-mcp-scanner")
SEVERITIES = ("high", "medium", "low")
# Snyk risk_indexes carry a 0-1000 score; Verfy reads 700+ as high, 400+ as medium, anything else as low
SNYK_SCORE = ((700, "high"), (400, "medium"), (1, "low"))


class ImportFormatError(ValueError):
    """The file is not output Verfy knows how to read."""


def detect(data: Any) -> str:
    if isinstance(data, dict) and isinstance(data.get("scan_path_responses"), list):
        return "snyk-agent-scan"
    if isinstance(data, dict) and isinstance(data.get("scan_results"), list):
        return "cisco-mcp-scanner"
    if isinstance(data, list) and data and all(isinstance(x, dict) and ("tool_name" in x or "is_safe" in x) for x in data):
        return "cisco-mcp-scanner"
    if isinstance(data, dict) and data and all(isinstance(v, dict) and ("issues" in v or "servers" in v) for v in data.values()):
        return "snyk-agent-scan"
    raise ImportFormatError("not Snyk Agent Scan (--json) or Cisco MCP Scanner (--format raw) output")


def _f(source: str, server: str, tool: str | None, severity: str, rule: str, message: str) -> dict:
    return {"source": source, "server": server, "tool": tool, "severity": severity, "rule": rule, "message": message[:500]}


def severity_snyk_score(score: Any) -> str | None:
    try:
        s = float(score)
    except (TypeError, ValueError):
        return None
    for floor, sev in SNYK_SCORE:
        if s >= floor:
            return sev
    return None


def severity_cisco(value: Any) -> str | None:
    return {"HIGH": "high", "CRITICAL": "high", "MEDIUM": "medium", "LOW": "low"}.get(str(value or "").upper())


def parse_snyk(data: Any) -> list[dict]:
    out: list[dict] = []
    if isinstance(data, dict) and isinstance(data.get("scan_path_responses"), list):  # v0.6+
        for resp in data["scan_path_responses"]:
            for srv in (resp or {}).get("server_risks") or []:
                name = str(srv.get("name") or "")
                entities = srv.get("entities") or []
                for risk, info in (srv.get("risk_indexes") or {}).items():
                    sev = severity_snyk_score((info or {}).get("score"))
                    if not sev:
                        continue
                    idx = (info or {}).get("affected_tools") or [None]
                    for i in idx:
                        tool = entities[i].get("name") if isinstance(i, int) and 0 <= i < len(entities) and isinstance(entities[i], dict) else None
                        out.append(_f("snyk-agent-scan", name, tool, sev, f"SNYK:{risk}", str((info or {}).get("evidence") or risk)))
        return out
    if isinstance(data, dict):  # v0.5: keyed by scan path
        for result in data.values():
            if not isinstance(result, dict):
                continue
            servers = result.get("servers") or []
            for issue in result.get("issues") or []:
                code = str(issue.get("code") or "")
                sev = "high" if code.startswith("E") else "medium" if code.startswith("W") else None
                if not sev:
                    continue
                ref = issue.get("reference") or [None, None]
                si, ti = (ref + [None, None])[:2] if isinstance(ref, list) else (None, None)
                srv = servers[si] if isinstance(si, int) and 0 <= si < len(servers) and isinstance(servers[si], dict) else {}
                tools = ((srv.get("signature") or {}).get("tools") or []) if isinstance(srv.get("signature"), dict) else []
                tool = tools[ti].get("name") if isinstance(ti, int) and 0 <= ti < len(tools) and isinstance(tools[ti], dict) else None
                out.append(_f("snyk-agent-scan", str(srv.get("name") or ""), tool, sev, f"SNYK:{code}", str(issue.get("message") or code)))
        return out
    raise ImportFormatError("not Snyk Agent Scan output")


def parse_cisco(data: Any) -> list[dict]:
    results = data.get("scan_results") if isinstance(data, dict) else data
    if not isinstance(results, list):
        raise ImportFormatError("not Cisco MCP Scanner output")
    server_url = data.get("server_url") if isinstance(data, dict) else None
    out: list[dict] = []
    for r in results:
        if not isinstance(r, dict) or r.get("is_safe") is True:
            continue
        server = str(r.get("server_name") or server_url or "")
        tool = r.get("tool_name") or r.get("prompt_name") or r.get("resource_name")
        for analyzer, info in (r.get("findings") or {}).items():
            if not isinstance(info, dict):
                continue
            sev = severity_cisco(info.get("severity"))
            if not sev:
                continue
            names = ", ".join(str(x) for x in info.get("threat_names") or []) or analyzer
            out.append(_f("cisco-mcp-scanner", server, str(tool) if tool else None, sev, f"CISCO:{analyzer}", f"{names}: {info.get('threat_summary') or ''}".strip(": ")))
    return out


def parse(data: Any, fmt: str = "auto") -> tuple[str, list[dict]]:
    source = detect(data) if fmt == "auto" else {"snyk": "snyk-agent-scan", "cisco": "cisco-mcp-scanner"}[fmt]
    findings = parse_snyk(data) if source == "snyk-agent-scan" else parse_cisco(data)
    findings.sort(key=lambda f: (SEVERITIES.index(f["severity"]), f["server"], f["tool"] or "", f["rule"]))
    return source, findings


def report(path: str | Path, fmt: str = "auto") -> dict:
    raw = Path(path).read_bytes()
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ImportFormatError(f"not JSON: {e}") from None
    source, findings = parse(data, fmt)
    summary = {s: sum(1 for f in findings if f["severity"] == s) for s in SEVERITIES}
    return {"v": VERSION, "source": source, "file": str(path), "file_sha256": "sha256:" + hashlib.sha256(raw).hexdigest(),
            "imported_at": now_iso(), "summary": summary, "findings": findings}


# ---------------------------------------------------------------- saved imports, read by the gateway

def imports_dir(home: Path) -> Path:
    return home / "imported"


def save(home: Path, rep: dict) -> Path:
    path = imports_dir(home) / f"{rep['source']}.json"
    atomic_write(path, json.dumps(rep, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    return path


def blocked_tools(home: Path, server: str) -> dict[str, dict]:
    """``{tool: finding}`` for tools of ``server`` that a saved import rates high."""
    out: dict[str, dict] = {}
    d = imports_dir(home)
    if not d.is_dir():
        return out
    for p in sorted(d.glob("*.json")):
        try:
            rep = json.loads(p.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(rep, dict) or rep.get("v") != VERSION:
            continue
        for f in rep.get("findings") or []:
            if isinstance(f, dict) and f.get("severity") == "high" and f.get("server") == server and f.get("tool"):
                out.setdefault(str(f["tool"]), f)
    return out
