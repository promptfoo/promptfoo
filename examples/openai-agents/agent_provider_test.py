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
    run_module = types.ModuleType("agents.run")
    sandbox_module = types.ModuleType("agents.sandbox")
    sandbox_entries_module = types.ModuleType("agents.sandbox.entries")
    sandbox_sandboxes_module = types.ModuleType("agents.sandbox.sandboxes")
    sandbox_unix_local_module = types.ModuleType("agents.sandbox.sandboxes.unix_local")
    tracing_module = types.ModuleType("promptfoo_tracing")

    class Agent:
        def __init__(self, *_, name=None, handoffs=None, **kwargs):
            self.name = name or "Agent"
            self.handoffs = list(handoffs or [])
            self.kwargs = kwargs

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

    class RunConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class SandboxRunConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class Manifest:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.entries = kwargs.get("entries", {})

    class SandboxAgent(Agent):
        def __init__(self, *args, default_manifest=None, **kwargs):
            super().__init__(*args, **kwargs)
            self.default_manifest = default_manifest

    class File:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.content = kwargs.get("content")

    class UnixLocalSandboxClient:
        pass

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

    run_module.RunConfig = RunConfig

    sandbox_module.Manifest = Manifest
    sandbox_module.SandboxAgent = SandboxAgent
    sandbox_module.SandboxRunConfig = SandboxRunConfig

    sandbox_entries_module.File = File
    sandbox_unix_local_module.UnixLocalSandboxClient = UnixLocalSandboxClient

    items_module.HandoffOutputItem = HandoffOutputItem
    items_module.MessageOutputItem = MessageOutputItem
    items_module.ToolCallOutputItem = ToolCallOutputItem

    tracing_module.configure_promptfoo_tracing = lambda **kwargs: None

    sys.modules["agents"] = agents_module
    sys.modules["agents.items"] = items_module
    sys.modules["agents.run"] = run_module
    sys.modules["agents.sandbox"] = sandbox_module
    sys.modules["agents.sandbox.entries"] = sandbox_entries_module
    sys.modules["agents.sandbox.sandboxes"] = sandbox_sandboxes_module
    sys.modules["agents.sandbox.sandboxes.unix_local"] = sandbox_unix_local_module
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

        AGENT_PROVIDER._hydrate_context_from_step(
            "My name is Ada Lovelace and my confirmation number is ABC123.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "abc123")
        update = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertEqual(context.user_passenger_name, "Ada Lovelace")
        self.assertEqual(lookup["seat_number"], "12A")
        self.assertIn("Seat updated to 16F", update)
        self.assertEqual(context.seat_number, "16F")
        self.assertEqual(context.verified_confirmation_number, "ABC123")

    def test_update_seat_refuses_explicit_third_party_booking_change(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "My friend gave me confirmation number ABC123 and asked me to move their seat to 16F.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertEqual(
            lookup,
            {
                "error": (
                    "Unable to look up a third-party booking. The passenger must "
                    "contact support directly."
                )
            },
        )
        self.assertIn("third-party booking", result)
        self.assertIsNone(context.seat_number)
        self.assertEqual(context.third_party_confirmation_number, "ABC123")
        self.assertIsNone(context.verified_confirmation_number)

    def test_update_seat_refuses_third_party_intent_before_confirmation(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Can you move my friend's seat to 16F?",
            context,
        )
        self.assertTrue(context.pending_third_party_booking_change)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Their confirmation number is ABC123.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertEqual(
            lookup,
            {
                "error": (
                    "Unable to look up a third-party booking. The passenger must "
                    "contact support directly."
                )
            },
        )
        self.assertIn("third-party booking", result)
        self.assertFalse(context.pending_third_party_booking_change)
        self.assertEqual(context.third_party_confirmation_number, "ABC123")
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_update_seat_refuses_family_third_party_terms(self):
        for user_step in [
            "Can you move my daughter's seat to 16F?",
            "Can you move my son's seat to 16F?",
            "Can you move my child's seat to 16F?",
        ]:
            with self.subTest(user_step=user_step):
                context = AGENT_PROVIDER.AirlineContext()
                wrapper = AGENT_PROVIDER.RunContextWrapper(context)

                AGENT_PROVIDER._hydrate_context_from_step(user_step, context)
                result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

                self.assertTrue(context.pending_third_party_booking_change)
                self.assertIn("third-party booking", result)
                self.assertIsNone(context.confirmation_number)
                self.assertIsNone(context.seat_number)
                self.assertIsNone(context.verified_confirmation_number)

    def test_lookup_refuses_pending_third_party_intent_without_binding_tool_confirmation(
        self,
    ):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Can you move my friend's seat to 16F?",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "ZZZ999")
        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertEqual(
            lookup,
            {
                "error": (
                    "Unable to look up a third-party booking. The passenger must "
                    "contact support directly."
                )
            },
        )
        self.assertIn("third-party booking", result)
        self.assertTrue(context.pending_third_party_booking_change)
        self.assertIsNone(context.confirmation_number)
        self.assertIsNone(context.third_party_confirmation_number)
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_third_party_pending_rearms_after_prior_blocked_confirmation(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "My friend gave me confirmation number ABC123 and asked me to move "
            "their seat to 16F.",
            context,
        )
        self.assertFalse(context.pending_third_party_booking_change)
        self.assertEqual(context.third_party_confirmation_number, "ABC123")

        AGENT_PROVIDER._hydrate_context_from_step(
            "Can you move my coworker's seat to 18A?",
            context,
        )
        self.assertTrue(context.pending_third_party_booking_change)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Their confirmation number is XYZ789.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "XYZ789")
        result = AGENT_PROVIDER.update_seat(wrapper, "XYZ789", "18A")

        self.assertEqual(
            lookup,
            {
                "error": (
                    "Unable to look up a third-party booking. The passenger must "
                    "contact support directly."
                )
            },
        )
        self.assertIn("third-party booking", result)
        self.assertFalse(context.pending_third_party_booking_change)
        self.assertEqual(context.third_party_confirmation_number, "XYZ789")
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_third_party_confirmation_correction_remains_blocked(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "My friend gave me confirmation number ABC123 and asked me to move "
            "their seat to 16F.",
            context,
        )
        self.assertEqual(context.third_party_confirmation_number, "ABC123")

        AGENT_PROVIDER._hydrate_context_from_step(
            "Sorry, their confirmation number is XYZ789.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "XYZ789")
        result = AGENT_PROVIDER.update_seat(wrapper, "XYZ789", "18A")

        self.assertEqual(
            lookup,
            {
                "error": (
                    "Unable to look up a third-party booking. The passenger must "
                    "contact support directly."
                )
            },
        )
        self.assertIn("third-party booking", result)
        self.assertEqual(context.third_party_confirmation_number, "XYZ789")
        self.assertIsNone(context.passenger_name)
        self.assertIsNone(context.seat_number)
        self.assertIsNone(context.verified_confirmation_number)

    def test_first_party_claim_after_third_party_refusal_resets_block(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Can you move my friend's seat to 18A?",
            context,
        )
        AGENT_PROVIDER._hydrate_context_from_step(
            "Their confirmation number is XYZ789.",
            context,
        )
        blocked_lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "XYZ789")

        AGENT_PROVIDER._hydrate_context_from_step(
            "Actually this is my reservation. My name is Ada Lovelace and my "
            "confirmation number is ABC123.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertEqual(
            blocked_lookup,
            {
                "error": (
                    "Unable to look up a third-party booking. The passenger must "
                    "contact support directly."
                )
            },
        )
        self.assertIsNone(context.third_party_confirmation_number)
        self.assertFalse(context.pending_third_party_booking_change)
        self.assertEqual(context.user_passenger_name, "Ada Lovelace")
        self.assertEqual(lookup["passenger_name"], "Ada Lovelace")
        self.assertIn("Seat updated to 16F", result)
        self.assertEqual(context.confirmation_number, "ABC123")
        self.assertEqual(context.seat_number, "16F")
        self.assertEqual(context.verified_confirmation_number, "ABC123")

    def test_first_party_claim_resets_pending_third_party_intent(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Can you move my friend's seat to 18A?",
            context,
        )
        self.assertTrue(context.pending_third_party_booking_change)

        AGENT_PROVIDER._hydrate_context_from_step(
            "Actually this is my reservation. My name is Ada Lovelace and my "
            "confirmation number is ABC123.",
            context,
        )
        lookup = AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertIsNone(context.third_party_confirmation_number)
        self.assertFalse(context.pending_third_party_booking_change)
        self.assertEqual(lookup["passenger_name"], "Ada Lovelace")
        self.assertIn("Seat updated to 16F", result)
        self.assertEqual(context.seat_number, "16F")
        self.assertEqual(context.verified_confirmation_number, "ABC123")

    def test_update_seat_refuses_mismatched_claimed_passenger(self):
        context = AGENT_PROVIDER.AirlineContext()
        wrapper = AGENT_PROVIDER.RunContextWrapper(context)

        AGENT_PROVIDER._hydrate_context_from_step(
            "My name is Mallory Vale and my confirmation number is ABC123.",
            context,
        )
        AGENT_PROVIDER.lookup_reservation(wrapper, "ABC123")
        result = AGENT_PROVIDER.update_seat(wrapper, "ABC123", "16F")

        self.assertIn("different passenger", result)
        self.assertEqual(context.user_passenger_name, "Mallory Vale")
        self.assertEqual(context.seat_number, "12A")

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

    def test_extract_token_usage_preserves_request_and_billing_details(self):
        raw_responses = [
            types.SimpleNamespace(
                usage=types.SimpleNamespace(
                    total_tokens=150,
                    input_tokens=100,
                    output_tokens=50,
                    requests=2,
                    input_tokens_details=types.SimpleNamespace(cached_tokens=40),
                    output_tokens_details=types.SimpleNamespace(reasoning_tokens=10),
                )
            ),
            types.SimpleNamespace(
                usage=types.SimpleNamespace(
                    total_tokens=30,
                    prompt_tokens=20,
                    completion_tokens=10,
                    prompt_tokens_details=types.SimpleNamespace(cached_tokens=5),
                    completion_tokens_details=types.SimpleNamespace(reasoning_tokens=3),
                )
            ),
        ]

        self.assertEqual(
            AGENT_PROVIDER._extract_token_usage(raw_responses),
            {
                "total": 180,
                "prompt": 120,
                "completion": 60,
                "cached": 45,
                "numRequests": 3,
                "completionDetails": {"reasoning": 13},
            },
        )

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

    def test_sandbox_manifest_stages_ticket_fixture(self):
        manifest = AGENT_PROVIDER._build_sandbox_manifest()

        self.assertIn("AGENTS.md", manifest.entries)
        self.assertIn("bin/python", manifest.entries)
        self.assertIn("repo/task.md", manifest.entries)
        self.assertIn("repo/__init__.py", manifest.entries)
        self.assertIn("repo/tickets/TICKET-014.md", manifest.entries)
        self.assertIn("repo/tests/__init__.py", manifest.entries)
        self.assertIn("repo/tests/test_discount_policy.py", manifest.entries)
        self.assertIn(
            b"platform-integrations",
            manifest.entries["repo/tickets/TICKET-014.md"].content,
        )
        self.assertIn(
            b"./bin/python -m unittest discover -s repo/tests",
            manifest.entries["AGENTS.md"].content,
        )
        self.assertEqual(
            manifest.kwargs["environment"]["value"]["PATH"],
            "bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        )
        self.assertIn(
            b"return discount_percent >= 20",
            manifest.entries["repo/task.md"].content,
        )

    def test_sandbox_agent_uses_staged_manifest(self):
        agent = AGENT_PROVIDER._build_sandbox_agent("gpt-5.4-mini")

        self.assertEqual(agent.name, "Sandbox Workspace Analyst")
        self.assertIn("repo/task.md", agent.default_manifest.entries)
        self.assertIn("repo/src/discount_policy.py", agent.default_manifest.entries)
        self.assertEqual(
            agent.kwargs["model_settings"].kwargs["tool_choice"], "required"
        )


if __name__ == "__main__":
    unittest.main()
