"""Replay release PRs against actual Git history, independent of the runner's checkout."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from release_history import check, run

ACTION = "code-scan-action"
ACTION_LOG = Path(ACTION, "CHANGELOG.md")
CLI_LOG = Path("CHANGELOG.md")


class ReleaseHistoryTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(tmp.name)
        env = patch.dict(
            os.environ,
            GH_TOKEN="",
            GITHUB_REPOSITORY="promptfoo/promptfoo",
            GITHUB_BASE_REF="main",
        )
        env.start()
        self.addCleanup(env.stop)
        run("git", "init", "--quiet", "--initial-branch=main")
        for key, value in (
            ("user.name", "Test"),
            ("user.email", "test@example.com"),
            ("core.hooksPath", os.devnull),
            ("commit.gpgSign", "false"),
        ):
            run("git", "config", key, value)
        Path(ACTION).mkdir()
        self.versions()
        self.commit("chore: initial releases")
        run("git", "tag", "1.0.0")
        run("git", "tag", f"{ACTION}-0.2.2")

    def versions(self, cli="1.0.0", action="0.2.2"):
        Path(".release-please-manifest.json").write_text(
            json.dumps({".": cli, ACTION: action})
        )

    def commit(self, subject):
        run("git", "add", ".")
        run("git", "commit", "--allow-empty", "-qm", subject)
        return run("git", "rev-parse", "HEAD").strip()

    def test_shared_fix_beyond_500_commits_needs_both_references(self):
        Path(ACTION, "scan").write_text("shared fix")
        Path("cli").write_text("shared fix")
        shared = self.commit("fix(ci): secure code-scan action releases (#10108)")
        # Fast-import avoids running 505 separate git-commit processes in CI.
        stream = []
        for i in range(505):
            parent = f"from {shared}\n" if i == 0 else ""
            stream.append(
                f"commit refs/heads/main\ncommitter Test <test@example.com> {1700000000 + i} +0000\ndata 10\ndocs: noop\n{parent}\n"
            )
        run("git", "fast-import", "--quiet", data="".join(stream))
        Path("code-scan-action-other").write_text("CLI only")
        base = self.commit("feat: new CLI feature (#222)")
        self.versions("1.0.1", "0.2.3")
        CLI_LOG.write_text("## [1.0.1]\n\nShared fix #10108\n")
        ACTION_LOG.write_text(
            "## [0.2.3]\n\n[#10108](https://github.com/other/repo/pull/10108)\n<!-- #10108 -->\n\n## [0.2.2]\n\n#10108\n"
        )
        with self.assertRaises(ValueError) as failure:
            check(base, self.commit("chore(main): release"))
        self.assertIn(f"CHANGELOG.md (1.0.1): {base}", str(failure.exception))
        self.assertIn(
            f"{ACTION}/CHANGELOG.md (0.2.3): {shared}", str(failure.exception)
        )
        self.assertNotIn(
            f"{ACTION}/CHANGELOG.md (0.2.3): {base}", str(failure.exception)
        )
        CLI_LOG.write_text(f"## [1.0.1]\n\nShared fix #10108 and {base[:9]}\n")
        ACTION_LOG.write_text(
            "## [0.2.3]\n\n[Security fix](https://github.com/promptfoo/promptfoo/issues/10108)\n"
        )
        check(base, self.commit("docs: link both changes"))

    def test_rewritten_pr_link_for_breaking_change_after_revert(self):
        Path("tentative").write_text("reverted before release")
        feature = self.commit("feat: tentative change (#10)")
        run("git", "revert", "--no-edit", feature)
        base = self.commit("refactor(api)!: remove old API")
        self.versions("1.0.1")
        CLI_LOG.write_text(
            "## [1.0.1]\n\n[Upgrade steps](https://github.com/promptfoo/promptfoo/pull/99)\n"
        )
        head = self.commit("chore(main): release")
        with self.assertRaisesRegex(ValueError, base) as failure:
            check(base, head)
        self.assertNotIn(feature, str(failure.exception))
        pr = {
            "number": 99,
            "merged_at": "2026-01-01",
            "base": {"ref": "main", "repo": {"full_name": "promptfoo/promptfoo"}},
        }
        with (
            patch.dict(os.environ, GH_TOKEN="fixture"),
            patch("release_history.gh", return_value=[pr]) as gh,
        ):
            check(base, head)
            gh.assert_called_once_with(
                f"repos/promptfoo/promptfoo/commits/{base}/pulls?per_page=100"
            )

    def test_revert_of_revert_restores_the_original_feature(self):
        Path("feature").write_text("restored")
        feature = self.commit("feat: restored functionality (#19)")
        run("git", "revert", "--no-edit", feature)
        run("git", "revert", "--no-edit", "HEAD")
        base = run("git", "rev-parse", "HEAD").strip()
        self.versions("1.0.1")
        CLI_LOG.write_text("## [1.0.1]\n\nOther changes.\n")
        with self.assertRaisesRegex(ValueError, feature):
            check(base, self.commit("chore(main): release"))
        CLI_LOG.write_text("## [1.0.1]\n\nRestored functionality (#19).\n")
        check(base, self.commit("docs: acknowledge restored feature"))

    def test_action_uses_its_tag_and_checks_new_base_changes(self):
        Path(ACTION, "scanner").write_text("feature")
        original = self.commit("feat: extend scanner (#567)")
        self.versions("1.0.1")
        self.commit("chore(main): release 1.0.1")
        run("git", "tag", "1.0.1")
        run("git", "switch", "-qc", "release-action")
        self.versions("1.0.1", "0.2.3")
        ACTION_LOG.write_text("## [0.2.3]\n\nScanner updates #567\n")
        candidate = self.commit("chore(main): release action")
        run("git", "switch", "-q", "main")
        Path(ACTION, "scanner").write_text("target branch fix")
        base = self.commit("fix: include new action correction (#568)")
        with self.assertRaisesRegex(ValueError, base):
            check(base, candidate)
        run("git", "switch", "-q", "release-action")
        ACTION_LOG.write_text("## [0.2.3]\n\nLatest fixes #568\n")
        with self.assertRaisesRegex(ValueError, original):
            check(base, self.commit("docs: reference latest fix"))
        ACTION_LOG.write_text(
            "## [0.2.3]\n\nScanner functionality and corrections #567 #568\n"
        )
        head = self.commit("docs: link both changes")
        check(base, head)
        run("git", "switch", "-q", "main")
        self.versions("1.0.1", "0.2.3")
        newer = self.commit("chore(main): release code-scan-action 0.2.3")
        with self.assertRaisesRegex(ValueError, "already released 0.2.3"):
            check(newer, head)
