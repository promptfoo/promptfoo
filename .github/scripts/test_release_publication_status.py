import base64
import json
import unittest
from unittest.mock import patch

import release_publication_status as status

VERSION = "7.2.1"
SHA = "a" * 40
MIRROR_SHA = "b" * 40
SOURCE_PR = {
    "merge_commit_sha": SHA,
    "number": 123,
    "merged_at": "today",
    "base": {"ref": "main", "repo": {"full_name": status.SOURCE}},
    "head": {"ref": status.BRANCH + "promptfoo", "repo": {"full_name": status.SOURCE}},
    "user": {"login": status.BOT},
}
SUCCESS = {
    "status": "completed",
    "conclusion": "success",
    "html_url": "https://github.com/run",
}


class PublicationTests(unittest.TestCase):
    def test_dispatch_cannot_target_an_unrelated_or_unmerged_pr(self):
        for change in (
            {"user": {"login": "other-bot"}},
            {"merged_at": None},
            {"head": {**SOURCE_PR["head"], "repo": {"full_name": "fork/promptfoo"}}},
            {"head": {**SOURCE_PR["head"], "ref": "release/custom"}},
            {"base": {**SOURCE_PR["base"], "ref": "dev"}},
        ):
            with (
                self.subTest(change=change),
                patch.object(
                    status, "github", return_value={**SOURCE_PR, **change}
                ) as api,
            ):
                with self.assertRaises(ValueError):
                    status.update(123)
                self.assertEqual(api.call_count, 1)

    def test_discovery_requires_matching_merge_commit(self):
        with patch.object(
            status,
            "github",
            return_value=[
                SOURCE_PR,
                {**SOURCE_PR, "number": 999, "merge_commit_sha": MIRROR_SHA},
            ],
        ):
            self.assertEqual(status.discover("workflow_run", SHA, None), [123])

    def test_scheduled_reconciliation_recovers_missing_reports_and_skips_completed(
        self,
    ):
        # 1 is an old pending mirror. 2 never received its first status comment.
        # 3 is complete, and the search index hasn't indexed pending PR 4 yet.
        def comment(number):
            return {2: None, 3: {"body": "Published"}, 4: {"body": status.PENDING}}[
                number
            ]

        with (
            patch.object(
                status,
                "github",
                side_effect=[[{"number": 1}], [{"number": n} for n in (1, 2, 3, 4)]],
            ),
            patch.object(status, "status_comment", side_effect=comment),
        ):
            self.assertEqual(status.discover("schedule", None, None), [1, 2, 4])

    def test_visible_artifacts_do_not_hide_a_running_source_workflow(self):
        with (
            patch.object(status, "version_at", return_value=VERSION),
            patch.object(
                status, "workflow", return_value={**SUCCESS, "status": "in_progress"}
            ),
            patch.object(status, "npm_published", return_value=True),
            patch.object(status, "docker_digest", return_value="sha256:" + "e" * 64),
        ):
            self.assertIn(status.PENDING, status.report(SOURCE_PR))

    def test_cli_uses_artifacts_even_after_a_failed_source_workflow(self):
        with (
            patch.object(status, "version_at", return_value=VERSION),
            patch.object(
                status, "workflow", return_value={**SUCCESS, "conclusion": "failure"}
            ),
            patch.object(status, "npm_published", return_value=True),
            patch.object(status, "docker_digest", return_value=None) as docker,
        ):
            first = status.report(SOURCE_PR)
            self.assertIn(f"promptfoo@{VERSION}", first)
            self.assertIn("Failed (failure)", first)
            self.assertIn("Missing after publication run", first)
            self.assertIn(status.PENDING, first)
            docker.return_value = "sha256:" + "e" * 64
            final = status.report(SOURCE_PR)
            self.assertIn(docker.return_value, final)
            self.assertNotIn(status.PENDING, final)
            docker.assert_called_with(VERSION)

    def test_update_preserves_other_comments_and_skips_unchanged_body(self):
        body = f"{status.MARKER}\nNew status"
        for owned, expected_method in [(None, "POST"), ("Old", "PATCH"), (body, None)]:
            comments = [{"id": 3, "body": body, "user": {"login": "someone"}}]
            if owned is not None:
                comments.append(
                    {
                        "id": 9,
                        "body": owned if owned == body else status.MARKER + owned,
                        "user": {"login": "github-actions[bot]"},
                    }
                )
            with (
                self.subTest(owned=owned),
                patch.object(
                    status, "github", side_effect=[SOURCE_PR, comments, {}]
                ) as api,
                patch.object(status, "report", return_value=body),
            ):
                status.update(123)
                if expected_method is None:
                    self.assertEqual(api.call_count, 2)
                else:
                    self.assertEqual(
                        api.call_args.kwargs,
                        {"method": expected_method, "body": {"body": body}},
                    )
                    if expected_method == "PATCH":
                        self.assertTrue(api.call_args.args[0].endswith("comments/9"))

    def test_first_outage_creates_a_reconcilable_report(self):
        with (
            patch.object(status, "github", side_effect=[SOURCE_PR, [], {}]) as api,
            patch.object(status, "report", side_effect=OSError("registry unavailable")),
        ):
            with self.assertRaises(OSError):
                status.update(123)
            self.assertIn(status.PENDING, api.call_args.kwargs["body"]["body"])

    def test_annotated_and_lightweight_tags(self):
        target = {"type": "commit", "sha": MIRROR_SHA}
        for responses in (
            [{"object": target}],
            [{"object": {"type": "tag", "sha": "c" * 40}}, {"object": target}],
        ):
            with patch.object(status, "github", side_effect=responses):
                self.assertEqual(status.tag_commit("v" + VERSION), MIRROR_SHA)

    def test_mirror_requires_verified_merge_release_and_source_sha(self):
        pr = {
            "number": 72,
            "merged_at": None,
            "state": "open",
            "user": {"login": status.BOT},
            "head": {"sha": "d" * 40, "repo": {"full_name": status.MIRROR}},
            "html_url": "https://github.com/mirror/pull/72",
            "merge_commit_sha": MIRROR_SHA,
        }
        manifest = {
            "repository": status.SOURCE,
            "sourceSha": SHA,
            "sourceTag": "code-scan-action-" + VERSION,
            "version": VERSION,
            "packagePath": "code-scan-action",
        }

        def api(path, **kwargs):
            if "/pulls?" in path:
                return [pr]
            if "/releases/tags/" in path:
                return {"draft": False}
            self.assertIn("contents/.release-source.json?ref=" + MIRROR_SHA, path)
            return {"content": base64.b64encode(json.dumps(manifest).encode()).decode()}

        with (
            patch.object(status, "github", side_effect=api),
            patch.object(status, "workflow", return_value=SUCCESS) as workflow,
            patch.object(status, "tag_commit", return_value=MIRROR_SHA),
        ):
            rows, verified = status.action_rows(VERSION, SHA, SUCCESS)
            self.assertFalse(verified)
            self.assertIn("Pending mirror merge", rows[-1])
            pr["merged_at"] = "today"
            self.assertTrue(status.action_rows(VERSION, SHA, SUCCESS)[1])
            manifest["sourceSha"] = MIRROR_SHA
            self.assertIn(
                "Failed source verification",
                status.action_rows(VERSION, SHA, SUCCESS)[0][-1],
            )
            manifest["sourceSha"] = SHA
            workflow.return_value = {**SUCCESS, "conclusion": "failure"}
            rows, verified = status.action_rows(VERSION, SHA, SUCCESS)
            self.assertFalse(verified)
            self.assertIn("verification incomplete", rows[-1])
