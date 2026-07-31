#!/usr/bin/env python3
"""Descriptor-relative canonical tree scanner used by canonical-artifact.ts."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import unicodedata


def fail(code: str, message: str) -> None:
    sys.stderr.write(json.dumps({"code": code, "message": message}, separators=(",", ":")))
    raise SystemExit(2)


def canonical_path(path: str, max_path_bytes: int) -> bytes:
    if not path or path.startswith("/") or path.endswith("/") or "\\" in path or "\x00" in path:
        fail("PATH_UNSAFE", f"unsafe relative path: {path!r}")
    if any(segment in ("", ".", "..") for segment in path.split("/")):
        fail("PATH_UNSAFE", f"path contains traversal: {path!r}")
    try:
        encoded = path.encode("utf-8", "strict")
    except UnicodeError:
        fail("PATH_INVALID_UTF8", f"path is not canonical UTF-8: {path!r}")
    if not encoded or len(encoded) > max_path_bytes:
        fail("TREE_LIMIT_EXCEEDED", f"path exceeds byte bound: {path!r}")
    return encoded


def stable_identity(left: os.stat_result, right: os.stat_result) -> bool:
    return (
        left.st_dev == right.st_dev
        and left.st_ino == right.st_ino
        and left.st_size == right.st_size
        and left.st_nlink == right.st_nlink
        and left.st_mtime_ns == right.st_mtime_ns
        and left.st_ctime_ns == right.st_ctime_ns
    )


def stable_directory(left: os.stat_result, right: os.stat_result) -> bool:
    return (
        left.st_dev == right.st_dev
        and left.st_ino == right.st_ino
        and left.st_nlink == right.st_nlink
        and left.st_size == right.st_size
        and left.st_mtime_ns == right.st_mtime_ns
        and left.st_ctime_ns == right.st_ctime_ns
    )


def main() -> None:
    if len(sys.argv) != 8:
        fail("TREE_ROOT_INVALID", "scanner limits are missing")
    if sys.argv[1] != "missionpulse.descriptor-scanner.v1":
        fail("TREE_ROOT_INVALID", "descriptor scanner protocol mismatch")
    limits = {
        "max_files": int(sys.argv[2]),
        "max_directories": int(sys.argv[3]),
        "max_path_bytes": int(sys.argv[4]),
        "max_total_path_bytes": int(sys.argv[5]),
        "max_file_bytes": int(sys.argv[6]),
        "max_total_bytes": int(sys.argv[7]),
    }
    root_fd = 3
    root_stat = os.fstat(root_fd)
    if not stat.S_ISDIR(root_stat.st_mode):
        fail("TREE_ROOT_INVALID", "admitted root descriptor is not a directory")

    state: dict[str, object] = {
        "entries": [],
        "directory_count": 1,
        "total_path_bytes": 0,
        "total_bytes": 0,
        "identities": {},
        "directory_identities": {},
        "collision_keys": {},
    }

    def admit_path(relative_path: str) -> bytes:
        encoded = canonical_path(relative_path, limits["max_path_bytes"])
        state["total_path_bytes"] = int(state["total_path_bytes"]) + len(encoded)
        if int(state["total_path_bytes"]) > limits["max_total_path_bytes"]:
            fail("TREE_LIMIT_EXCEEDED", "canonical file/directory path-byte limit exceeded")
        key = unicodedata.normalize("NFC", relative_path).lower()
        collision_keys = state["collision_keys"]
        assert isinstance(collision_keys, dict)
        previous = collision_keys.get(key)
        if previous is not None:
            fail("PATH_COLLISION", f"case/Unicode-colliding paths: {previous} and {relative_path}")
        collision_keys[key] = relative_path
        return encoded

    def visit(directory_fd: int, prefix: str) -> None:
        directory_before = os.fstat(directory_fd)
        directory_identity = f"{directory_before.st_dev}:{directory_before.st_ino}"
        directory_identities = state["directory_identities"]
        assert isinstance(directory_identities, dict)
        previous_directory = directory_identities.get(directory_identity)
        if previous_directory is not None:
            fail(
                "TREE_HARD_LINK_ALIAS",
                f"repeated/cyclic directory identity for {previous_directory} and {prefix or '.'}",
            )
        directory_identities[directory_identity] = prefix or "."
        try:
            names = os.listdir(directory_fd)
        except OSError as error:
            fail("TREE_CHANGED_DURING_READ", f"directory could not be read: {error}")
        for name in names:
            relative_path = name if not prefix else f"{prefix}/{name}"
            admit_path(relative_path)
            flags = (
                os.O_RDONLY
                | getattr(os, "O_CLOEXEC", 0)
                | getattr(os, "O_NOFOLLOW", 0)
                | getattr(os, "O_NONBLOCK", 0)
            )
            try:
                child_fd = os.open(name, flags, dir_fd=directory_fd)
            except OSError as error:
                fail(
                    "TREE_NON_REGULAR_ENTRY",
                    f"entry cannot be opened no-follow relative to its parent: {relative_path}: {error}",
                )
            try:
                before = os.fstat(child_fd)
                if stat.S_ISDIR(before.st_mode):
                    state["directory_count"] = int(state["directory_count"]) + 1
                    if int(state["directory_count"]) > limits["max_directories"]:
                        fail("TREE_LIMIT_EXCEEDED", "canonical directory-count limit exceeded")
                    visit(child_fd, relative_path)
                    continue
                if not stat.S_ISREG(before.st_mode):
                    fail("TREE_NON_REGULAR_ENTRY", f"special entry is forbidden: {relative_path}")
                entries = state["entries"]
                assert isinstance(entries, list)
                if len(entries) >= limits["max_files"]:
                    fail("TREE_LIMIT_EXCEEDED", "canonical file-count limit exceeded")
                if before.st_nlink != 1:
                    fail("TREE_HARD_LINK_ALIAS", f"hard-linked file is forbidden: {relative_path}")
                identity = f"{before.st_dev}:{before.st_ino}"
                identities = state["identities"]
                assert isinstance(identities, dict)
                previous = identities.get(identity)
                if previous is not None:
                    fail(
                        "TREE_HARD_LINK_ALIAS",
                        f"repeated file identity for {previous} and {relative_path}",
                    )
                identities[identity] = relative_path
                if before.st_size < 0 or before.st_size > limits["max_file_bytes"]:
                    fail("TREE_LIMIT_EXCEEDED", f"file exceeds byte bound: {relative_path}")
                if before.st_size > 0 and before.st_blocks * 512 < before.st_size:
                    fail("TREE_SPARSE_FILE", f"sparse file is forbidden: {relative_path}")
                digest = hashlib.sha256()
                observed = 0
                while True:
                    chunk = os.read(child_fd, min(1024 * 1024, limits["max_file_bytes"] + 1))
                    if not chunk:
                        break
                    observed += len(chunk)
                    if observed > before.st_size or observed > limits["max_file_bytes"]:
                        fail("TREE_LIMIT_EXCEEDED", f"file grew beyond byte bound: {relative_path}")
                    digest.update(chunk)
                after = os.fstat(child_fd)
                if observed != before.st_size or not stable_identity(before, after):
                    fail("TREE_CHANGED_DURING_READ", f"file changed while reading: {relative_path}")
                state["total_bytes"] = int(state["total_bytes"]) + observed
                if int(state["total_bytes"]) > limits["max_total_bytes"]:
                    fail("TREE_LIMIT_EXCEEDED", "canonical total-byte limit exceeded")
                entries.append(
                    {
                        "path": relative_path,
                        "bytes": observed,
                        "sha256": digest.hexdigest(),
                        "mode": "0644",
                    }
                )
            finally:
                os.close(child_fd)
        directory_after = os.fstat(directory_fd)
        if not stable_directory(directory_before, directory_after):
            fail("TREE_CHANGED_DURING_READ", f"directory changed while scanning: {prefix or '.'}")

    visit(root_fd, "")
    entries = state["entries"]
    assert isinstance(entries, list)
    entries.sort(key=lambda entry: entry["path"].encode("utf-8"))
    result = {
        "directoryCount": state["directory_count"],
        "entries": entries,
        "totalBytes": state["total_bytes"],
        "totalPathBytes": state["total_path_bytes"],
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
