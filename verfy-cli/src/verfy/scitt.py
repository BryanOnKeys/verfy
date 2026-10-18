"""Receipts as SCITT signed statements: COSE_Sign1 (RFC 9052) with CWT claims in the protected header.

The IETF SCITT architecture (draft-ietf-scitt-architecture) registers *signed
statements* with a transparency service. ``export_statement`` wraps one Verfy
receipt in that envelope, so a team can hand its receipts to any SCITT
transparency service or COSE tooling instead of a Verfy-only format:

    COSE_Sign1 = 18([
        protected:   {1: -8 (EdDSA), 3: "application/json", 4: kid, 15: {1: iss, 2: sub}},
        unprotected: {},
        payload:     canonical JSON of the signed receipt,
        signature:   Ed25519 over Sig_structure ["Signature1", protected, h'', payload],
    ])

``iss`` names the signer (the device key id unless you give one) and ``sub``
is the receipt's hash, so a statement names exactly one receipt. The receipt
inside keeps its own signature, which ``verify_statement`` checks as well.

Verfy does not run a transparency service and does not issue SCITT receipts
(the countersignature a transparency service returns on registration).
"""

from __future__ import annotations

import json
from typing import Any

from . import ed25519
from .canonical import canonical_bytes
from .receipts import key_id, receipt_hash, verify_receipt

ALG_EDDSA = -8
H_ALG, H_CTY, H_KID, H_CWT = 1, 3, 4, 15
CWT_ISS, CWT_SUB = 1, 2
TAG_SIGN1 = 18
CONTENT_TYPE = "application/json"


class CoseError(ValueError):
    """Not a well-formed Verfy COSE_Sign1 statement."""


# ---------------------------------------------------------------- CBOR (RFC 8949, deterministic subset)

def _head(major: int, n: int) -> bytes:
    if n < 24:
        return bytes([major << 5 | n])
    for ai, size in ((24, 1), (25, 2), (26, 4), (27, 8)):
        if n < 1 << (8 * size):
            return bytes([major << 5 | ai]) + n.to_bytes(size, "big")
    raise CoseError("integer too large for CBOR")


def cbor(value: Any) -> bytes:
    """Deterministic CBOR for ints, bytes, text, lists, dicts (keys sorted by encoding) and (tag, value) pairs."""
    if isinstance(value, bool) or value is None:
        return bytes([0xF5 if value is True else 0xF4 if value is False else 0xF6])
    if isinstance(value, int):
        return _head(0, value) if value >= 0 else _head(1, -1 - value)
    if isinstance(value, bytes):
        return _head(2, len(value)) + value
    if isinstance(value, str):
        b = value.encode("utf-8")
        return _head(3, len(b)) + b
    if isinstance(value, list):
        return _head(4, len(value)) + b"".join(cbor(v) for v in value)
    if isinstance(value, dict):
        items = sorted((cbor(k), cbor(v)) for k, v in value.items())
        return _head(5, len(items)) + b"".join(k + v for k, v in items)
    if isinstance(value, Tag):
        return _head(6, value.tag) + cbor(value.value)
    raise CoseError(f"cannot encode {type(value).__name__} as CBOR")


class Tag:
    def __init__(self, tag: int, value: Any):
        self.tag, self.value = tag, value


def uncbor(data: bytes) -> Any:
    value, end = _decode(data, 0, 0)
    if end != len(data):
        raise CoseError("trailing bytes after the CBOR item")
    return value


def _decode(data: bytes, i: int, depth: int) -> tuple[Any, int]:
    if depth > 16:
        raise CoseError("CBOR nested too deeply")
    if i >= len(data):
        raise CoseError("truncated CBOR")
    major, ai = data[i] >> 5, data[i] & 31
    i += 1
    if major == 7:
        simple = {20: False, 21: True, 22: None}
        if ai not in simple:
            raise CoseError("unsupported CBOR simple value or float")
        return simple[ai], i
    if ai < 24:
        n = ai
    elif ai <= 27:
        size = 1 << (ai - 24)
        if i + size > len(data):
            raise CoseError("truncated CBOR")
        n = int.from_bytes(data[i:i + size], "big")
        i += size
    else:
        raise CoseError("indefinite-length CBOR is not accepted")
    if major == 0:
        return n, i
    if major == 1:
        return -1 - n, i
    if major in (2, 3):
        if i + n > len(data):
            raise CoseError("truncated CBOR")
        raw = data[i:i + n]
        return (raw if major == 2 else raw.decode("utf-8")), i + n
    if major == 4:
        out = []
        for _ in range(n):
            v, i = _decode(data, i, depth + 1)
            out.append(v)
        return out, i
    if major == 5:
        m = {}
        for _ in range(n):
            k, i = _decode(data, i, depth + 1)
            if isinstance(k, (list, dict)):
                raise CoseError("CBOR map key must be a scalar")
            m[k], i = _decode(data, i, depth + 1)
        return m, i
    v, i = _decode(data, i, depth + 1)
    return Tag(n, v), i


# ---------------------------------------------------------------- COSE_Sign1

def _sig_structure(protected: bytes, payload: bytes) -> bytes:
    return cbor(["Signature1", protected, b"", payload])


def export_statement(receipt: dict, key, issuer: str | None = None) -> bytes:
    """A COSE_Sign1 signed statement for one receipt, signed with the same device key."""
    if not verify_receipt(receipt, key.public):
        raise CoseError(f"receipt {receipt.get('id', '?')} is not signed by key {key.kid}")
    payload = canonical_bytes(receipt)
    protected = cbor({H_ALG: ALG_EDDSA, H_CTY: CONTENT_TYPE, H_KID: key.kid.encode(),
                      H_CWT: {CWT_ISS: issuer or key.kid, CWT_SUB: receipt_hash(receipt)}})
    sig = ed25519.sign(key.secret, _sig_structure(protected, payload))
    return cbor(Tag(TAG_SIGN1, [protected, {}, payload, sig]))


def verify_statement(data: bytes, public: bytes) -> dict:
    """Check the COSE signature, the CWT subject and the receipt's own signature. Returns the receipt."""
    item = uncbor(data)
    if not isinstance(item, Tag) or item.tag != TAG_SIGN1 or not isinstance(item.value, list) or len(item.value) != 4:
        raise CoseError("not a tagged COSE_Sign1 structure")
    protected, unprotected, payload, sig = item.value
    if not isinstance(protected, bytes) or not isinstance(unprotected, dict) or not isinstance(payload, bytes) or not isinstance(sig, bytes):
        raise CoseError("COSE_Sign1 fields have the wrong types")
    hdr = uncbor(protected)
    if not isinstance(hdr, dict) or hdr.get(H_ALG) != ALG_EDDSA:
        raise CoseError("protected header must say alg EdDSA (-8)")
    if hdr.get(H_KID) != key_id(public).encode():
        raise CoseError("statement was signed by a different key")
    claims = hdr.get(H_CWT)
    if not isinstance(claims, dict) or not isinstance(claims.get(CWT_ISS), str) or not isinstance(claims.get(CWT_SUB), str):
        raise CoseError("protected header has no CWT claims with iss and sub")
    if not ed25519.verify(public, _sig_structure(protected, payload), sig):
        raise CoseError("bad COSE signature")
    try:
        receipt = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CoseError("payload is not JSON") from None
    if not isinstance(receipt, dict) or canonical_bytes(receipt) != payload:
        raise CoseError("payload is not a receipt in canonical JSON")
    if claims[CWT_SUB] != receipt_hash(receipt):
        raise CoseError("CWT subject does not match the receipt hash")
    if not verify_receipt(receipt, public):
        raise CoseError("the receipt inside has a bad signature")
    return {"receipt": receipt, "issuer": claims[CWT_ISS], "subject": claims[CWT_SUB]}
