from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from probe_plugin_list import build_probe_env


class ProbePluginListTest(unittest.TestCase):
    def test_build_probe_env_excludes_shell_secrets(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CODEX_HOME": "/tmp/original-codex-home",
                "GITHUB_TOKEN": "github-secret",
                "HOME": "/tmp/home",
                "OPENAI_API_KEY": "openai-secret",
                "PATH": "/bin",
            },
            clear=True,
        ):
            env = build_probe_env(Path("/tmp/generated-codex-home"))

        self.assertEqual(
            env,
            {
                "CODEX_HOME": "/tmp/generated-codex-home",
                "HOME": "/tmp/home",
                "PATH": "/bin",
            },
        )


if __name__ == "__main__":
    unittest.main()
