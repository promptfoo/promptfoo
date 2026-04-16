#!/usr/bin/env python3

import importlib.util
import sys
import types
import unittest
from contextlib import contextmanager
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parent
MODULE_PATH = EXAMPLE_DIR / "agent_provider.py"


def load_agent_provider():
    agents_module = types.ModuleType("agents")
    items_module = types.ModuleType("agents.items")
    tracing_module = types.ModuleType("promptfoo_tracing")

    class Agent:
        def __init__(self, *_, name=None, handoffs=None, **__):
            self.name = name or "Agent"
            self.handoffs = list(handoffs or [])

    class ItemHelpers:
        @staticmethod
        def text_message_output(item):
            return getattr(item, "text", "")

    class ModelSettings:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class RunContextWrapper:
        def __init__(self, context):
            self.context = context

    class Runner:
        @staticmethod
        def run_sync(*args, **kwargs):
            raise AssertionError("Runner.run_sync should not be called in these tests")

    class SQLiteSession:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

    def function_tool(*decorator_args, **decorator_kwargs):
        if (
            decorator_args
            and callable(decorator_args[0])
            and len(decorator_args) == 1
            and not decorator_kwargs
        ):
            return decorator_args[0]

        def decorator(func):
            return func

        return decorator

    def handoff(agent, **kwargs):
        return agent

    @contextmanager
    def trace(*args, **kwargs):
        yield None

    class MessageOutputItem:
        pass

    class HandoffOutputItem:
        pass

    class ToolCallOutputItem:
        pass

    agents_module.Agent = Agent
    agents_module.ItemHelpers = ItemHelpers
    agents_module.ModelSettings = ModelSettings
    agents_module.RunContextWrapper = RunContextWrapper
    agents_module.Runner = Runner
    agents_module.SQLiteSession = SQLiteSession
    agents_module.function_tool = function_tool
    agents_module.handoff = handoff
    agents_module.trace = trace

    items_module.HandoffOutputItem = HandoffOutputItem
    items_module.MessageOutputItem = MessageOutputItem
    items_module.ToolCallOutputItem = ToolCallOutputItem

    tracing_module.configure_promptfoo_tracing = lambda **kwargs: None

    sys.modules["agents"] = agents_module
    sys.modules["agents.items"] = items_module
    sys.modules["promptfoo_tracing"] = tracing_module

    spec = importlib.util.spec_from_file_location(
        "agent_provider_under_test", MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


AGENT_PROVIDER = load_agent_provider()


class AgentProviderTests(unittest.TestCase):
    def test_update_seat_requires_prior_lookup(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertIn("Call lookup_reservation first", result)
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_lookup_then_update_succeeds(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "abc123")
        update = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertEqual(lookup["seat_number"], "12A")
        self.assertIn("Seat updated to 16F", update)
        self.assertEqual(context.seat_number, "16F")
        self.assertEqual(context.verified_confirmation_number, "ABC123")

    def test_repeating_same_confirmation_preserves_updated_seat(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        AGENT_PROVIDER.update_seat(wrapper, "ABC123", "14D")
        AGENT_PROVIDER._hydrate_context_from_step(
            "My confirmation number is ABC123.", context
        )

        self.assertEqual(context.seat_number, "14D")
        self.assertEqual(context.verified_confirmation_number, "ABC123")

    def test_switching_confirmation_clears_verification(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        AGENT_PROVIDER.update_seat(wrapper, "ABC123", "14D")
        AGENT_PROVIDER._hydrate_context_from_step(
            "My confirmation number is XYZ789.", context
        )

        self.assertEqual(context.confirmation_number, "XYZ789")
        self.assertEqual(context.seat_number, "4C")
        self.assertIsNone(context.verified_confirmation_number)

    def test_switching_to_unknown_confirmation_clears_stale_booking_fields(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        AGENT_PROVIDER.update_seat(wrapper, "ABC123", "14D")
        AGENT_PROVIDER._hydrate_context_from_step(
            "My confirmation number is ZZZ999.", context
        )

        self.assertEqual(context.confirmation_number, "ZZZ999")
        self.assertIsNone(context.passenger_name)
        self.assertIsNone(context.flight_number)
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_unknown_lookup_clears_stale_booking_fields(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        result = AGENT_PROVIDER.lookup_reservation(wrapper, "ZZZ999")

        self.assertEqual(result, {"error": "Unknown confirmation number: ZZZ999"})
        self.assertEqual(context.confirmation_number, "ZZZ999")
        self.assertIsNone(context.passenger_name)
        self.assertIsNone(context.flight_number)
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_invalid_steps_json_raises(self):
        with self.assertRaisesRegex(
            ValueError, "steps_json must be valid JSON containing a non-empty list"
        ):
            AGENT_PROVIDER._build_steps("task", {"steps_json": "{not json"})

    def test_invalid_steps_json_values_raise(self):
        for steps_json in (None, "", "   ", [], {}):
            with self.subTest(steps_json=steps_json):
                with self.assertRaisesRegex(
                    ValueError,
                    "steps_json must be valid JSON containing a non-empty list",
                ):
                    AGENT_PROVIDER._build_steps("task", {"steps_json": steps_json})

    def test_empty_steps_list_raises(self):
        with self.assertRaisesRegex(
            ValueError, "steps must be a non-empty list of steps"
        ):
            AGENT_PROVIDER._build_steps("task", {"steps": []})

    def test_call_api_returns_error_for_invalid_steps_json(self):
        result = AGENT_PROVIDER.call_api(
            "overall task", {}, {"vars": {"steps_json": "{not json"}}
        )

        self.assertIn("steps_json must be valid JSON", result["error"])
        self.assertTrue(result["output"].startswith("Error:"))

    def test_call_api_returns_error_for_blank_steps_json(self):
        result = AGENT_PROVIDER.call_api(
            "overall task", {}, {"vars": {"steps_json": ""}}
        )

        self.assertIn("steps_json must be valid JSON", result["error"])
        self.assertTrue(result["output"].startswith("Error:"))

    def test_session_id_isolated_by_repeat_index(self):
        session_id = AGENT_PROVIDER._session_id(
            {"evaluationId": "eval-1", "testCaseId": "case-1", "repeatIndex": 2},
            {},
        )

        self.assertEqual(session_id, "promptfoo-openai-agents-eval-1-case-1-repeat-2")


if __name__ == "__main__":
    unittest.main()
