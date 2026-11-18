import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import release_publication_status as status

VERSION = "7.2.1"
SOURCE_SHA = "a" * 40
MIRROR_SHA = "b" * 40
PR = {
    "number": 123,
    "merged_at": "today",
    "merge_commit_sha": SOURCE_SHA,
    "user": {"login": status.BOT},
    "base": {"ref": "main", "repo": {"full_name": status.SOURCE}},
    "head": {"ref": status.BRANCH + "promptfoo", "repo": {"full_name": status.SOURCE}},
}
SUCCESS = {
    "status": "completed",
    "conclusion": "success",
    "html_url": "https://github.com/run",
}


class PublicationTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.file = self.directory / "123.json"

    def test_only_a_merged_source_bot_pr_can_be_updated(self):
        for changed in [
            {"merged_at": None},
            {"user": {"login": "other"}},
            {"head": {**PR["head"], "repo": {"full_name": "fork/promptfoo"}}},
            {"head": {**PR["head"], "ref": "other"}},
            {"base": {**PR["base"], "ref": "dev"}},
        ]:
            with (
                patch.object(status, "gh", return_value={**PR, **changed}) as api,
                self.assertRaises(ValueError),
            ):
                try:
                    status.prepare(123, self.directory)
                finally:
                    self.assertEqual(api.call_count, 1)

    def test_candidates_match_merged_sha_or_search_recent_and_pending(self):
        with patch.object(
            status, "gh", return_value=[PR, {**PR, "merge_commit_sha": MIRROR_SHA}]
        ):
            self.assertEqual(status.candidates(None, SOURCE_SHA), [123])
        with patch.object(status, "gh_rows", return_value=[{"number": 123}]) as search:
            self.assertEqual(status.candidates(None, None), [123])
            self.assertIn("advanced_search=true", search.call_args.args[0])
            self.assertIn("merged%3A", search.call_args.args[0])
            self.assertIn("in%3Acomments", search.call_args.args[0])

    def test_cli_reports_registry_evidence_independently_of_workflow(self):
        with (
            patch.object(status, "workflow", return_value=SUCCESS.copy()) as run,
            patch.object(status, "version_at", return_value=VERSION),
            patch.object(
                status,
                "registry",
                return_value={"name": "promptfoo", "version": VERSION},
            ),
            patch.object(status, "docker_digest", return_value=None) as docker,
        ):
            run.return_value["conclusion"] = "failure"
            first = status.report("promptfoo", SOURCE_SHA)
            self.assertIn("Failed (failure)", first)
            self.assertIn("Missing after publication run", first)
            self.assertIn(status.PENDING, first)
            docker.return_value = "sha256:" + "e" * 64
            self.assertIn(docker.return_value, status.report("promptfoo", SOURCE_SHA))
            self.assertNotIn(status.PENDING, status.report("promptfoo", SOURCE_SHA))
            run.return_value["status"] = "in_progress"
            self.assertIn(status.PENDING, status.report("promptfoo", SOURCE_SHA))

    def test_comment_is_written_once_or_updated_by_id(self):
        body = status.MARKER + "\nPublished"
        for owner in ("someone", "github-actions[bot]", status.BOT):
            comment = {"id": 9, "user": {"login": owner}, "body": status.MARKER}
            with (
                patch.object(status, "gh", return_value=PR) as api,
                patch.object(status, "gh_rows", return_value=[comment]),
                patch.object(status, "report", return_value=body) as report,
            ):
                status.prepare(123, self.directory)
                self.assertEqual(api.call_count, 1)
                status.publish(self.file)
                tail, method = (
                    ("123/comments", "POST")
                    if owner == "someone"
                    else ("comments/9", "PATCH")
                )
                api.assert_called_with(
                    f"repos/{status.SOURCE}/issues/{tail}",
                    "--method",
                    method,
                    data={"body": body},
                )
                self.file.unlink()
                if owner == status.BOT:
                    comment["body"] = body
                    status.prepare(123, self.directory)
                    status.prepare(123, self.directory, pending_only=True)
                    self.assertFalse(self.file.exists())
                    self.assertEqual(report.call_count, 2)

    def test_first_registry_outage_leaves_a_publishable_pending_report(self):
        with (
            patch.object(status, "gh", return_value=PR) as api,
            patch.object(status, "gh_rows", return_value=[]),
            patch.object(status, "report", side_effect=OSError("registry unavailable")),
        ):
            with self.assertRaises(OSError):
                status.prepare(123, self.directory)
            self.assertIn(status.PENDING, json.loads(self.file.read_text())["body"])
            api.reset_mock()
            status.publish(self.file)
            endpoint = f"repos/{status.SOURCE}/issues/123/comments"
            self.assertEqual(api.call_args.args, (endpoint, "--method", "POST"))

    def test_mirror_requires_validated_merge_and_matching_public_tag(self):
        pr = {
            **PR,
            "state": "open",
            "merged_at": None,
            "merge_commit_sha": MIRROR_SHA,
            "head": {"sha": "c" * 40, "repo": {"full_name": status.MIRROR}},
            "html_url": "https://github.com/pr",
        }
        origin = {
            "repository": status.SOURCE,
            "sourceSha": SOURCE_SHA,
            "sourceTag": "code-scan-action-" + VERSION,
            "version": VERSION,
            "packagePath": "code-scan-action",
        }
        public = {
            "release": {"isDraft": False},
            "commit": {"oid": MIRROR_SHA},
            "manifest": {"text": json.dumps(origin)},
        }

        def github(path, **kwargs):
            if path == "graphql":
                self.assertEqual(
                    kwargs["data"]["variables"]["commit"],
                    f"refs/tags/v{VERSION}^{{commit}}",
                )
                return {"data": {"repository": public}}
            return [pr]

        def check():
            return status.mirror_rows(VERSION, SOURCE_SHA, SUCCESS)

        with (
            patch.object(status, "gh", side_effect=github),
            patch.object(status, "workflow", return_value=SUCCESS.copy()) as workflow,
        ):
            self.assertIn("Pending mirror merge", check()[0][-1])
            pr["merged_at"] = "today"
            self.assertTrue(check()[1])
            public["release"]["isDraft"] = True
            self.assertFalse(check()[1])
            public["release"]["isDraft"] = False
            public["commit"]["oid"] = SOURCE_SHA
            self.assertIn("Failed source verification", check()[0][-1])
            public["commit"]["oid"] = MIRROR_SHA
            public["manifest"]["text"] = json.dumps({**origin, "sourceSha": MIRROR_SHA})
            self.assertIn("Failed source verification", check()[0][-1])
            public["manifest"]["text"] = json.dumps(origin)
            workflow.return_value["conclusion"] = "failure"
            self.assertIn("verification incomplete", check()[0][-1])
            self.assertFalse(check()[1])
