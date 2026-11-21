"""Smoke-test the example against the installed Agents SDK, without model calls."""

import sys
import tempfile
import unittest
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EXAMPLE_DIR))

import agent_provider
from agents import Agent, ShellTool, SQLiteSession
from agents.sandbox import SandboxAgent


class SdkConstructionTests(unittest.TestCase):
    def test_airline_agents_and_handoffs_construct(self):
        agent = agent_provider._build_agents("gpt-6-luna")
        self.assertIsInstance(agent, Agent)
        self.assertEqual(len(agent.handoffs), 2)

    def test_sandbox_agent_and_manifest_construct(self):
        agent = agent_provider._build_sandbox_agent("gpt-6-luna")
        self.assertIsInstance(agent, SandboxAgent)
        self.assertIn("repo/task.md", agent.default_manifest.entries)

    def test_skill_agent_and_shell_tool_construct(self):
        agent = agent_provider._build_skill_agent("gpt-6-luna")
        self.assertIsInstance(agent, Agent)
        self.assertEqual(len(agent.tools), 1)
        self.assertIsInstance(agent.tools[0], ShellTool)


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_conversation_is_persisted_across_sessions(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "session.sqlite3"
            session = SQLiteSession("smoke", db_path=database)
            try:
                await session.add_items(
                    [{"role": "user", "content": "What is my seat?"}]
                )
            finally:
                session.close()
            reopened = SQLiteSession("smoke", db_path=database)
            try:
                self.assertEqual(
                    await reopened.get_items(),
                    [{"role": "user", "content": "What is my seat?"}],
                )
            finally:
                reopened.close()


if __name__ == "__main__":
    unittest.main()
