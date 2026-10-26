"""MCP configs of more agents: Codex CLI (TOML), Gemini CLI, VS Code and Windsurf."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from verfy import discover  # noqa: E402

try:
    import tomllib  # noqa: F401
    HAS_TOML = True
except ModuleNotFoundError:
    HAS_TOML = False


class DiscoverAgentsTests(unittest.TestCase):
    def setUp(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.home = Path(d.name) / "home"
        self.cwd = Path(d.name) / "repo"
        for p in (self.home, self.cwd):
            p.mkdir()

    def put(self, path: Path, text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, "utf-8")

    def found(self) -> dict[str, dict]:
        return {f["source"]: f for f in discover.discover(self.home, self.cwd)}

    def test_gemini_vscode_windsurf(self):
        self.put(self.home / ".gemini" / "settings.json", json.dumps({"mcpServers": {"docs": {"httpUrl": "http://docs.example.com/mcp"}}}))
        self.put(self.cwd / ".vscode" / "mcp.json", json.dumps({"servers": {"gh": {"type": "stdio", "command": "npx", "args": ["-y", "some-mcp"]}}}))
        self.put(self.home / ".codeium" / "windsurf" / "mcp_config.json", json.dumps({"mcpServers": {"remote": {"serverUrl": "https://mcp.example.com/sse"}}}))
        found = self.found()
        self.assertEqual(sorted(found), ["gemini user", "vscode project", "windsurf user"])
        report = discover.scan_configs(list(found.values()))
        by = {s["server"]: s for s in report["servers"]}
        self.assertEqual(by["docs"]["transport"], "http")
        self.assertIn("VFY-CFG-002", [f["rule"] for f in by["docs"]["findings"]])  # plain http to a remote host
        self.assertIn("VFY-CFG-001", [f["rule"] for f in by["gh"]["findings"]])  # unpinned npx package
        self.assertEqual(by["remote"]["transport"], "http")

    @unittest.skipUnless(HAS_TOML, "TOML needs Python 3.11+")
    def test_codex_toml(self):
        self.put(self.home / ".codex" / "config.toml", '[mcp_servers.fs]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-filesystem"]\n')
        found = self.found()
        self.assertIn("fs", found["codex user"]["servers"])
        rules = [f["rule"] for s in discover.scan_configs([found["codex user"]])["servers"] for f in s["findings"]]
        self.assertIn("VFY-CFG-001", rules)

    def test_unreadable_toml_is_reported_not_raised(self):
        self.put(self.home / ".codex" / "config.toml", "[mcp_servers.fs\n")
        self.assertIn("error", self.found()["codex user"])


if __name__ == "__main__":
    unittest.main()
