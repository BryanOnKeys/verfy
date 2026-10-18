"""Tests for receipts exported as SCITT signed statements (COSE_Sign1).
Run from verfy-cli/: ``python -m unittest discover -s tests``."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from verfy import scitt  # noqa: E402
from verfy.policy import load_policy  # noqa: E402
from verfy.precheck import check  # noqa: E402
from verfy.receipts import Key, Ledger, read_ledger, receipt_hash  # noqa: E402

from test_lock_hook_team import run_cli  # noqa: E402


class Cbor(unittest.TestCase):
    def test_rfc8949_vectors(self):
        # RFC 8949 Appendix A
        for value, hexed in [(0, "00"), (23, "17"), (24, "1818"), (100, "1864"), (1000, "1903e8"), (1000000, "1a000f4240"),
                             (-1, "20"), (-1000, "3903e7"), ("a", "6161"), ("ü", "62c3bc"), (b"\x01\x02\x03\x04", "4401020304"),
                             ([1, 2, 3], "83010203"), ({1: 2, 3: 4}, "a201020304"), (True, "f5"), (None, "f6")]:
            self.assertEqual(scitt.cbor(value).hex(), hexed)
            self.assertEqual(scitt.uncbor(bytes.fromhex(hexed)), value)

    def test_map_keys_are_sorted_by_encoding(self):
        self.assertEqual(scitt.cbor({15: 0, 1: 0, -8: 0}).hex(), "a3" "0100" "0f00" "2700")

    def test_rejects_bad_input(self):
        for bad in ["", "1f", "5f", "9f", "18", "4401", "0000"]:
            with self.assertRaises(scitt.CoseError):
                scitt.uncbor(bytes.fromhex(bad))


class Statements(unittest.TestCase):
    def setUp(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.home = Path(d.name)
        self.key = Key.generate()
        self.key.save(self.home / "key.json")
        led = Ledger(self.home / "ledger.jsonl", self.key)
        pol = load_policy({})
        for cmd in ("npm test", "rm -rf ~"):
            act = {"server": "s", "tool": "Bash", "arguments": {"command": cmd}}
            led.append(agent="a", session="s", action=act, decision=check(act, pol), outcome={"status": "ok", "result_sha256": None}, policy_sha256="sha256:0")
        self.receipts = read_ledger(self.home / "ledger.jsonl")

    def test_round_trip(self):
        r = self.receipts[1]
        data = scitt.export_statement(r, self.key, issuer="https://verfy.example/devices/1")
        self.assertEqual(data[0], 0xD2)  # CBOR tag 18: COSE_Sign1
        res = scitt.verify_statement(data, self.key.public)
        self.assertEqual(res["receipt"], r)
        self.assertEqual(res["subject"], receipt_hash(r))
        self.assertEqual(res["issuer"], "https://verfy.example/devices/1")
        hdr = scitt.uncbor(scitt.uncbor(data).value[0])
        self.assertEqual(hdr[1], -8)
        self.assertEqual(hdr[15][2], receipt_hash(r))

    def test_any_change_fails(self):
        data = scitt.export_statement(self.receipts[1], self.key)
        payload = scitt.uncbor(data).value[2]
        edited = data.replace(payload, payload.replace(b'"deny"', b'"allo"'))
        self.assertNotEqual(edited, data)
        with self.assertRaises(scitt.CoseError):
            scitt.verify_statement(edited, self.key.public)
        with self.assertRaises(scitt.CoseError):
            scitt.verify_statement(data, Key.generate().public)
        flipped = bytearray(data)
        flipped[-1] ^= 1
        with self.assertRaises(scitt.CoseError):
            scitt.verify_statement(bytes(flipped), self.key.public)

    def test_refuses_a_receipt_signed_by_another_key(self):
        with self.assertRaises(scitt.CoseError):
            scitt.export_statement(self.receipts[0], Key.generate())

    def test_cli_export_and_verify(self):
        out = self.home / "statements"
        key, led = str(self.home / "key.json"), str(self.home / "ledger.jsonl")
        code, text, _ = run_cli(self.home, "scitt", "export", "--out", str(out), "--key", key, "--ledger", led)
        self.assertEqual(code, 0, text)
        files = sorted(str(p) for p in out.glob("*.cose"))
        self.assertEqual(len(files), 2)
        code, text, _ = run_cli(self.home, "scitt", "verify", *files, "--pub", key)
        self.assertEqual(code, 0, text)
        self.assertEqual(text.count("VERIFIED"), 2)
        Path(files[0]).write_bytes(Path(files[0]).read_bytes()[:-1] + b"\x00")
        self.assertEqual(run_cli(self.home, "scitt", "verify", *files, "--pub", key)[0], 1)


if __name__ == "__main__":
    unittest.main()
