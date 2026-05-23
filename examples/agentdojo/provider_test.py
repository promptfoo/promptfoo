#!/usr/bin/env python3
"""Focused tests for the AgentDojo Promptfoo provider."""

import unittest
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


if __name__ == "__main__":
    unittest.main()
