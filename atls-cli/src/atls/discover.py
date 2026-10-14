"""Atls Scan, config side: find MCP servers in Claude Code / Cursor / Claude
Desktop configs and check how each server is launched.

This is a *static* check of the configuration only. It never starts a
server. Looking at the tools a server serves needs ``atls scan --live``,
which starts each stdio server after you asked for it explicitly.

Rules (all deterministic):

ATL-CFG-001  medium  package runner (npx/uvx/bunx/pipx/pnpm dlx) without a pinned version
ATL-CFG-002  high    remote server over plain http:// (not localhost)
ATL-CFG-003  high    a secret written literally into args, env, headers or the URL
ATL-CFG-004  critical  launch command pipes a download into a shell (curl | sh)
ATL-CFG-005  high    container started with --privileged, host network or the home/root folder mounted
ATL-CFG-006  low     server is not behind the Atls gateway, so its calls are not pre-checked or receipted
ATL-CFG-007  medium  remote server with no Authorization header or OAuth configured
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from ._util import SEVERITY_RANK, scan_secrets

VERSION = "atls.config-scan/1"
RUNNERS = {"npx": "npm", "bunx": "npm", "uvx": "pypi", "pipx": "pypi"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


def candidate_paths(home: Path, cwd: Path) -> list[tuple[str, Path]]:
    """Known MCP config locations, most specific first."""
    appdata = Path(os.environ.get("APPDATA") or home / "AppData" / "Roaming")
    return [
        ("claude-code project", cwd / ".mcp.json"),
        ("cursor project", cwd / ".cursor" / "mcp.json"),
        ("claude-code user", home / ".claude.json"),
        ("cursor user", home / ".cursor" / "mcp.json"),
        ("claude-desktop", home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"),
        ("claude-desktop", appdata / "Claude" / "claude_desktop_config.json"),
        ("claude-desktop", home / ".config" / "Claude" / "claude_desktop_config.json"),
    ]


def servers_in(data: Any, cwd: Path | None = None) -> dict[str, dict]:
    """MCP servers in a config object. ~/.claude.json also keeps per-project servers."""
    out: dict[str, dict] = {}
    if not isinstance(data, dict):
        return out
    for key in ("mcpServers", "servers"):
        if isinstance(data.get(key), dict):
            out.update({k: v for k, v in data[key].items() if isinstance(v, dict)})
    projects = data.get("projects")
    if isinstance(projects, dict) and cwd is not None:
        for path, proj in projects.items():
            if isinstance(proj, dict) and isinstance(proj.get("mcpServers"), dict) and Path(path).resolve() == cwd.resolve():
                out.update({k: v for k, v in proj["mcpServers"].items() if isinstance(v, dict)})
    return out


def discover(home: Path | None = None, cwd: Path | None = None, extra: Iterable[Path] = ()) -> list[dict]:
    """Read the given config files plus every known location that exists."""
    home = home or Path.home()
    cwd = cwd or Path.cwd()
    return read_configs([("given", Path(p)) for p in extra] + candidate_paths(home, cwd), cwd)


def read_configs(paths: Iterable[tuple[str, Path]], cwd: Path | None = None) -> list[dict]:
    cwd = cwd or Path.cwd()
    found = []
    seen: set[Path] = set()
    for source, p in paths:
        try:
            rp = p.resolve()
        except OSError:
            continue
        if rp in seen or not p.is_file():
            continue
        seen.add(rp)
        try:
            data = json.loads(p.read_text("utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            found.append({"source": source, "path": str(p), "error": f"cannot read: {e}", "servers": {}})
            continue
        found.append({"source": source, "path": str(p), "servers": servers_in(data, cwd)})
    return found


def _f(rule: str, severity: str, message: str, where: str) -> dict:
    return {"rule": rule, "severity": severity, "message": message, "where": where}


def _pinned(spec: str, ecosystem: str) -> bool:
    if ecosystem == "npm":
        name = spec[1:] if spec.startswith("@") else spec
        return "@" in name and not name.endswith("@latest")
    return bool(re.search(r"(==|@)\d", spec))


def _package_arg(args: list[str]) -> str | None:
    skip_next = {"--package", "-p", "--from", "--with", "--python"}
    i = 0
    while i < len(args):
        a = args[i]
        if a in skip_next:
            return args[i + 1] if i + 1 < len(args) else None
        if a.startswith("-"):
            i += 1
            continue
        return a
    return None


def check_server(name: str, spec: dict) -> list[dict]:
    out: list[dict] = []
    command = str(spec.get("command") or "")
    args = [str(a) for a in spec.get("args") or [] if isinstance(a, (str, int, float))]
    base = Path(command).name.lower().removesuffix(".exe").removesuffix(".cmd")
    gated = base == "atls" or (len(args) > 1 and args[0] == "-m" and args[1] == "atls")
    if gated and "--" in args:
        inner = args[args.index("--") + 1:]
        command, args = (inner[0], inner[1:]) if inner else ("", [])
        base = Path(command).name.lower().removesuffix(".exe").removesuffix(".cmd")
    runner_args = args
    if base in ("pnpm", "yarn") and args[:1] == ["dlx"]:
        base, runner_args = "npx", args[1:]
    if base == "uv" and args[:2] == ["tool", "run"]:
        base, runner_args = "uvx", args[2:]
    if base in RUNNERS:
        pkg = _package_arg(runner_args)
        if pkg and not pkg.startswith((".", "/", "~")) and not _pinned(pkg, RUNNERS[base]):
            out.append(_f("ATL-CFG-001", "medium", f"`{base} {pkg}` downloads whatever version is newest at launch; pin a version.", "args"))
    joined = " ".join([command, *args])
    if re.search(r"\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b", joined) or re.search(r"\b(?:iex|Invoke-Expression)\b", joined, re.I):
        out.append(_f("ATL-CFG-004", "critical", "Launch command downloads a script and runs it in a shell.", "command"))
    if base in ("docker", "podman"):
        if any(a == "--privileged" or a.startswith("--network=host") or a == "host" and i > 0 and args[i - 1] in ("--network", "--net") for i, a in enumerate(args)):
            out.append(_f("ATL-CFG-005", "high", "Container runs privileged or on the host network.", "args"))
        for i, a in enumerate(args):
            if a in ("-v", "--volume", "--mount") and i + 1 < len(args):
                src = args[i + 1].split(":")[0]
                if src in ("/", "~", "$HOME", "${HOME}", "C") or src.rstrip("/\\") in ("/home", "/Users", "/root"):
                    out.append(_f("ATL-CFG-005", "high", f"Container mounts `{src}`, giving it the whole disk or home folder.", "args"))
    url = spec.get("url") or spec.get("serverUrl")
    if isinstance(url, str) and url:
        u = urlparse(url)
        if u.scheme == "http" and (u.hostname or "") not in LOCAL_HOSTS:
            out.append(_f("ATL-CFG-002", "high", f"Talks to {u.hostname} over plain http, so anyone on the network can read or change tool calls.", "url"))
        headers = spec.get("headers") if isinstance(spec.get("headers"), dict) else {}
        if (u.hostname or "") not in LOCAL_HOSTS and not any(k.lower() == "authorization" for k in headers) and not spec.get("oauth") and not spec.get("auth"):
            out.append(_f("ATL-CFG-007", "medium", "Remote server has no Authorization header or OAuth configured.", "headers"))
    texts: list[tuple[str, str]] = [("args", a) for a in args]
    for key in ("env", "headers"):
        if isinstance(spec.get(key), dict):
            texts += [(f"{key}.{k}", str(v)) for k, v in spec[key].items() if not (isinstance(v, str) and v.startswith("${") and v.endswith("}"))]
    if isinstance(url, str):
        texts.append(("url", url))
    for where, text in texts:
        for s in scan_secrets(text):
            out.append(_f("ATL-CFG-003", "high", f"A {s['label']} is written into the config ({where}); load it from the environment instead.", where))
            break
    if not gated and (command or url):
        out.append(_f("ATL-CFG-006", "low", "Not behind the Atls gateway: its tool calls are not pre-checked or receipted (`atls wrap`).", "command"))
    seen = set()
    uniq = []
    for f in out:
        k = (f["rule"], f["where"], f["message"])
        if k not in seen:
            seen.add(k)
            uniq.append(f)
    uniq.sort(key=lambda f: -SEVERITY_RANK[f["severity"]])
    return uniq


def scan_configs(found: list[dict]) -> dict:
    servers = []
    summary = {s: 0 for s in ("critical", "high", "medium", "low")}
    for cfg in found:
        for name, spec in sorted(cfg["servers"].items()):
            findings = check_server(name, spec)
            for f in findings:
                summary[f["severity"]] = summary.get(f["severity"], 0) + 1
            servers.append({
                "server": name, "config": cfg["path"], "source": cfg["source"],
                "transport": "http" if spec.get("url") or spec.get("serverUrl") else "stdio",
                "findings": findings,
            })
    return {
        "v": VERSION, "mode": "static",
        "note": "Static check of how servers are launched. Tool definitions were not fetched; use --live for that.",
        "configs": [{"path": c["path"], "source": c["source"], **({"error": c["error"]} if c.get("error") else {})} for c in found],
        "servers": servers, "summary": summary,
    }
