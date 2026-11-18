"""Release notes must survive bot refreshes and retain usable, reviewed source links."""

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import release_note_links as links
import release_notes as notes

REPO = "promptfoo/promptfoo"
ROOT = f"https://github.com/{REPO}"
HEADER = f"## [1.2.0]({ROOT}/compare/1.1.0...1.2.0) (2026-01-01)"
BODY = f"{HEADER}\n\n### ⚠ BREAKING CHANGES\n\n- New syntax\n\n### Bug Fixes\n\n- Fix a timeout"


class NotesTests(unittest.TestCase):
    def test_extract_only_requested_version_including_details(self):
        changelog = "# Changelog\n\n" + BODY + "\n\n## [1.1.0](link)\n\nOlder content\n"
        self.assertEqual(notes.extract(changelog, "1.2.0"), BODY)
        for invalid in (changelog + "\n" + BODY, HEADER + "\n", "# Changelog\n"):
            with self.assertRaises(ValueError):
                notes.extract(invalid, "1.2.0")

    def test_default_puts_breaking_changes_first_and_preserves_inventory(self):
        result = notes.prepare_section(BODY, "", "promptfoo")
        self.assertLess(
            result.index("### Before upgrading"), result.index(notes.DISCLOSURE)
        )
        self.assertIn("### Before upgrading\n\n- New syntax", result)
        self.assertEqual(
            result.split(notes.DISCLOSURE)[1].strip().removesuffix("\n\n</details>"),
            BODY.partition("\n")[2].strip(),
        )
        self.assertEqual(notes.prepare_section(result, "", "promptfoo"), result)

    def test_formatter_binds_checked_bytes_to_the_version_section(self):
        first = notes.prepare_section(BODY, "", "promptfoo")
        stamped = notes.mark_checked(first)
        notes.verify_checked(stamped)
        self.assertEqual(
            notes.extract(stamped + "\n\n## [1.1.0]\n\nOld notes", "1.2.0"), stamped
        )
        self.assertEqual(
            notes.mark_checked(notes.prepare_section(stamped, "", "promptfoo")), stamped
        )
        for changed in (
            BODY,
            first,
            stamped.replace("New syntax", "Changed wording", 1),
            stamped.replace("### Bug Fixes", "### Fixes"),
        ):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                notes.verify_checked(changed)

    def test_override_survives_repeat_and_bot_refresh(self):
        override = (
            "### Before upgrading\n\nUse the new syntax to keep existing tests working."
        )
        result = notes.prepare_section(BODY, override, "code-scan-action", "3.2.1")
        self.assertEqual(
            notes.prepare_section(result, override, "code-scan-action", "3.2.1"), result
        )
        self.assertIn("promptfoo@3.2.1", result)
        self.assertIn(
            override,
            notes.prepare_section(BODY + "\n- Fix retries", override, "promptfoo"),
        )
        for content in ("## [2.0.0]\nBad", "</details>"):
            with self.assertRaises(ValueError):
                notes.prepare_section(BODY, content, "promptfoo")

    def test_large_pr_preview_keeps_upgrade_and_links_to_full_notes(self):
        overview = (
            HEADER + "\n\n### Before upgrading\n\nInstall the updated dependency."
        )
        large = (
            overview
            + "\n\n"
            + notes.DISCLOSURE
            + "\n\n"
            + "x" * 70000
            + "\n\n</details>"
        )
        preview = notes.pr_preview(
            large, "Review the release notes.", ROOT + "/pull/42/files"
        )
        self.assertIn(overview, preview)
        self.assertIn("/pull/42/files", preview)
        self.assertNotIn(notes.DISCLOSURE, preview)
        long_summary = large.replace(
            "Install the updated dependency.",
            "**Install the updated dependency.** " + "more " * 20000,
        )
        clipped = notes.pr_preview(
            long_summary, "Review the release notes.", ROOT + "/pull/42/files"
        )
        self.assertIn("Install the updated dependency.", clipped)
        self.assertLess(len(clipped.encode()), 65000)
        self.assertIn("/pull/42/files", clipped)

    def test_only_current_writer_can_override(self):
        comments = [
            {
                "body": notes.OVERRIDE + "\n" + who,
                "id": i,
                "updated_at": str(i),
                "user": {"login": who},
            }
            for i, who in enumerate(["writer", "reader"])
        ]
        with patch.object(
            notes,
            "gh",
            side_effect=[comments, {"permission": "read"}, {"permission": "write"}],
        ):
            self.assertEqual(notes.writer_overview(REPO, 42), "writer")

    def test_no_remote_writes_for_other_prs(self):
        pr = {
            "state": "open",
            "base": {"ref": "main"},
            "user": {"login": "example"},
            "head": {
                "sha": "abcd",
                "ref": notes.BRANCH_PREFIX + "promptfoo",
                "repo": {"full_name": REPO},
            },
        }
        with (
            tempfile.TemporaryDirectory() as temp,
            patch.object(notes, "gh", return_value=pr) as api,
        ):
            plan = Path(temp) / "plan"
            notes.prepare(REPO, 1, plan)
            self.assertFalse(plan.exists())
            api.assert_called_once_with(f"repos/{REPO}/pulls/1")

    def test_repair_requires_correct_reachable_commit(self):
        sha = "a" * 40
        commit = f"{ROOT}/commit/{sha}"
        content = f"{HEADER}\n\n- Fix an error ([#123]({ROOT}/issues/123)) ([aaaaaaa]({commit}))"
        with (
            patch.object(links, "issue_types", return_value={123: None}),
            patch.object(subprocess, "run"),
            patch.object(
                subprocess,
                "check_output",
                return_value=f"{sha}\tfix: an error (#123)\n",
            ),
        ):
            result = links.check_links(content, REPO, "1.1.0", "1.2.0", "HEAD")
            self.assertNotIn("/issues/123", result)
            self.assertEqual(result.count(commit), 1)
            with self.assertRaisesRegex(ValueError, "source commit"):
                links.check_links(
                    content.split(" ([aaaa")[0],
                    REPO,
                    "1.1.0",
                    "1.2.0",
                    "HEAD",
                )

    def test_full_500_commit_release_accepts_all_inventory_links(self):
        inventory = "\n".join(
            f"- Fix {n} ([#{n}]({ROOT}/issues/{n})) ([commit]({ROOT}/commit/{n:040x}))"
            for n in range(1, 501)
        )
        section = HEADER + "\n\n" + inventory
        with (
            patch.object(
                links,
                "issue_types",
                return_value=dict.fromkeys(range(1, 501), "PullRequest"),
            ),
            patch.object(subprocess, "run"),
            patch.object(subprocess, "check_output", return_value=""),
        ):
            self.assertEqual(
                links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD"), section
            )

    def test_common_markdown_destinations_and_titles_reach_the_url_validator(self):
        examples = [
            (
                '[Upgrade [guide]](https://example.org/missing "Migration guide")',
                "https://example.org/missing",
            ),
            (
                "[Wiki](https://example.org/wiki/F(a(b)c)#examples 'page')",
                "https://example.org/wiki/F(a(b)c)#examples",
            ),
            (
                r"[Escaped](https://example.org/wiki/F\(a\)?x=1&amp;y=2 (optional title))",
                "https://example.org/wiki/F(a)?x=1&y=2",
            ),
            (
                '[Page](<https://example.org/a b>\n "title")',
                "https://example.org/a%20b",
            ),
        ]
        section = HEADER + "\n\n" + "\n".join(example for example, _ in examples)
        with (
            patch.object(subprocess, "run"),
            patch.object(links, "check_public_url") as check,
        ):
            self.assertEqual(
                links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD"), section
            )
            self.assertEqual(
                {call.args[0] for call in check.call_args_list},
                {url for _, url in examples},
            )
            check.side_effect = ValueError("Missing release-note link anchor")
            with self.assertRaisesRegex(ValueError, "Missing release-note link anchor"):
                links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD")

    def test_repaired_pr_preserves_title_and_other_link_formatting(self):
        sha = "b" * 40
        commit = f"{ROOT}/commit/{sha}"
        section = (
            HEADER
            + f'\n\nReview [notes [API]](<{ROOT}/pull/8> "details") and [source]({commit}).'
        )
        with (
            patch.object(links, "issue_types", return_value={8: None}),
            patch.object(subprocess, "run"),
            patch.object(
                subprocess, "check_output", return_value=f"{sha}\tfix: API docs (#8)\n"
            ),
        ):
            result = links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD")
        self.assertIn(f'[notes [API]](<{commit}> "details")', result)

    def test_malformed_title_cannot_hide_the_next_paragraphs_links(self):
        text = '[a](https://example.org/a "title\n\n[broken](https://example.org/missing)\n\nend")'
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            list(links.inline_links(text))

    def test_code_examples_and_escaped_brackets_are_not_links(self):
        section = (
            HEADER + "\n\nUse `handlers[0]()` or the following example.\n\n"
            '```markdown\n[demo](missing "illustration")\n```\n'
            r"\[escaped](https://example.org/demo)\n"
        )
        with (
            patch.object(subprocess, "run"),
            patch.object(links, "check_public_url") as check,
        ):
            self.assertEqual(
                links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD"), section
            )
            check.assert_not_called()

    def test_invalid_compare_or_private_outbound_link_fails(self):
        with self.assertRaisesRegex(ValueError, "component comparison"):
            links.check_links(BODY, REPO, "1.0.0", "1.2.0", "HEAD")
        with self.assertRaisesRegex(ValueError, "public address"):
            links.check_public_url("https://127.0.0.1/secret")
        with self.assertRaisesRegex(ValueError, "public HTTPS"):
            links.check_public_url("http://example.org/secret")


if __name__ == "__main__":
    unittest.main()
