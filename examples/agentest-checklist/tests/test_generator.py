"""Offline regression tests for the checklist CSV converter."""

import io
import json
import os
import runpy
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

GENERATOR = Path(__file__).resolve().parents[1] / "promptfoo_tests_from_hf.py"
CSV = b"""example_id,title,scenario,input,expected_behavior,test_id,severity
A,First,Scenario A,"Input, with comma",Expected A,T1,high
B,Second,Scenario B,Input B,Expected B,T2,low
"""


class GeneratorTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(directory.name)
        self.output = Path("tests.json")

    def run_generator(self, *args):
        with patch.object(sys, "argv", [str(GENERATOR), *args]):
            runpy.run_path(str(GENERATOR), run_name="__main__")

    def test_maps_csv_and_applies_optional_limit(self):
        for args, descriptions in [
            ((), ["A First", "B Second"]),
            (("1",), ["A First"]),
        ]:
            with (
                self.subTest(args=args),
                patch("urllib.request.urlopen", return_value=io.BytesIO(CSV)),
            ):
                self.run_generator(*args)
                cases = json.loads(self.output.read_text(encoding="utf-8"))
                self.assertEqual([case["description"] for case in cases], descriptions)
                self.assertEqual(
                    cases[0]["vars"],
                    {"scenario": "Scenario A", "input": "Input, with comma"},
                )
                self.assertEqual(
                    cases[0]["assert"], [{"type": "llm-rubric", "value": "Expected A"}]
                )
                self.assertEqual(
                    cases[0]["metadata"], {"test_id": "T1", "severity": "high"}
                )

    def test_rejects_invalid_limits_before_download_or_overwrite(self):
        self.output.write_text("prior suite", encoding="utf-8")
        for args in [("-1",), ("0",), ("wrong",), ("1", "2")]:
            with self.subTest(args=args), patch("urllib.request.urlopen") as download:
                with (
                    redirect_stderr(io.StringIO()),
                    self.assertRaises(SystemExit) as error,
                ):
                    self.run_generator(*args)
                self.assertEqual(error.exception.code, 2)
                download.assert_not_called()
                self.assertEqual(self.output.read_text(encoding="utf-8"), "prior suite")
