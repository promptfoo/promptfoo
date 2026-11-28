"""Release notes must survive bot refreshes and retain usable, reviewed source links."""

import json
import os
import subprocess
import tempfile
import unittest
from collections import Counter
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

    def test_required_check_validates_actual_candidate_shape_and_links(self):
        branch = notes.BRANCH_PREFIX + "promptfoo"
        written = notes.prepare_section(BODY, "", "promptfoo")
        with (
            patch.dict(os.environ, {"GITHUB_REPOSITORY": REPO}),
            patch.object(notes, "run", return_value='{".": "1.2.0"}'),
            patch.object(
                notes, "version_at", side_effect=["1.1.0", "1.2.0", "1.2.0"] * 3
            ),
            patch.object(notes, "extract", return_value=written) as section,
            patch.object(notes, "check_links", return_value=written) as check,
        ):
            notes.verify("candidate", branch)
            self.assertEqual(check.call_args.args[0], written)
            check.return_value = written + " corrected"
            with self.assertRaisesRegex(ValueError, "references"):
                notes.verify("candidate", branch)
            section.return_value = BODY
            with self.assertRaisesRegex(ValueError, "overview"):
                notes.verify("candidate", branch)

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
        for content in (
            "## [2.0.0]\nBad",
            "</details>",
            "<!-- empty -->",
            "<!-- don't ship",
            "### Editor heading",
        ):
            with self.assertRaises(ValueError):
                notes.prepare_section(BODY, content, "promptfoo")

    def test_single_disclosure_exact_scanner_pin_and_visible_upgrade_guidance(self):
        with self.assertRaisesRegex(ValueError, "one All changes"):
            notes.prepare_section(BODY + 2 * notes.DISCLOSURE, "", "promptfoo")
        for suffix in ["0", "-beta", ".7"]:
            text = notes.prepare_section(
                BODY, "Install promptfoo@3.2.1" + suffix, "code-scan-action", "3.2.1"
            )
            self.assertIn("installs `promptfoo@3.2.1`", text)
        for overview in [
            "<!-- ### Before upgrading\nFake upgrade -->\n\n### Highlights\n\nA change",
            "### Before upgrading\n\n### Highlights\n\nA change",
        ]:
            text = notes.prepare_section(BODY, overview, "promptfoo")
            self.assertIn("### Before upgrading\n\n- New syntax", text)

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
        with (
            patch.object(
                notes, "run", return_value="\n".join(map(json.dumps, comments))
            ),
            patch.object(
                notes,
                "gh",
                side_effect=[{"permission": "read"}, {"permission": "write"}],
            ),
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

    def test_unavailable_pr_uses_its_verified_commit_without_rewriting_other_markdown(
        self,
    ):
        sha = "a" * 40
        url, commit = f"{ROOT}/issues/123", f"{ROOT}/commit/{sha}"
        compare = ROOT + "/compare/1.1.0...1.2.0"
        source = f'{HEADER}\n\n[API [guide]](<{url}> "Migration") ([#123]({url})) ([aaaaaaa]({commit}))'
        corrected = (
            f'{HEADER}\n\n[API [guide]](<{commit}> "Migration") ([aaaaaaa]({commit}))'
        )
        with (
            patch.object(
                links,
                "rendered_links",
                side_effect=[
                    Counter([compare, url, url, commit]),
                    Counter([compare, commit, commit]),
                ],
            ),
            patch.object(links, "issue_types", return_value={123: None}),
            patch.object(subprocess, "run"),
            patch.object(
                subprocess, "check_output", return_value=f"{sha}\tfix: API (#123)\n"
            ),
        ):
            self.assertEqual(
                links.check_links(source, REPO, "1.1.0", "1.2.0", "HEAD"), corrected
            )
        with (
            patch.object(links, "rendered_links", return_value=Counter([compare, url])),
            patch.object(links, "issue_types", return_value={123: None}),
            patch.object(subprocess, "run"),
        ):
            with self.assertRaisesRegex(ValueError, "source commit"):
                links.check_links(source, REPO, "1.1.0", "1.2.0", "HEAD")

    def test_uses_real_gfm_destinations_and_validates_every_external_link(self):
        section = (
            HEADER
            + '\n\n[ref]: https://example.org/wiki/F(a) "Docs"\n\n[Guide][ref] and `[example](ignored)`'
        )
        rendered = json.dumps(
            {
                "urls": [
                    ROOT + "/compare/1.1.0...1.2.0",
                    "https://example.org/wiki/F(a)",
                ],
                "html": [
                    '<img src="https://example.org/logo.png" data-canonical-src="ignored">'
                ],
            }
        )
        with (
            patch.object(subprocess, "check_output", return_value=rendered) as api,
            patch.object(subprocess, "run"),
            patch.object(links, "check_public_url") as check,
        ):
            self.assertEqual(
                links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD"), section
            )
            self.assertEqual(api.call_args.args[0][0], "node")
            self.assertEqual(set(api.call_args.kwargs["env"]), {"PATH"})
            self.assertEqual(
                {c.args[0] for c in check.call_args_list},
                {"https://example.org/wiki/F(a)", "https://example.org/logo.png"},
            )
            check.side_effect = ValueError("Missing release-note link anchor")
            with self.assertRaisesRegex(ValueError, "Missing release-note link anchor"):
                links.check_links(section, REPO, "1.1.0", "1.2.0", "HEAD")

    def test_invalid_compare_or_private_outbound_link_fails(self):
        with self.assertRaisesRegex(ValueError, "component comparison"):
            links.check_links(BODY, REPO, "1.0.0", "1.2.0", "HEAD")
        with self.assertRaisesRegex(ValueError, "public address"):
            links.check_public_url("https://127.0.0.1/secret")
        with self.assertRaisesRegex(ValueError, "public HTTPS"):
            links.check_public_url("http://example.org/secret")


if __name__ == "__main__":
    unittest.main()
