"""Prepare the real tokenizer without mutating developer caches or forwarding keys."""

import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import smoke_cli


class TokenizerCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="rag-tokenizer-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.work = self.root / "work"
        self.work.mkdir()
        self.host_cache = self.root / "host-cache"
        self.host_cache.mkdir()
        self.source = self.host_cache / smoke_cli.TOKENIZER_CACHE_KEY
        self.data = b"synthetic vocabulary"
        self.env = {"HOME": str(self.work), "TMPDIR": str(self.work)}
        tokenizer_hash = patch.object(
            smoke_cli, "TOKENIZER_SHA256", hashlib.sha256(self.data).hexdigest()
        )
        tokenizer_hash.start()
        self.addCleanup(tokenizer_hash.stop)

    def test_verified_cache_is_copied_without_network_or_host_changes(self):
        self.source.write_bytes(self.data)
        before = self.source.stat().st_mtime_ns
        with (
            patch.dict(
                os.environ, {"TIKTOKEN_CACHE_DIR": str(self.host_cache)}, clear=True
            ),
            patch.object(smoke_cli, "run_process") as run,
        ):
            smoke_cli.prepare_tokenizer(self.work, self.env)
        run.assert_not_called()
        destination = (
            Path(self.env["TIKTOKEN_CACHE_DIR"]) / smoke_cli.TOKENIZER_CACHE_KEY
        )
        self.assertEqual(destination.read_bytes(), self.data)
        self.assertTrue(destination.is_relative_to(self.work))
        self.assertEqual(self.source.read_bytes(), self.data)
        self.assertEqual(self.source.stat().st_mtime_ns, before)

    def test_cache_precedence_matches_tiktoken(self):
        self.source.write_bytes(self.data)
        for variables in (
            {"DATA_GYM_CACHE_DIR": str(self.host_cache)},
            {},
        ):
            with (
                self.subTest(variables=variables),
                tempfile.TemporaryDirectory() as work,
            ):
                with (
                    patch.dict(os.environ, variables, clear=True),
                    patch.object(
                        smoke_cli.tempfile, "gettempdir", return_value=str(self.root)
                    ),
                    patch.object(smoke_cli, "run_process") as run,
                ):
                    default = self.root / "data-gym-cache"
                    default.mkdir(exist_ok=True)
                    (default / smoke_cli.TOKENIZER_CACHE_KEY).write_bytes(self.data)
                    smoke_cli.prepare_tokenizer(Path(work), self.env)
                run.assert_not_called()

    def test_corrupt_host_cache_is_preserved_and_download_is_isolated(self):
        self.source.write_bytes(b"corrupt")
        before = self.source.stat().st_mtime_ns
        host = {
            "TIKTOKEN_CACHE_DIR": str(self.host_cache),
            "HTTPS_PROXY": "http://proxy.invalid:3128",
            "REQUESTS_CA_BUNDLE": "/synthetic/ca.pem",
            "OPENAI_API_KEY": "synthetic-host-key",
            "LANGSMITH_API_KEY": "synthetic-tracing-key",
            "HOME": "/synthetic/host-home",
        }
        with (
            patch.dict(os.environ, host, clear=True),
            patch.object(smoke_cli, "run_process") as run,
        ):
            smoke_cli.prepare_tokenizer(self.work, self.env)
        args, kwargs = run.call_args
        self.assertIn("tiktoken.get_encoding('cl100k_base')", args[0][-1])
        self.assertIn("-I", args[0])
        self.assertEqual(kwargs["timeout"], 60)
        self.assertEqual(kwargs["cwd"], self.work)
        child = kwargs["env"]
        self.assertEqual(child["HTTPS_PROXY"], host["HTTPS_PROXY"])
        self.assertEqual(child["REQUESTS_CA_BUNDLE"], host["REQUESTS_CA_BUNDLE"])
        self.assertEqual(child["HOME"], str(self.work))
        self.assertNotIn("OPENAI_API_KEY", child)
        self.assertNotIn("LANGSMITH_API_KEY", child)
        self.assertNotIn("HTTPS_PROXY", self.env)
        self.assertEqual(self.source.read_bytes(), b"corrupt")
        self.assertEqual(self.source.stat().st_mtime_ns, before)

    def test_explicit_disabled_cache_does_not_fall_back_to_host_cache(self):
        self.source.write_bytes(self.data)
        with (
            patch.dict(
                os.environ,
                {"TIKTOKEN_CACHE_DIR": "", "DATA_GYM_CACHE_DIR": str(self.host_cache)},
                clear=True,
            ),
            patch.object(smoke_cli, "run_process") as run,
        ):
            smoke_cli.prepare_tokenizer(self.work, self.env)
        run.assert_called_once()

    def test_download_timeout_is_not_swallowed(self):
        with (
            patch.dict(os.environ, {"TIKTOKEN_CACHE_DIR": ""}, clear=True),
            patch.object(
                smoke_cli,
                "run_process",
                side_effect=subprocess.TimeoutExpired("python", 60),
            ),
            self.assertRaises(subprocess.TimeoutExpired),
        ):
            smoke_cli.prepare_tokenizer(self.work, self.env)


if __name__ == "__main__":
    unittest.main()
