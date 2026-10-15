"""Verfy Lock: pin every MCP tool definition and notice when it changes.

``verfy.lock`` is a JSON file::

    {
      "version": 1,
      "servers": {
        "filesystem": {
          "tools": {
            "read_file": {
              "digest": "sha256:...",          # sha256 of canonical {name, description, inputSchema}
              "definition": {...},             # the exact definition that was approved, for diffs
              "approved_at": "2026-10-11T09:00:00.000Z",
              "approved_by": "first-use" | "user" | "team"
            }
          }
        }
      }
    }

The digest is recomputed from ``definition`` on every load, so a hand-edited
lock whose digest and definition disagree is rejected instead of trusted.
The file is written deterministically (sorted keys, two-space indent), so
locking the same tools twice gives the same bytes.
"""

from __future__ import annotations

import difflib
import json
import os
from pathlib import Path
from typing import Any, Iterable

from .canonical import digest
from .fileio import FileLock, atomic_write
from .receipts import now_iso
from .scanner import tool_pin

LOCK_VERSION = 1
APPROVERS = ("first-use", "user", "team")


class LockError(ValueError):
    """verfy.lock is missing required fields or was tampered with."""


def definition(tool: dict) -> dict:
    """The part of a tool definition that Verfy pins."""
    return {
        "name": tool.get("name", ""),
        "description": tool.get("description", "") or "",
        "inputSchema": tool.get("inputSchema", None),
    }


def empty_lock() -> dict:
    return {"version": LOCK_VERSION, "servers": {}}


def validate_lock(data: Any) -> dict:
    if not isinstance(data, dict) or data.get("version") != LOCK_VERSION or not isinstance(data.get("servers"), dict):
        raise LockError("verfy.lock must be an object with version 1 and a `servers` object")
    for server, entry in data["servers"].items():
        if not isinstance(entry, dict) or not isinstance(entry.get("tools"), dict):
            raise LockError(f"verfy.lock: server `{server}` has no `tools` object")
        for name, t in entry["tools"].items():
            if not isinstance(t, dict) or not isinstance(t.get("digest"), str) or not isinstance(t.get("definition"), dict):
                raise LockError(f"verfy.lock: `{server}/{name}` needs `digest` and `definition`")
            if t["definition"].get("name") != name:
                raise LockError(f"verfy.lock: `{server}/{name}` definition has a different name")
            if tool_pin(t["definition"]) != t["digest"]:
                raise LockError(f"verfy.lock: digest of `{server}/{name}` does not match its definition (edited by hand?)")
            if t.get("approved_by") not in APPROVERS:
                raise LockError(f"verfy.lock: `{server}/{name}` has an unknown approved_by value")
    return data


def load_lock(path: str | os.PathLike) -> dict:
    p = Path(path)
    if not p.exists():
        return empty_lock()
    try:
        data = json.loads(p.read_text("utf-8"))
    except json.JSONDecodeError as e:
        raise LockError(f"verfy.lock is not valid JSON: {e}") from None
    return validate_lock(data)


def dumps_lock(lock: dict) -> str:
    return json.dumps(validate_lock(lock), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def save_lock(path: str | os.PathLike, lock: dict) -> None:
    atomic_write(path, dumps_lock(lock))


def server_pins(lock: dict, server: str) -> dict[str, str] | None:
    """``{tool: digest}`` for a server, or None if the server was never locked."""
    entry = lock["servers"].get(server)
    if entry is None:
        return None
    return {name: t["digest"] for name, t in entry["tools"].items()}


def pin(lock: dict, server: str, tool: dict, by: str, at: str | None = None) -> dict:
    if by not in APPROVERS:
        raise ValueError(f"approved_by must be one of {APPROVERS}")
    d = definition(tool)
    entry = lock["servers"].setdefault(server, {"tools": {}})
    entry["tools"][d["name"]] = {"digest": tool_pin(d), "definition": d, "approved_at": at or now_iso(), "approved_by": by}
    return entry["tools"][d["name"]]


def update(path: str | os.PathLike, fn) -> dict:
    """Read, change and write verfy.lock under a file lock. ``fn(lock)`` mutates it."""
    with FileLock(path):
        lock = load_lock(path)
        fn(lock)
        save_lock(path, lock)
        return lock


# ---------------------------------------------------------------- comparing

def compare(lock: dict, server: str, tools: Iterable[dict]) -> list[dict]:
    """Status of every current and locked tool: ok, drift, new or removed."""
    locked = (lock["servers"].get(server) or {}).get("tools", {})
    out = []
    seen = set()
    for t in tools:
        d = definition(t)
        name = d["name"]
        seen.add(name)
        cur = tool_pin(d)
        if name not in locked:
            out.append({"tool": name, "status": "new", "locked": None, "current": cur})
        elif locked[name]["digest"] == cur:
            out.append({"tool": name, "status": "ok", "locked": cur, "current": cur})
        else:
            out.append({"tool": name, "status": "drift", "locked": locked[name]["digest"], "current": cur})
    for name in sorted(set(locked) - seen):
        out.append({"tool": name, "status": "removed", "locked": locked[name]["digest"], "current": None})
    return out


def _pretty(d: dict | None) -> list[str]:
    if d is None:
        return []
    return json.dumps(d, indent=2, sort_keys=True, ensure_ascii=False).splitlines(keepends=True)


def diff(old: dict | None, new: dict | None, label: str = "") -> str:
    """A unified diff of two tool definitions, with invisible characters spelled out."""
    def show(lines: list[str]) -> list[str]:
        out = []
        for ln in lines:
            out.append("".join(f"<U+{ord(ch):04X}>" if (ord(ch) < 32 and ch != "\n") or 0x200B <= ord(ch) <= 0x200F or 0x2060 <= ord(ch) <= 0x206F or 0xE0000 <= ord(ch) <= 0xE007F or ord(ch) == 0xFEFF else ch for ch in ln))
        return out
    return "".join(difflib.unified_diff(show(_pretty(old)), show(_pretty(new)), fromfile=f"locked/{label}", tofile=f"current/{label}"))


def seen_path(home: Path, server: str) -> Path:
    return home / "seen" / f"{safe_name(server)}.json"


def safe_name(server: str) -> str:
    """A file name for a server name, so `../x` cannot escape the folder."""
    keep = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in server).strip(".")
    return keep or "server"


def save_seen(home: Path, server: str, tools: list[dict]) -> None:
    """Remember the definitions a server last served, so `verfy lock approve` can diff them."""
    defs = {definition(t)["name"]: definition(t) for t in tools if isinstance(t, dict)}
    atomic_write(seen_path(home, server), json.dumps({"server": server, "seen_at": now_iso(), "tools": defs}, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def load_seen(home: Path, server: str) -> dict[str, dict]:
    p = seen_path(home, server)
    if not p.exists():
        return {}
    data = json.loads(p.read_text("utf-8"))
    return data.get("tools", {}) if isinstance(data, dict) else {}


def lock_digest(lock: dict) -> str:
    return digest(lock)
