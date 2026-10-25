"""Verfy Cloud client: enroll this device, upload receipts, propose lock updates
and pull the team policy and approved locks.

Nothing here runs inside the hook. The gateway calls the team service only
for the approval queue, when the policy says ``"on_ask": "team"``; if the
service cannot be reached the call is refused. The guard and the local ledger
keep working when the team service is down; ``verfy sync`` uploads whatever
is waiting the next time it runs.

* Only HTTPS endpoints are accepted (plain http only for localhost, for
  development).
* The device token is stored in ``~/.verfy/team.json`` with mode 0600 and
  sent only in the Authorization header. It is never printed.
* The private signing key never leaves this machine: enrollment sends the
  public key, and the server verifies receipts with it.
* Receipts are uploaded exactly as signed. By default they carry only hashes
  of arguments and results; a ledger written with ``include_args`` is refused
  unless ``--allow-args`` is given.
"""

from __future__ import annotations

import json
import os
import platform
import random
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from ._util import redact
from .fileio import atomic_write
from .receipts import Key, b64u, read_ledger, receipt_hash

BATCH_MAX = 500
TIMEOUT = 15.0
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class TeamError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code


def check_endpoint(url: str) -> str:
    u = urlparse(url.strip())
    if u.scheme not in ("https", "http") or not u.hostname:
        raise TeamError("the team URL must look like https://verfy.example.com")
    if u.scheme == "http" and u.hostname not in LOCAL_HOSTS:
        raise TeamError("refusing plain http for a non-local team URL; use https")
    if u.username or u.password:
        raise TeamError("the team URL must not contain a username or password")
    return f"{u.scheme}://{u.netloc}{u.path.rstrip('/')}"


def team_file(home: Path) -> Path:
    return home / "team.json"


def load_team(home: Path) -> dict | None:
    p = team_file(home)
    if not p.exists():
        return None
    data = json.loads(p.read_text("utf-8"))
    if not isinstance(data, dict) or not all(isinstance(data.get(k), str) for k in ("url", "token", "kid", "device_id")):
        raise TeamError(f"{p} is damaged; run `verfy team enroll` again")
    return data


def save_team(home: Path, data: dict) -> None:
    atomic_write(team_file(home), json.dumps(data, indent=2, sort_keys=True) + "\n", mode=0o600)
    try:
        os.chmod(team_file(home), 0o600)
    except OSError:
        pass


Transport = Callable[[str, str, dict | None, dict], tuple[int, Any]]


def http_transport(method: str, url: str, body: dict | None, headers: dict) -> tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "verfy-cli", **headers})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:  # noqa: S310 - scheme checked in check_endpoint
            raw = resp.read(8 * 1024 * 1024)
            return resp.status, json.loads(raw or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read(64 * 1024)
        try:
            return e.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return e.code, {"title": raw.decode("utf-8", "replace")[:200]}
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as e:
        raise TeamError(f"cannot reach the team service: {getattr(e, 'reason', e)}") from None


def _problem(status: int, body: Any) -> TeamError:
    if isinstance(body, dict):
        msg = body.get("detail") or body.get("title") or json.dumps(body)[:200]
        return TeamError(f"team service answered {status}: {msg}", status, body.get("code"))
    return TeamError(f"team service answered {status}", status)


class TeamClient:
    def __init__(self, url: str, token: str | None = None, transport: Transport | None = None,
                 retries: int = 3, sleep: Callable[[float], None] = time.sleep):
        self.url = check_endpoint(url)
        self.token = token
        self.transport = transport or http_transport
        self.retries = retries
        self.sleep = sleep

    def call(self, method: str, path: str, body: dict | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                status, data = self.transport(method, self.url + path, body, headers)
            except TeamError as e:
                last = e
            else:
                if 200 <= status < 300:
                    return data
                if status in (429, 500, 502, 503, 504):
                    last = _problem(status, data)
                else:
                    raise _problem(status, data)
            if attempt < self.retries - 1:
                self.sleep(min(30.0, (2 ** attempt) + random.random()))
        assert last is not None
        raise last


def enroll(home: Path, url: str, code: str, key: Key, name: str | None = None, transport: Transport | None = None) -> dict:
    client = TeamClient(url, transport=transport)
    res = client.call("POST", "/api/v1/devices/enroll", {
        "code": code.strip(),
        "public_key": b64u(key.public),
        "kid": key.kid,
        "name": (name or socket.gethostname())[:80],
        "platform": f"{platform.system()} {platform.machine()}"[:80],
    })
    if not isinstance(res, dict) or not isinstance(res.get("token"), str) or not isinstance(res.get("device_id"), str):
        raise TeamError("enrollment answer is missing the device token")
    data = {"url": client.url, "token": res["token"], "device_id": res["device_id"], "kid": key.kid, "org": str(res.get("org_name", ""))}
    save_team(home, data)
    return data


def _state_path(home: Path) -> Path:
    return home / "sync-state.json"


def sync(home: Path, ledger_path: Path, key: Key, *, allow_args: bool = False, transport: Transport | None = None) -> dict:
    team = load_team(home)
    if team is None:
        raise TeamError("this device is not enrolled; run `verfy team enroll`")
    if team["kid"] != key.kid:
        raise TeamError("the signing key changed since enrollment; enroll this key again")
    receipts = read_ledger(ledger_path)
    state_p = _state_path(home)
    state = json.loads(state_p.read_text("utf-8")) if state_p.exists() else {}
    done = int(state.get("uploaded_seq", -1))
    if done >= 0 and done < len(receipts) and state.get("head") != receipt_hash(receipts[done]):
        raise TeamError("the local ledger no longer matches what was uploaded (edited or replaced); run `verfy ledger verify`")
    pending = receipts[done + 1:]
    if not allow_args and any(isinstance(r.get("action"), dict) and "args" in r["action"] for r in pending):
        raise TeamError("some receipts contain tool arguments (include_args); pass --allow-args to upload them anyway")
    client = TeamClient(team["url"], team["token"], transport=transport)
    accepted = duplicates = 0
    for i in range(0, len(pending), BATCH_MAX):
        batch = pending[i:i + BATCH_MAX]
        res = client.call("POST", "/api/v1/receipts/batch", {"receipts": batch})
        accepted += int(res.get("accepted", 0))
        duplicates += int(res.get("duplicates", 0))
        last = batch[-1]
        state = {"uploaded_seq": last["seq"], "head": receipt_hash(last)}
        atomic_write(state_p, json.dumps(state) + "\n")
    return {"uploaded": len(pending), "accepted": accepted, "duplicates": duplicates, "head_seq": state.get("uploaded_seq", done)}


def propose_lock(home: Path, server: str, definition: dict, digest_: str, transport: Transport | None = None) -> dict:
    team = load_team(home)
    if team is None:
        raise TeamError("this device is not enrolled; run `verfy team enroll`")
    client = TeamClient(team["url"], team["token"], transport=transport)
    return client.call("POST", "/api/v1/locks/propose", {"server_id": server, "tool_name": definition["name"], "digest": digest_, "definition": definition})


def request_approval(home: Path, server: str, tool: str, kind: str, args_sha256: str, findings: list[dict], ttl: int,
                     transport: Transport | None = None) -> dict:
    """Put one call in the team's approval queue. Only the hash of the arguments is sent."""
    team = load_team(home)
    if team is None:
        raise TeamError("this device is not enrolled; run `verfy team enroll`")
    client = TeamClient(team["url"], team["token"], transport=transport, retries=2)
    sent = [{"rule": f["rule"], "verdict": f["verdict"], "message": redact(str(f.get("message", "")))[:500]}
            for f in findings if f.get("verdict") in ("ask", "deny")][:20]
    return client.call("POST", "/api/v1/approvals", {"server_id": server[:200], "tool_name": tool[:200], "kind": kind[:40],
                                                     "args_sha256": args_sha256, "findings": sent, "ttl_seconds": ttl})


def approval_status(home: Path, approval_id: str, transport: Transport | None = None) -> dict:
    team = load_team(home)
    if team is None:
        raise TeamError("this device is not enrolled; run `verfy team enroll`")
    return TeamClient(team["url"], team["token"], transport=transport, retries=2).call("GET", f"/api/v1/approvals/{approval_id}")


def pull(home: Path, transport: Transport | None = None) -> dict:
    """Fetch the current team policy and approved locks."""
    team = load_team(home)
    if team is None:
        raise TeamError("this device is not enrolled; run `verfy team enroll`")
    client = TeamClient(team["url"], team["token"], transport=transport)
    policy = client.call("GET", "/api/v1/policies/current")
    locks = client.call("GET", "/api/v1/locks?status=approved")
    return {"policy": policy, "locks": locks}
