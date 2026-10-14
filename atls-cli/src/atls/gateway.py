"""The Atls gateway: a stdio MCP proxy that sits between a client and a server.

    client (Claude, Cursor, ...)  <->  atls proxy  <->  real MCP server

* ``tools/list`` answers are scanned and compared with ``atls.lock``. Tools
  with a critical finding, or whose definition drifted from the locked digest,
  are hidden from the agent. The first time a server is seen its tools are
  locked (trust on first use); a tool added later needs approval.
* ``tools/call`` requests are pre-checked. Denied calls never reach the server;
  ``ask`` calls are blocked, allowed or sent to the user for approval
  (MCP elicitation) depending on ``on_ask`` in the policy.
* Every call, allowed or blocked, gets a signed receipt in the ledger.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, IO

from .canonical import digest
from .lock import LockError, load_lock, pin, safe_name, save_seen, server_pins, update
from .policy import policy_digest
from .precheck import check, payment_amount
from .receipts import Key, Ledger, read_ledger
from .scanner import scan, unsafe_tools


def atls_home() -> Path:
    return Path(os.environ.get("ATLS_HOME") or Path.home() / ".atls")


def spent_today(receipts: list[dict], server: str | None = None) -> float:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total = 0.0
    for r in receipts:
        a = r.get("action", {})
        if not str(r.get("issued_at", "")).startswith(today) or a.get("kind") != "payment":
            continue
        if r.get("outcome", {}).get("status") != "ok" or not isinstance(a.get("args"), dict):
            continue
        amt = payment_amount(a["args"])
        total += amt or 0
    return total


class Gateway:
    def __init__(self, command: list[str], *, server: str, policy: dict, key: Key, ledger_path: Path,
                 lock_path: Path, home: Path | None = None, scans_dir: Path | None = None, session: str | None = None,
                 stdin: IO[bytes] | None = None, stdout: IO[bytes] | None = None,
                 log: Callable[[str], None] | None = None):
        self.command = command
        self.server = server
        self.policy = policy
        self.policy_sha = policy_digest(policy)
        self.ledger = Ledger(ledger_path, key)
        self.lock_path = lock_path
        self.home = home or lock_path.parent
        self.scans_dir = scans_dir
        self.session = session or "ses_" + uuid.uuid4().hex[:12]
        self.inp = stdin or sys.stdin.buffer
        self.out = stdout or sys.stdout.buffer
        self.log = log or (lambda m: print("[atls] " + m, file=sys.stderr, flush=True))
        self.lock = threading.Lock()
        self.ledger_lock = threading.Lock()
        self.pending: dict[str, tuple] = {}
        self.elicits: dict[str, tuple] = {}
        self.tool_meta: dict[str, dict] = {}
        self.client_caps: dict = {}
        self.spent = spent_today(read_ledger(ledger_path))
        self.child: subprocess.Popen | None = None
        self._n = 0

    # ------------------------------------------------------------ plumbing
    def _key(self, msg_id: Any) -> str:
        return json.dumps(msg_id)

    def to_client(self, msg: dict) -> None:
        data = (json.dumps(msg, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        with self.lock:
            self.out.write(data)
            self.out.flush()

    def to_server(self, msg: dict | bytes) -> None:
        data = msg if isinstance(msg, bytes) else (json.dumps(msg, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        assert self.child and self.child.stdin
        try:
            self.child.stdin.write(data)
            self.child.stdin.flush()
        except (BrokenPipeError, OSError):
            self.log("server stdin closed")

    def run(self) -> int:
        try:
            self.child = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
        except FileNotFoundError:
            self.log(f"cannot start `{self.command[0]}`: command not found")
            return 127
        self.log(f"gateway up for `{self.server}` (session {self.session}, key {self.ledger.key.kid})")
        t = threading.Thread(target=self._pump_server, daemon=True)
        t.start()
        try:
            for line in iter(self.inp.readline, b""):
                if line.strip():
                    self.from_client(line)
        except KeyboardInterrupt:
            pass
        finally:
            try:
                self.child.stdin.close()
            except OSError:
                pass
        try:
            code = self.child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.child.terminate()
            code = self.child.wait()
        t.join(timeout=2)
        if self.child.stdout:
            self.child.stdout.close()
        return code

    def _pump_server(self) -> None:
        assert self.child and self.child.stdout
        for line in iter(self.child.stdout.readline, b""):
            if line.strip():
                try:
                    self.from_server(line)
                except Exception as e:  # never let one bad message kill the gateway
                    self.log(f"error handling server message: {e!r}")
                    with self.lock:
                        self.out.write(line if line.endswith(b"\n") else line + b"\n")
                        self.out.flush()

    # ------------------------------------------------------------ client side
    def from_client(self, line: bytes) -> None:
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            self.to_server(line)
            return
        if isinstance(msg, list):
            for m in msg:
                if isinstance(m, dict):
                    self._client_msg(m)
            return
        if isinstance(msg, dict):
            self._client_msg(msg)
        else:
            self.to_server(line)

    def _client_msg(self, msg: dict) -> None:
        method = msg.get("method")
        if method is None and "id" in msg and self._key(msg["id"]) in self.elicits:
            self._elicit_answer(msg)
            return
        if method == "initialize":
            self.client_caps = (msg.get("params") or {}).get("capabilities") or {}
        if method == "tools/list" and "id" in msg:
            self.pending[self._key(msg["id"])] = ("list",)
        if method == "tools/call" and "id" in msg:
            self._call(msg)
            return
        self.to_server(msg)

    def _call(self, msg: dict) -> None:
        params = msg.get("params") or {}
        name = str(params.get("name", ""))
        args = params.get("arguments") or {}
        action = {"server": self.server, "tool": name, "arguments": args}
        meta = self.tool_meta.get(name)
        decision = check(action, self.policy, {"spent_today": self.spent, "tool": meta, "known_tools": list(self.tool_meta)})
        v = decision["verdict"]
        if v == "allow":
            self._forward(msg, action, decision)
        elif v == "deny":
            self._block(msg, action, decision, "Atls blocked this call.")
        else:
            mode = self.policy.get("on_ask", "deny")
            if mode == "allow":
                decision["approved_by"] = "policy"
                self._forward(msg, action, decision)
            elif mode == "elicit" and "elicitation" in self.client_caps:
                self._n += 1
                eid = f"atls-elicit-{self._n}"
                self.elicits[self._key(eid)] = (msg, action, decision)
                reasons = "; ".join(f"[{f['rule']}] {f['message']}" for f in decision["findings"])
                self.to_client({
                    "jsonrpc": "2.0", "id": eid, "method": "elicitation/create",
                    "params": {
                        "message": f"Atls: `{self.server}/{name}` needs your approval. {reasons}",
                        "requestedSchema": {
                            "type": "object",
                            "properties": {"approve": {"type": "boolean", "title": "Allow this action", "description": reasons[:500]}},
                            "required": ["approve"],
                        },
                    },
                })
            else:
                self._block(msg, action, decision, "Atls needs a person to approve this call, so it was not run.")

    def _elicit_answer(self, msg: dict) -> None:
        msg0, action, decision = self.elicits.pop(self._key(msg["id"]))
        res = msg.get("result") or {}
        if res.get("action") == "accept" and (res.get("content") or {}).get("approve") is True:
            decision["approved_by"] = "user"
            self._forward(msg0, action, decision)
        else:
            decision["approved_by"] = None
            self._block(msg0, action, decision, "The user did not approve this call.", status="declined")

    def _forward(self, msg: dict, action: dict, decision: dict) -> None:
        self.pending[self._key(msg["id"])] = ("call", action, decision)
        self.to_server(msg)

    def _block(self, msg: dict, action: dict, decision: dict, headline: str, status: str = "blocked") -> None:
        r = self._receipt(action, decision, {"status": status, "result_sha256": None})
        reasons = "\n".join(f"- [{f['rule']}] {f['message']}" for f in decision["findings"]) or "- no rule matched"
        text = f"{headline}\n{reasons}\nReceipt {r['id']} (#{r['seq']})."
        self.log(f"{decision['verdict'].upper()} {self.server}/{action['tool']} -> {status} ({', '.join(f['rule'] for f in decision['findings'])})")
        self.to_client({"jsonrpc": "2.0", "id": msg["id"], "result": {"content": [{"type": "text", "text": text}], "isError": True}})

    def _receipt(self, action: dict, decision: dict, outcome: dict) -> dict:
        meta = self.tool_meta.get(action["tool"]) or {}
        with self.ledger_lock:
            return self.ledger.append(
                agent=self.policy.get("agent", "agent"), session=self.session, action=action, decision=decision,
                outcome=outcome, policy_sha256=self.policy_sha, tool_sha256=meta.get("sha256"),
                include_args=bool(self.policy.get("receipts", {}).get("include_args", False)),
            )

    # ------------------------------------------------------------ server side
    def from_server(self, line: bytes) -> None:
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            with self.lock:
                self.out.write(line)
                self.out.flush()
            return
        if isinstance(msg, dict) and "id" in msg and "method" not in msg:
            p = self.pending.pop(self._key(msg["id"]), None)
            if p and p[0] == "list" and isinstance(msg.get("result"), dict):
                msg["result"] = self._filter_tools(msg["result"])
            elif p and p[0] == "call":
                _, action, decision = p
                result = msg.get("result")
                failed = "error" in msg or (isinstance(result, dict) and result.get("isError") is True)
                r = self._receipt(action, decision, {"status": "error" if failed else "ok", "result_sha256": digest(result if result is not None else msg.get("error"))})
                if decision["kind"] == "payment" and not failed:
                    self.spent += payment_amount(action["arguments"]) or 0
                self.log(f"{decision['verdict'].upper()} {self.server}/{action['tool']} -> {r['outcome']['status']} (receipt #{r['seq']})")
        self.to_client(msg)

    def _filter_tools(self, result: dict) -> dict:
        tools = result.get("tools")
        if not isinstance(tools, list):
            return result
        tools_ok = [t for t in tools if isinstance(t, dict)]
        try:
            pins = server_pins(load_lock(self.lock_path), self.server)
            lock_ok = True
        except LockError as e:
            self.log(f"{e}; every tool from `{self.server}` will need approval")
            pins, lock_ok = None, False
        first_use = lock_ok and pins is None
        report = scan(tools_ok, self.server, pins if pins is not None else {})
        if first_use:
            def lock_all(lock: dict) -> None:
                if lock["servers"].get(self.server) is None:  # another session may have locked it meanwhile
                    for t in tools_ok:
                        pin(lock, self.server, t, "first-use")
            update(self.lock_path, lock_all)
            self.log(f"locked {len(tools_ok)} tool definitions from `{self.server}` in {self.lock_path} (first use)")
        for t in report["tools"]:
            status = "unverified" if not lock_ok else ("ok" if first_use else t["pin"])
            self.tool_meta[t["name"]] = {
                "sha256": t["sha256"], "grade": t["grade"], "pin": status,
                "critical": any(f["severity"] == "critical" and f["rule"] != "ATL-SCAN-014" for f in t["findings"]),
            }
        save_seen(self.home, self.server, tools_ok)
        if self.scans_dir:
            self.scans_dir.mkdir(parents=True, exist_ok=True)
            (self.scans_dir / f"{safe_name(self.server)}.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", "utf-8")
        hidden = unsafe_tools(report) if self.policy.get("hide_unsafe_tools", True) else set()
        self.log(f"scanned {report['tool_count']} tools from `{self.server}`: grade {report['grade']} ({report['score']}/100)" + (f", hidden: {', '.join(sorted(hidden))}" if hidden else ""))
        out = dict(result)
        out["tools"] = [t for t in tools if not (isinstance(t, dict) and t.get("name") in hidden)]
        return out
