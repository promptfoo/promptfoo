import unittest
from unittest.mock import patch

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda
from langchain_provider import call_api


class LangchainProviderTest(unittest.TestCase):
    def test_returns_text_and_api_token_usage(self):
        def respond(prompt):
            messages = prompt.to_messages()
            self.assertIn("Acme Corp", messages[0].content)
            self.assertEqual(messages[-1].content, "Hello")
            return AIMessage(
                content=[{"type": "text", "text": "Welcome"}],
                usage_metadata={
                    "input_tokens": 40,
                    "output_tokens": 12,
                    "total_tokens": 52,
                },
            )

        with patch(
            "langchain_provider.ChatOpenAI", return_value=RunnableLambda(respond)
        ):
            response = call_api("Hello", {}, {})
        self.assertEqual(response["output"], "Welcome")
        self.assertEqual(
            response["tokenUsage"], {"total": 52, "prompt": 40, "completion": 12}
        )

    def test_does_not_invent_usage_when_api_omits_it(self):
        model = RunnableLambda(lambda _: AIMessage(content="Welcome"))
        with patch("langchain_provider.ChatOpenAI", return_value=model):
            self.assertEqual(call_api("Hello", {}, {}), {"output": "Welcome"})

    def test_preserves_reasoning_breakdown_without_changing_totals(self):
        for reasoning in (0, 7):
            with self.subTest(reasoning=reasoning):
                message = AIMessage(
                    content="Welcome",
                    usage_metadata={
                        "input_tokens": 40,
                        "output_tokens": 12,
                        "total_tokens": 52,
                        "output_token_details": {"reasoning": reasoning},
                    },
                )
                with patch(
                    "langchain_provider.ChatOpenAI",
                    return_value=RunnableLambda(lambda _, value=message: value),
                ):
                    response = call_api("Hello", {}, {})
                self.assertEqual(
                    response["tokenUsage"],
                    {
                        "total": 52,
                        "prompt": 40,
                        "completion": 12,
                        "completionDetails": {"reasoning": reasoning},
                    },
                )

    def test_reports_configuration_errors(self):
        with patch(
            "langchain_provider.ChatOpenAI", side_effect=ValueError("Missing key")
        ):
            self.assertEqual(
                call_api("Hello", {}, {}), {"error": "Missing key", "output": None}
            )

    def test_reports_invocation_errors(self):
        def fail(_):
            raise RuntimeError("Model unavailable")

        with patch("langchain_provider.ChatOpenAI", return_value=RunnableLambda(fail)):
            self.assertEqual(
                call_api("Hello", {}, {}),
                {"error": "Model unavailable", "output": None},
            )


if __name__ == "__main__":
    unittest.main()
