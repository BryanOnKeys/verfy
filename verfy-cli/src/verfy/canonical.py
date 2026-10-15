"""Canonical JSON: the exact bytes Verfy hashes and signs.

Keys are sorted, there is no whitespace and numbers are written the way
JavaScript's ``JSON.stringify`` writes them, so the Python and browser
engines produce identical bytes for identical data.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _number(x: float) -> str:
    if isinstance(x, bool):
        raise TypeError("bool is not a number")
    if isinstance(x, int):
        return str(x)
    if math.isnan(x) or math.isinf(x):
        raise ValueError("NaN and Infinity cannot be signed")
    if x == int(x) and abs(x) < 1e21:
        return str(int(x))
    # ECMAScript Number::toString, built from Python's shortest repr digits.
    r = repr(abs(x))
    mant, _, exp = r.partition("e")
    e = int(exp) if exp else 0
    if "." in mant:
        ip, fp = mant.split(".")
    else:
        ip, fp = mant, ""
    digits = (ip + fp).lstrip("0")
    point = len(ip) + e  # position of the decimal point relative to digits start
    lead = len(ip + fp) - len((ip + fp).lstrip("0"))
    point -= lead
    digits = digits.rstrip("0") or "0"
    k, n = len(digits), point
    sign = "-" if x < 0 else ""
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    e2 = n - 1
    es = ("+" if e2 >= 0 else "-") + str(abs(e2))
    if k == 1:
        return sign + digits + "e" + es
    return sign + digits[0] + "." + digits[1:] + "e" + es


def canonical(obj: Any) -> str:
    if obj is None:
        return "null"
    if obj is True:
        return "true"
    if obj is False:
        return "false"
    if isinstance(obj, (int, float)):
        return _number(obj)
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False)
    if isinstance(obj, (list, tuple)):
        return "[" + ",".join(canonical(v) for v in obj) + "]"
    if isinstance(obj, dict):
        for k in obj:
            if not isinstance(k, str):
                raise TypeError("object keys must be strings")
        keys = sorted(obj, key=lambda s: s.encode("utf-16-be"))
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical(obj[k]) for k in keys) + "}"
    raise TypeError(f"cannot canonicalize {type(obj).__name__}")


def canonical_bytes(obj: Any) -> bytes:
    return canonical(obj).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest(obj: Any) -> str:
    """``sha256:<hex>`` of the canonical form of ``obj``."""
    return "sha256:" + sha256_hex(canonical_bytes(obj))
