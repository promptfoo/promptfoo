"""Run the unchanged example cases through the built CLI and real Docker assertions."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

EXAMPLE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[4]


class DockerCliTest(unittest.TestCase):
    def run_eval(self, wrong=False):
        with tempfile.TemporaryDirectory(prefix="docker-example-cli-") as temporary:
            output = Path(temporary) / "results.json"
            env_file = Path(temporary) / "empty.env"
            env_file.touch()
            command = [
                "node",
                str(ROOT / "dist/src/entrypoint.js"),
                "eval",
                "-c",
                str(EXAMPLE / "promptfooconfig.yaml"),
                "--providers",
                "file://" + str(Path(__file__).with_name("code_provider.py")),
                "--no-cache",
                "--no-share",
                "--max-concurrency",
                "1",
                "--env-file",
                str(env_file),
                "-o",
                str(output),
            ]
            if wrong:
                command.extend(("--var", "sandbox_fixture_wrong=true"))
            env = dict(
                os.environ,
                PROMPTFOO_CONFIG_DIR=str(Path(temporary) / "state"),
                PROMPTFOO_PYTHON=sys.executable,
                PROMPTFOO_PASS_RATE_THRESHOLD="100",
                PROMPTFOO_DISABLE_SHARING="true",
                PROMPTFOO_DISABLE_TELEMETRY="true",
                PROMPTFOO_DISABLE_UPDATE="true",
                PROMPTFOO_DISABLE_REMOTE_GENERATION="true",
            )
            result = subprocess.run(
                command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=90
            )
            self.assertTrue(output.is_file(), result.stdout + result.stderr)
            rows = json.loads(output.read_text())["results"]["results"]
            self.assertEqual(len(rows), 3, result.stdout + result.stderr)
            self.assertEqual(
                {row["vars"]["function_name"] for row in rows},
                {"factorial", "is_palindrome", "find_largest"},
            )
            for row in rows:
                self.assertIn("code_provider.py", row["provider"]["id"])
                self.assertEqual(row["success"], not wrong)
                self.assertEqual(row["score"], 0 if wrong else 1)
                components = row["gradingResult"]["componentResults"]
                self.assertEqual(len(components), 1)
                self.assertEqual(components[0]["assertion"]["type"], "python")
                self.assertIn(
                    "Incorrect output" if wrong else "Correct output",
                    components[0]["reason"],
                )
                if not wrong:
                    self.assertFalse(row.get("error"))
            if wrong:
                self.assertNotEqual(result.returncode, 0)
            else:
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            print(
                f"Docker CLI: 3/3 {'incorrect outputs rejected' if wrong else 'cases passed'}"
            )

    def test_original_cases_execute_in_docker(self):
        self.run_eval()

    def test_wrong_generated_code_fails_real_assertions(self):
        self.run_eval(wrong=True)


if __name__ == "__main__":
    unittest.main()
