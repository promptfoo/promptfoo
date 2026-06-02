from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from stage_codex_home import (
    MARKER_NAME,
    prepare_codex_home,
    resolve_launcher,
    resolve_marketplace,
    write_config,
)


class StageCodexHomeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.marketplace_root = self.root / "openai-bundled"
        self.plugin_dir = self.marketplace_root / "plugins" / "computer-use"
        (self.plugin_dir / ".codex-plugin").mkdir(parents=True)
        (self.plugin_dir / ".codex-plugin" / "plugin.json").write_text(
            json.dumps({"name": "computer-use"})
        )
        (self.plugin_dir / ".mcp.json").write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "computer-use": {
                            "command": "./launcher",
                            "args": ["mcp"],
                            "cwd": ".",
                        }
                    }
                }
            )
        )
        launcher = self.plugin_dir / "launcher"
        launcher.write_text("#!/bin/sh\n")
        launcher.chmod(0o755)
        marketplace = self.marketplace_root / ".agents" / "plugins" / "marketplace.json"
        marketplace.parent.mkdir(parents=True)
        marketplace.write_text(
            json.dumps(
                {
                    "name": "fixture-marketplace",
                    "plugins": [
                        {
                            "name": "computer-use",
                            "source": {
                                "source": "local",
                                "path": "./plugins/computer-use",
                            },
                        }
                    ],
                }
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_stages_marketplace_and_config(self) -> None:
        codex_home = self.root / "codex-home"
        plugin_dir = self.plugin_dir.resolve()

        resolve_launcher(plugin_dir)
        marketplace_name, marketplace_root = resolve_marketplace(plugin_dir)
        prepare_codex_home(codex_home, force=False)
        config = write_config(codex_home, marketplace_name, marketplace_root)

        self.assertIn(
            '[plugins."computer-use@fixture-marketplace"]', config.read_text()
        )
        self.assertIn('[marketplaces."fixture-marketplace"]', config.read_text())
        self.assertIn(
            f'source = "{self.marketplace_root.resolve()}"', config.read_text()
        )
        self.assertNotIn("auth", config.read_text())
        self.assertEqual(codex_home.stat().st_mode & 0o777, 0o700)

    def test_quotes_dotted_marketplace_names_as_literal_toml_keys(self) -> None:
        codex_home = self.root / "codex-home"
        prepare_codex_home(codex_home, force=False)

        config = write_config(
            codex_home, "fixture.marketplace", self.marketplace_root.resolve()
        )

        config_text = config.read_text()
        self.assertIn('[marketplaces."fixture.marketplace"]', config_text)
        self.assertNotIn("[marketplaces.fixture.marketplace]", config_text)

    def test_rejects_incomplete_plugin(self) -> None:
        (self.plugin_dir / "launcher").unlink()

        with self.assertRaisesRegex(ValueError, "launcher must be a file"):
            resolve_launcher(self.plugin_dir.resolve())

    def test_rejects_non_executable_launcher(self) -> None:
        (self.plugin_dir / "launcher").chmod(0o644)

        with self.assertRaisesRegex(ValueError, "launcher must be executable"):
            resolve_launcher(self.plugin_dir.resolve())

    def test_rejects_launcher_outside_plugin_directory(self) -> None:
        outside_launcher = self.marketplace_root / "launcher"
        outside_launcher.write_text("#!/bin/sh\n")
        outside_launcher.chmod(0o755)
        (self.plugin_dir / ".mcp.json").write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "computer-use": {
                            "command": "../../launcher",
                        }
                    }
                }
            )
        )

        with self.assertRaisesRegex(ValueError, "launcher must be a file inside"):
            resolve_launcher(self.plugin_dir.resolve())

    def test_refuses_to_overwrite_unmarked_directory(self) -> None:
        codex_home = self.root / "codex-home"
        codex_home.mkdir()

        with self.assertRaisesRegex(ValueError, "refusing to overwrite unmarked"):
            prepare_codex_home(codex_home, force=True)

    def test_force_rebuilds_marked_directory(self) -> None:
        codex_home = self.root / "codex-home"
        prepare_codex_home(codex_home, force=False)
        (codex_home / "stale").write_text("old\n")

        prepare_codex_home(codex_home, force=True)

        self.assertTrue((codex_home / MARKER_NAME).is_file())
        self.assertFalse((codex_home / "stale").exists())

    def test_rejects_plugin_without_marketplace_root(self) -> None:
        loose_plugin = self.root / "loose" / "computer-use"
        loose_plugin.mkdir(parents=True)

        with self.assertRaisesRegex(ValueError, "must belong to a bundled marketplace"):
            resolve_marketplace(loose_plugin.resolve())

    def test_rejects_unsafe_marketplace_name(self) -> None:
        marketplace = self.marketplace_root / ".agents" / "plugins" / "marketplace.json"
        marketplace.write_text(json.dumps({"name": 'bad"name', "plugins": []}))

        with self.assertRaisesRegex(ValueError, "marketplace name"):
            resolve_marketplace(self.plugin_dir.resolve())


if __name__ == "__main__":
    unittest.main()
