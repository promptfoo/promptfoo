"""Offline regression tests for the CrewAI provider."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from agent import call_api, run_recruitment_agent


class RecruitmentAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_awaits_crewai_without_starting_a_nested_sync_run(self):
        kickoff = AsyncMock(return_value=SimpleNamespace(raw='{"candidates": []}'))
        crew = SimpleNamespace(kickoff_async=kickoff)
        with patch("agent.get_recruitment_agent", return_value=crew):
            result = await run_recruitment_agent("Python engineer", "openai/test")
        self.assertEqual(result, {"candidates": []})
        kickoff.assert_awaited_once_with(inputs={"job_requirements": "Python engineer"})

    async def test_returns_api_errors_as_provider_errors(self):
        crew = SimpleNamespace(
            kickoff_async=AsyncMock(side_effect=RuntimeError("offline"))
        )
        with patch("agent.get_recruitment_agent", return_value=crew):
            result = await run_recruitment_agent("Python engineer")
        self.assertIn("offline", result["error"])

    async def test_rejects_an_empty_response(self):
        crew = SimpleNamespace(
            kickoff_async=AsyncMock(return_value=SimpleNamespace(raw=""))
        )
        with patch("agent.get_recruitment_agent", return_value=crew):
            result = await run_recruitment_agent("Python engineer")
        self.assertIn("empty response", result["error"])


class ProviderTests(unittest.TestCase):
    def test_forwards_the_configured_model(self):
        with patch("agent.run_recruitment_agent", new_callable=AsyncMock) as run:
            run.return_value = {"candidates": []}
            result = call_api(
                "Python engineer", {"config": {"model": "openai/test"}}, {}
            )
        self.assertEqual(result, {"output": {"candidates": []}})
        run.assert_awaited_once_with("Python engineer", model="openai/test")


if __name__ == "__main__":
    unittest.main()
