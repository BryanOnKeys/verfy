"""Atomic writes and a cross-process file lock.

Several agent sessions can run at once (two terminals, a gateway and a hook),
so every read-modify-write of a shared file happens under ``FileLock`` and
every rewrite goes through a temp file plus ``os.replace``.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

if os.name == "nt":  # pragma: no cover - platform specific
    import msvcrt
else:  # pragma: no cover - platform specific
    import fcntl


class LockTimeout(RuntimeError):
    pass


class FileLock:
    """Exclusive OS-level lock on a ``<path>.lck`` sidecar file.

    Uses ``fcntl.flock`` on POSIX and ``msvcrt.locking`` on Windows. The
    operating system drops the lock when a process dies, so a crashed session
    can never leave the ledger locked. The sidecar file itself is kept.
    """

    def __init__(self, path: str | os.PathLike, timeout: float = 5.0):
        self.path = Path(str(path) + ".lck")
        self.timeout = timeout
        self.fh = None

    def _try(self) -> bool:
        assert self.fh is not None
        try:
            if os.name == "nt":
                self.fh.seek(0)
                msvcrt.locking(self.fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(self.fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError:
            return False

    def __enter__(self) -> "FileLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = open(self.path, "a+b")
        deadline = time.monotonic() + self.timeout
        while not self._try():
            if time.monotonic() > deadline:
                self.fh.close()
                self.fh = None
                raise LockTimeout(f"could not lock {self.path} within {self.timeout:g}s")
            time.sleep(0.005)
        return self

    def __exit__(self, *exc) -> None:
        if self.fh is None:
            return
        try:
            if os.name == "nt":
                self.fh.seek(0)
                msvcrt.locking(self.fh.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(self.fh.fileno(), fcntl.LOCK_UN)
        finally:
            self.fh.close()
            self.fh = None


def atomic_write(path: str | os.PathLike, text: str, mode: int = 0o644) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    for attempt in range(20):
        try:
            os.replace(tmp, p)
            return
        except PermissionError:  # Windows: another process has the target open for a moment
            if attempt == 19:
                raise
            time.sleep(0.01)
