"""verfy import: findings from Snyk Agent Scan and Cisco MCP Scanner, enforced by the gateway."""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from verfy import imports  # noqa: E402
from verfy.cli import main as cli_main  # noqa: E402

# shapes from each project's documentation (docs/json-output.md and docs/output-formats.md)
SNYK_V6 = {"scan_path_responses": [{"client": "cursor", "path": "/home/you/.cursor/mcp.json", "server_risks": [{
    "name": "demo",
    "entities": [{"name": "read_file", "type": "tool"}, {"name": "fetch_url", "type": "tool"}],
    "risk_indexes": {
        "tool_poisoning": {"score": 910, "evidence": "Description tells the model to send files elsewhere", "affected_tools": [1]},
        "untrusted_content": {"score": 450, "evidence": "Fetches web pages"},
        "noise": {"score": 0, "evidence": "nothing"},
    },
}]}]}
SNYK_V5 = {"/home/you/.cursor/mcp.json": {"client": "cursor", "path": "/home/you/.cursor/mcp.json", "servers": [
    {"name": "demo", "signature": {"tools": [{"name": "read_file"}, {"name": "fetch_url"}]}}],
    "issues": [{"code": "E001", "message": "Tool poisoning", "reference": [0, 1]},
               {"code": "W003", "message": "Server is not pinned", "reference": [0, None]}]}}
CISCO = {"server_url": "stdio", "requested_analyzers": ["yara"], "scan_results": [
    {"status": "completed", "is_safe": False, "item_type": "tool", "tool_name": "fetch_url", "server_name": "demo",
     "findings": {"yara_analyzer": {"severity": "HIGH", "threat_names": ["PROMPT INJECTION"], "threat_summary": "Hidden instruction", "total_findings": 1}}},
    {"status": "completed", "is_safe": True, "item_type": "tool", "tool_name": "read_file", "server_name": "demo", "findings": {}},
    {"status": "completed", "is_safe": False, "item_type": "tool", "tool_name": "write_file", "server_name": "demo",
     "findings": {"yara_analyzer": {"severity": "LOW", "threat_names": ["SUSPICIOUS"], "threat_summary": "Writes files", "total_findings": 1}}},
]}


class ImportParseTests(unittest.TestCase):
    def test_snyk_v6(self):
        source, found = imports.parse(SNYK_V6)
        self.assertEqual(source, "snyk-agent-scan")
        self.assertEqual([(f["severity"], f["tool"], f["rule"]) for f in found],
                         [("high", "fetch_url", "SNYK:tool_poisoning"), ("medium", None, "SNYK:untrusted_content")])

    def test_snyk_v5(self):
        source, found = imports.parse(SNYK_V5)
        self.assertEqual(source, "snyk-agent-scan")
        self.assertEqual([(f["severity"], f["server"], f["tool"]) for f in found], [("high", "demo", "fetch_url"), ("medium", "demo", None)])

    def test_cisco_envelope_and_bare_list(self):
        for data in (CISCO, CISCO["scan_results"]):
            source, found = imports.parse(data)
            self.assertEqual(source, "cisco-mcp-scanner")
            self.assertEqual([(f["severity"], f["tool"]) for f in found], [("high", "fetch_url"), ("low", "write_file")])
            self.assertIn("PROMPT INJECTION", found[0]["message"])

    def test_unknown_format(self):
        with self.assertRaises(imports.ImportFormatError):
            imports.parse({"hello": "world"})


class ImportCliAndGatewayTests(unittest.TestCase):
    def setUp(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.dir = Path(d.name)
        self.file = self.dir / "cisco.json"
        self.file.write_text(json.dumps(CISCO), "utf-8")

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"VERFY_HOME": str(self.dir)}), redirect_stdout(out), redirect_stderr(err):
            code = cli_main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_cli_exit_codes_and_save(self):
        code, out, _ = self.run_cli("import", str(self.file))
        self.assertEqual(code, 2)
        self.assertIn("--save", out)
        self.assertFalse((self.dir / "imported").exists())
        code, out, _ = self.run_cli("import", str(self.file), "--save")
        self.assertEqual(code, 2)
        self.assertEqual(sorted(imports.blocked_tools(self.dir, "demo")), ["fetch_url"])
        self.assertEqual(imports.blocked_tools(self.dir, "other"), {})
        bad = self.dir / "bad.json"
        bad.write_text("{}", "utf-8")
        self.assertEqual(self.run_cli("import", str(bad))[0], 3)

    def test_gateway_hides_and_denies_imported_high_tool(self):
        from test_lock_hook_team import GatewayLockTests
        imports.save(self.dir, imports.report(self.file))
        t = GatewayLockTests("test_new_tool_on_locked_server_needs_approval")
        replies = t.gateway(self.dir, GatewayLockTests.INIT + [GatewayLockTests.call(t, 2, "fetch_url", {"url": "https://example.com"})])
        names = [x["name"] for x in replies[1]["result"]["tools"]]
        self.assertNotIn("fetch_url", names)
        self.assertIn("read_file", names)
        self.assertIn("VFY-IMP-001", json.dumps(replies[2]))


if __name__ == "__main__":
    unittest.main()
