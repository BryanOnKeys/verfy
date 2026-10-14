"""A minimal stdio MCP client, used by ``atls scan --cmd`` to fetch a live tool list."""

from __future__ import annotations

import json
import queue
import subprocess
import threading
from typing import Any

PROTOCOL = "2025-06-18"


class MCPError(RuntimeError):
    pass


def list_tools(command: list[str], timeout: float = 30.0, env: dict | None = None) -> dict:
    """Start ``command``, run the MCP handshake and return ``{"server": info, "tools": [...]}``."""
    try:
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, bufsize=0)
    except FileNotFoundError:
        raise MCPError(f"cannot start `{command[0]}`: command not found") from None
    q: "queue.Queue[Any]" = queue.Queue()

    def reader():
        assert proc.stdout
        for line in iter(proc.stdout.readline, b""):
            try:
                q.put(json.loads(line))
            except json.JSONDecodeError:
                continue
        q.put(None)

    threading.Thread(target=reader, daemon=True).start()

    def send(msg: dict) -> None:
        assert proc.stdin
        proc.stdin.write((json.dumps(msg) + "\n").encode())
        proc.stdin.flush()

    def wait_for(mid: int) -> dict:
        while True:
            try:
                m = q.get(timeout=timeout)
            except queue.Empty:
                raise MCPError(f"server did not answer within {timeout:g}s") from None
            if m is None:
                raise MCPError("server exited before answering")
            if isinstance(m, dict) and m.get("id") == mid and "method" not in m:
                if "error" in m:
                    raise MCPError(f"server error: {m['error'].get('message', m['error'])}")
                return m.get("result") or {}

    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "atls-scan", "version": "0.2.0"}}})
        init = wait_for(1)
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        tools: list = []
        cursor = None
        mid = 2
        while True:
            send({"jsonrpc": "2.0", "id": mid, "method": "tools/list", "params": {"cursor": cursor} if cursor else {}})
            res = wait_for(mid)
            tools.extend(res.get("tools") or [])
            cursor = res.get("nextCursor")
            mid += 1
            if not cursor or mid > 100:
                break
        return {"server": init.get("serverInfo", {}), "tools": tools}
    finally:
        try:
            proc.stdin.close()  # type: ignore[union-attr]
        except OSError:
            pass
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
