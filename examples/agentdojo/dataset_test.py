#!/usr/bin/env python3
"""Tests for AgentDojo dataset generation."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import dataset


class DatasetTests(unittest.TestCase):
    def test_generate_tests_limits_smoke_slice_and_keeps_descriptions(self):
        suite = SimpleNamespace(
            user_tasks={
                "user_task_0": SimpleNamespace(PROMPT="Benign request"),
                "user_task_1": SimpleNamespace(PROMPT="Another request"),
            },
            injection_tasks={
                "injection_task_0": SimpleNamespace(GOAL="Malicious goal"),
                "injection_task_1": SimpleNamespace(GOAL="Another goal"),
            },
        )
        with patch("agentdojo.task_suite.get_suite", return_value=suite):
            rows = dataset.generate_tests(
                {
                    "suite": "workspace",
                    "version": "v1.2.2",
                    "max_user_tasks": 1,
                    "max_injection_tasks": 1,
                }
            )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["vars"]["user_prompt"], "Benign request")
        self.assertEqual(rows[0]["vars"]["injection_goal"], "Malicious goal")


if __name__ == "__main__":
    unittest.main()
