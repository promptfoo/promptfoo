"""Exercise the workflow's real selector against temporary Git histories."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from python_example_manifests import SCRIPTS, WORKFLOW

SELECTOR = Path(__file__).with_name("python_example_manifests.py")


class ManifestSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Workflow fixture")
        self.git("config", "user.email", "fixture@example.test")
        for path in (
            "examples/unchanged/requirements.txt",
            "examples/deleted/requirements.txt",
            "examples/renamed/requirements-old.txt",
            "examples/project with spaces/pyproject.toml",
            "outside/requirements.txt",
        ):
            self.write(
                path,
                '[project]\nname = "fixture"\n'
                if path.endswith("toml")
                else "fixture\n",
            )
        self.write("examples/tool-only/pyproject.toml", "[tool.ruff]\n")
        self.base = self.commit()

    def git(self, *args: str) -> str:
        return subprocess.check_output(["git", *args], cwd=self.root, text=True).strip()

    def write(self, path: str, text: str = "fixture\n") -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def commit(self) -> str:
        self.git("add", ".")
        self.git("commit", "-qm", "Fixture change")
        return self.git("rev-parse", "HEAD")

    def selected(self, base: str, head: str) -> list[str]:
        output = self.root / "outputs"
        output.write_text("")
        subprocess.run(
            [sys.executable, str(SELECTOR)],
            cwd=self.root,
            check=True,
            env=dict(
                os.environ, BASE_SHA=base, HEAD_SHA=head, GITHUB_OUTPUT=str(output)
            ),
        )
        values = dict(line.split("=", 1) for line in output.read_text().splitlines())
        rows = json.loads(values["matrix"])["include"]
        self.assertEqual(values["any"], str(bool(rows)).lower())
        return [row["manifest"] for row in rows]

    def test_workflow_or_selector_changes_select_all_tracked_manifests(self) -> None:
        (self.root / "examples/deleted/requirements.txt").unlink()
        for changed_path in (WORKFLOW, *SCRIPTS):
            with self.subTest(path=changed_path):
                self.write(changed_path)
                head = self.commit()
                self.write("examples/untracked/requirements.txt")
                self.assertEqual(
                    self.selected(self.base, head),
                    [
                        "examples/project with spaces/pyproject.toml",
                        "examples/renamed/requirements-old.txt",
                        "examples/unchanged/requirements.txt",
                    ],
                )
                (self.root / "examples/untracked/requirements.txt").unlink()
                self.base = head

    def test_manifest_changes_use_merge_base_and_ignore_deletions(self) -> None:
        (self.root / "examples/deleted/requirements.txt").unlink()
        (self.root / "examples/renamed/requirements-old.txt").rename(
            self.root / "examples/renamed/requirements.txt"
        )
        self.write(
            "examples/project with spaces/pyproject.toml",
            '[project]\nname = "changed"\n',
        )
        self.write(
            "examples/tool-only/pyproject.toml", "[tool.ruff]\nline-length = 90\n"
        )
        self.write("outside/requirements.txt", "changed\n")
        head = self.commit()
        self.git("checkout", "-qb", "base-tip", self.base)
        self.write("examples/unchanged/requirements.txt", "base only\n")
        base_tip = self.commit()
        self.git("checkout", "-q", head)
        self.assertEqual(
            self.selected(base_tip, head),
            [
                "examples/project with spaces/pyproject.toml",
                "examples/renamed/requirements.txt",
            ],
        )
        self.assertEqual(self.selected(head, head), [])


if __name__ == "__main__":
    unittest.main()
