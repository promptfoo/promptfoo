"""Keep the local CLI fixture independent of developer credentials and state."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import smoke_cli


class StopBeforeIngestion(Exception):
    pass


class SmokeEnvironmentTests(unittest.TestCase):
    def inspect_child_environment(self, check):
        with tempfile.TemporaryDirectory(prefix="rag-synthetic-host-") as directory:
            host = {
                "PATH": os.defpath,
                "HOME": directory,
                "LANGCHAIN_TRACING": "true",
                "LANGSMITH_API_KEY": "synthetic-tracing-key",
                "ANTHROPIC_API_KEY": "synthetic-provider-key",
                "DOTENV_OVERRIDE": "true",
                "DOTENV_CONFIG_PATH": str(Path(directory) / "host.env"),
                "PROMPTFOO_PASS_RATE_THRESHOLD": "0",
            }

            def inspect(_command, *, cwd, env, timeout):
                check(Path(cwd), env)
                raise StopBeforeIngestion

            with (
                patch.dict(os.environ, host, clear=True),
                patch.object(smoke_cli, "ThreadingHTTPServer"),
                patch.object(smoke_cli.threading, "Thread"),
                patch.object(smoke_cli, "prepare_tokenizer"),
                patch.object(smoke_cli, "run_process", side_effect=inspect),
                self.assertRaises(StopBeforeIngestion),
            ):
                smoke_cli.main()

    def test_smoke_does_not_inherit_credentials_or_runtime_settings(self):
        def check(_work, env):
            for key in (
                "LANGCHAIN_TRACING",
                "LANGSMITH_API_KEY",
                "ANTHROPIC_API_KEY",
                "DOTENV_OVERRIDE",
                "DOTENV_CONFIG_PATH",
            ):
                self.assertNotIn(key, env)
            self.assertEqual(env["OPENAI_API_KEY"], "local-smoke-key")
            self.assertEqual(env["LANGSMITH_TRACING"], "false")
            self.assertEqual(env["LANGCHAIN_TRACING_V2"], "false")
            self.assertEqual(env["PROMPTFOO_PASS_RATE_THRESHOLD"], "100")

        self.inspect_child_environment(check)

    def test_smoke_paths_are_temporary_and_default_env_file_is_empty(self):
        paths = []

        def check(work, env):
            for key in ("HOME", "USERPROFILE", "XDG_STATE_HOME", "TMPDIR"):
                path = Path(env[key])
                self.assertTrue(path.is_relative_to(work), key)
                self.assertTrue(path.is_dir(), key)
                paths.append(path)
            env_file = Path(env["DOTENV_PATH"])
            self.assertTrue(env_file.is_relative_to(work))
            self.assertEqual(env_file.read_bytes(), b"")
            paths.append(env_file)

        self.inspect_child_environment(check)
        self.assertTrue(paths)
        self.assertTrue(all(not path.exists() for path in paths))


if __name__ == "__main__":
    unittest.main()
