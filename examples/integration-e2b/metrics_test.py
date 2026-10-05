"""Metrics retain repeated results without using labels as filesystem paths."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from metrics import write_metrics
from report import gen_report


class MetricsTest(unittest.TestCase):
    def test_repeated_labels_preserve_both_results_and_report_identity(self):
        task = 'CON/\\:*?"<> café ' + "x" * 300
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"PROMPTFOO_RESULTS_DIR": directory}):
                paths = [
                    Path(
                        write_metrics(task, "test-provider", "test-model", passed, 0.25)
                    )
                    for passed in (True, False)
                ]
            self.assertNotEqual(*paths)
            self.assertEqual(len(list(Path(directory).glob("*.json"))), 2)
            for path, passed in zip(paths, (True, False)):
                self.assertEqual(path.parent, Path(directory))
                self.assertRegex(path.name, r"^metrics_[0-9a-f]{32}\.json$")
                data = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(data["task_id"], task)
                self.assertEqual(data["provider"], "test-provider")
                self.assertEqual(data["model"], "test-model")
                self.assertEqual(data["success"], passed)
                self.assertEqual(data["runtime_s"], 0.25)

            report = Path(directory) / "report.md"
            gen_report(directory, report)
            contents = report.read_text(encoding="utf-8")
            self.assertIn("| task | provider | model | success | runtime_s |", contents)
            for passed in (True, False):
                self.assertIn(
                    f"|{task}|test-provider|test-model|{passed}|0.25|", contents
                )


if __name__ == "__main__":
    unittest.main()
