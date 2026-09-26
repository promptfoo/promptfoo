import unittest
from types import SimpleNamespace
from unittest.mock import patch

import agent
import provider


class ResearchAgentTest(unittest.TestCase):
    def test_real_graph_returns_structured_summary(self):
        with patch.object(agent, "ChatOpenAI") as model:
            model.return_value.invoke.return_value = SimpleNamespace(
                content="Verified summary"
            )
            result = provider.call_api(
                "AI research",
                {
                    "config": {
                        "model": "fixture-model",
                        "apiBaseUrl": "http://127.0.0.1:1234/v1",
                    }
                },
                {},
            )
        self.assertEqual(result["output"]["query"], "AI research")
        self.assertIn("AI research", result["output"]["raw_info"])
        self.assertIn("Verified summary", result["output"]["summary"])
        model.assert_called_once_with(
            model="fixture-model", base_url="http://127.0.0.1:1234/v1"
        )

    def test_model_failure_is_provider_error(self):
        with patch.object(agent, "ChatOpenAI") as model:
            model.return_value.invoke.side_effect = RuntimeError("model unavailable")
            result = provider.call_api("AI research", {}, {})
        self.assertEqual(result, {"error": "model unavailable"})


if __name__ == "__main__":
    unittest.main()
