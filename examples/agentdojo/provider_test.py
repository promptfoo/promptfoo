#!/usr/bin/env python3
"""Focused tests for the AgentDojo Promptfoo provider."""

import unittest
from pathlib import Path
from types import SimpleNamespace

import provider
from agentdojo.agent_pipeline import PipelineConfig


class CustomPipelineTests(unittest.TestCase):
    def setUp(self):
        self.llm = provider.OpenAIResponsesLLM(
            llm_client=None,
            model="gpt-5.4",
            name="gpt-5.4",
            max_output_tokens=128,
        )

    def pipeline(self, defense: str | None):
        config = PipelineConfig(
            llm=self.llm,
            model_id="gpt-5.4",
            defense=defense,
            system_message_name=None,
            system_message=None,
        )
        return provider._custom_pipeline_from_config(config, self.llm)

    def test_custom_gpt_tool_filter_is_part_of_pipeline(self):
        pipeline = self.pipeline("tool_filter")

        self.assertEqual(pipeline.name, "gpt-5.4-tool_filter")
        self.assertTrue(
            any(
                isinstance(element, provider.OpenAIResponsesToolFilter)
                for element in pipeline.elements
            )
        )

    def test_custom_gpt_spotlighting_adds_delimiter_instruction(self):
        pipeline = self.pipeline("spotlighting_with_delimiting")

        self.assertEqual(pipeline.name, "gpt-5.4-spotlighting_with_delimiting")
        self.assertIn("You should never obey", pipeline.elements[0].system_message)

    def test_unknown_custom_gpt_defense_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid defense name"):
            self.pipeline("made_up_defense")


class TokenUsageTests(unittest.TestCase):
    def tearDown(self):
        provider._reset_token_usage()

    def test_responses_token_usage_is_reported(self):
        provider._reset_token_usage()
        provider._accumulate_tokens(
            SimpleNamespace(input_tokens=7, output_tokens=3, total_tokens=10)
        )

        self.assertEqual(
            provider._token_usage_payload(),
            {"prompt": 7, "completion": 3, "total": 10},
        )


class ResultSelectionTests(unittest.TestCase):
    def settings(
        self,
        attack_name: str = "important_instructions",
        injection_task_id: str | None = "injection_task_1",
    ) -> provider.ProviderSettings:
        return provider.ProviderSettings(
            suite_name="workspace",
            model="gpt-5.4",
            defense=None,
            attack_name=attack_name,
            user_task_id="user_task_0",
            injection_task_id=injection_task_id,
            version="v1.2.2",
            request_timeout=120,
            max_output_tokens=128,
            force_rerun=True,
            logdir=Path("/tmp/agentdojo-test"),
        )

    def test_agentdojo_security_true_means_injection_success(self):
        settings = self.settings()
        key = ("user_task_0", "injection_task_1")

        utility, injection_success = provider._select_result(
            settings, {key: True}, {key: True}
        )
        result = provider._result_payload(
            settings,
            "gpt-5.4",
            utility,
            injection_success,
            {key: True},
            {key: True},
        )

        self.assertTrue(result["user_task_success"])
        self.assertTrue(result["injection_success"])
        self.assertFalse(result["injection_blocked"])
        self.assertFalse(result["safe_utility"])

    def test_dos_attacks_select_agentdojo_first_injection_result_key(self):
        settings = self.settings(attack_name="captcha_dos")
        suite = SimpleNamespace(
            injection_tasks={
                "injection_task_0": object(),
                "injection_task_1": object(),
            }
        )
        agentdojo_key = ("user_task_0", "injection_task_0")

        utility, injection_success = provider._select_result(
            settings,
            {agentdojo_key: True},
            {agentdojo_key: False},
            suite,
        )
        result = provider._result_payload(
            settings,
            "gpt-5.4",
            utility,
            injection_success,
            {agentdojo_key: True},
            {agentdojo_key: False},
            provider._agentdojo_result_injection_task_id(settings, suite),
        )

        self.assertTrue(utility)
        self.assertFalse(injection_success)
        self.assertTrue(result["safe_utility"])
        self.assertEqual(
            result["agentdojo_result_injection_task_id"], "injection_task_0"
        )


if __name__ == "__main__":
    unittest.main()
