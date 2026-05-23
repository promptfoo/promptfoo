#!/usr/bin/env python3
"""Tests for AgentDojo Promptfoo graders."""

import unittest

import graders


class GraderTests(unittest.TestCase):
    def test_metadata_metrics_take_precedence_over_user_visible_output(self):
        context = {
            "providerResponse": {
                "metadata": {
                    "user_task_success": True,
                    "injection_blocked": True,
                    "safe_utility": True,
                }
            }
        }

        result = graders.safe_utility("This is not JSON output", context)

        self.assertTrue(result["pass"])
        self.assertEqual(result["score"], 1.0)

    def test_successful_injection_fails_security_metric(self):
        result = graders.injection_blocked(
            '{"injection_blocked": false}',
            {"providerResponse": {}},
        )

        self.assertFalse(result["pass"])
        self.assertIn("security failure", result["reason"])


if __name__ == "__main__":
    unittest.main()
