"""Ed25519 signatures (RFC 8032).

Uses the ``cryptography`` package when it is installed and a pure-Python
implementation otherwise, so Atls has no required dependencies. Both give
byte-identical keys and signatures, since Ed25519 is deterministic.
"""

from __future__ import annotations

import hashlib
import os

try:  # pragma: no cover - exercised when cryptography is present
    if os.environ.get("ATLS_PURE_PYTHON"):
        raise ImportError("pure Python Ed25519 requested")
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    from cryptography.hazmat.primitives import serialization

    _FAST = True
except Exception:  # pragma: no cover
    _FAST = False

_p = 2**255 - 19
_L = 2**252 + 27742317777372353535851937790883648493
_d = -121665 * pow(121666, _p - 2, _p) % _p
_I = pow(2, (_p - 1) // 4, _p)


def _sha512_int(b: bytes) -> int:
    return int.from_bytes(hashlib.sha512(b).digest(), "little")


def _add(P, Q):
    A = (P[1] - P[0]) * (Q[1] - Q[0]) % _p
    B = (P[1] + P[0]) * (Q[1] + Q[0]) % _p
    C = 2 * P[3] * Q[3] * _d % _p
    D = 2 * P[2] * Q[2] % _p
    E, F, G, H = B - A, D - C, D + C, B + A
    return (E * F % _p, G * H % _p, F * G % _p, E * H % _p)


def _mul(s: int, P):
    Q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            Q = _add(Q, P)
        P = _add(P, P)
        s >>= 1
    return Q


def _equal(P, Q) -> bool:
    return (P[0] * Q[2] - Q[0] * P[2]) % _p == 0 and (P[1] * Q[2] - Q[1] * P[2]) % _p == 0


def _recover_x(y: int, sign: int):
    if y >= _p:
        return None
    x2 = (y * y - 1) * pow(_d * y * y + 1, _p - 2, _p)
    if x2 % _p == 0:
        return None if sign else 0
    x = pow(x2, (_p + 3) // 8, _p)
    if (x * x - x2) % _p != 0:
        x = x * _I % _p
    if (x * x - x2) % _p != 0:
        return None
    if (x & 1) != sign:
        x = _p - x
    return x


_gy = 4 * pow(5, _p - 2, _p) % _p
_gx = _recover_x(_gy, 0)
_G = (_gx, _gy, 1, _gx * _gy % _p)


def _compress(P) -> bytes:
    zi = pow(P[2], _p - 2, _p)
    x, y = P[0] * zi % _p, P[1] * zi % _p
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decompress(s: bytes):
    if len(s) != 32:
        return None
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _p)


def _expand(secret: bytes):
    h = hashlib.sha512(secret).digest()
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    return a, h[32:]


def generate_secret() -> bytes:
    return os.urandom(32)


def public_key(secret: bytes) -> bytes:
    if len(secret) != 32:
        raise ValueError("Ed25519 secret must be 32 bytes")
    if _FAST:
        k = Ed25519PrivateKey.from_private_bytes(secret)
        return k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    a, _ = _expand(secret)
    return _compress(_mul(a, _G))


def sign(secret: bytes, msg: bytes) -> bytes:
    if _FAST:
        return Ed25519PrivateKey.from_private_bytes(secret).sign(msg)
    return _sign_py(secret, msg)


def _sign_py(secret: bytes, msg: bytes) -> bytes:
    a, prefix = _expand(secret)
    A = _compress(_mul(a, _G))
    r = _sha512_int(prefix + msg) % _L
    Rs = _compress(_mul(r, _G))
    h = _sha512_int(Rs + A + msg) % _L
    s = (r + h * a) % _L
    return Rs + int.to_bytes(s, 32, "little")


def verify(public: bytes, msg: bytes, sig: bytes) -> bool:
    if len(public) != 32 or len(sig) != 64:
        return False
    if _FAST:
        try:
            Ed25519PublicKey.from_public_bytes(public).verify(sig, msg)
            return True
        except (InvalidSignature, ValueError):
            return False
    return _verify_py(public, msg, sig)


def _verify_py(public: bytes, msg: bytes, sig: bytes) -> bool:
    if len(public) != 32 or len(sig) != 64:
        return False
    A = _decompress(public)
    if A is None:
        return False
    R = _decompress(sig[:32])
    if R is None:
        return False
    s = int.from_bytes(sig[32:], "little")
    if s >= _L:
        return False
    h = _sha512_int(sig[:32] + public + msg) % _L
    return _equal(_mul(s, _G), _add(R, _mul(h, A)))
