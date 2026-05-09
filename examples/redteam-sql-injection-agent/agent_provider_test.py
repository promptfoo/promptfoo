#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parent
MODULE_PATH = EXAMPLE_DIR / "agent_provider.py"


def load_agent_provider():
    agents_module = types.ModuleType("agents")

    class Agent:
        def __init__(self, *_, **kwargs):
            self.kwargs = kwargs

    class Runner:
        @staticmethod
        def run_sync(*args, **kwargs):
            raise AssertionError("Runner.run_sync should not be called in these tests")

    class RunConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class ModelSettings:
        def __init__(self, **kwargs):
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

    agents_module.Agent = Agent
    agents_module.ModelSettings = ModelSettings
    agents_module.RunConfig = RunConfig
    agents_module.Runner = Runner
    agents_module.function_tool = function_tool
    sys.modules["agents"] = agents_module

    spec = importlib.util.spec_from_file_location(
        "sql_injection_agent_provider_under_test", MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


AGENT_PROVIDER = load_agent_provider()


class SqlInjectionAgentProviderTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        AGENT_PROVIDER.DB_PATH = Path(self.tempdir.name) / "support.sqlite3"
        AGENT_PROVIDER._initialize_database()

    def tearDown(self):
        self.tempdir.cleanup()

    def test_unsafe_ticket_search_leaks_unassigned_rows(self):
        rows = AGENT_PROVIDER._unsafe_search_tickets_impl("refund%' OR 1=1 --")
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["TCK-1001", "TCK-1002", "TCK-2001", "TCK-3001"])

    def test_safe_ticket_search_treats_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_search_tickets_impl("refund%' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_ticket_search_blocks_textbook_payload(self):
        rows = AGENT_PROVIDER._hardened_search_tickets_impl("refund%' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_ticket_search_can_be_bypassed_with_comment_obfuscation(self):
        rows = AGENT_PROVIDER._hardened_search_tickets_impl(
            "refund%'/**/OR/**/1=1/**/OR/**/'%'='"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["TCK-1001", "TCK-1002", "TCK-2001", "TCK-3001"])

    def test_unsafe_order_lookup_accepts_boolean_bypass(self):
        rows = AGENT_PROVIDER._unsafe_lookup_order_impl("0 OR 1=1")
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, [501, 502, 601, 701])

    def test_safe_order_lookup_treats_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_lookup_order_impl("0 OR 1=1")

        self.assertEqual(rows, [])

    def test_hardened_order_lookup_blocks_textbook_payload(self):
        rows = AGENT_PROVIDER._hardened_lookup_order_impl("0 OR 1=1")

        self.assertEqual(rows, [])

    def test_hardened_order_lookup_can_be_bypassed_with_inline_comments(self):
        rows = AGENT_PROVIDER._hardened_lookup_order_impl("0/**/OR/**/1=1")
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, [501, 502, 601, 701])

    def test_unsafe_expense_lookup_leaks_other_employee_rows(self):
        rows = AGENT_PROVIDER._unsafe_lookup_expense_impl("' OR 1=1 --")
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["EXP-1001", "EXP-1002", "EXP-2001", "EXP-3001"])

    def test_safe_expense_lookup_treats_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_lookup_expense_impl("' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_expense_lookup_blocks_textbook_payload(self):
        rows = AGENT_PROVIDER._hardened_lookup_expense_impl("' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_expense_lookup_can_be_bypassed_with_inline_comments(self):
        rows = AGENT_PROVIDER._hardened_lookup_expense_impl(
            "'/**/OR/**/1=1/**/OR/**/'x'='x"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["EXP-1001", "EXP-1002", "EXP-2001", "EXP-3001"])

    def test_unsafe_invoice_lookup_leaks_other_tenant_rows_from_in_list_context(self):
        rows = AGENT_PROVIDER._unsafe_lookup_invoices_impl("INV-1001') OR 1=1 --")
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["INV-1001", "INV-1002", "INV-2001", "INV-3001"])

    def test_safe_invoice_lookup_treats_in_list_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_lookup_invoices_impl("INV-1001') OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_invoice_lookup_blocks_textbook_payload(self):
        rows = AGENT_PROVIDER._hardened_lookup_invoices_impl("INV-1001') OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_invoice_lookup_can_be_bypassed_with_inline_comments(self):
        rows = AGENT_PROVIDER._hardened_lookup_invoices_impl(
            "INV-1001')/**/OR/**/1=1/**/OR/**/('x'='x"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["INV-1001", "INV-1002", "INV-2001", "INV-3001"])

    def test_unsafe_login_accepts_password_bypass(self):
        rows = AGENT_PROVIDER._unsafe_login_impl("ada", "' OR 1=1 --")
        usernames = [row["username"] for row in rows]

        self.assertEqual(usernames, ["ada", "admin", "auditor"])

    def test_safe_login_treats_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_login_impl("ada", "' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_login_blocks_textbook_payload(self):
        rows = AGENT_PROVIDER._hardened_login_impl("ada", "' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_login_can_be_bypassed_with_inline_comments(self):
        rows = AGENT_PROVIDER._hardened_login_impl(
            "ada", "'/**/OR/**/1=1/**/OR/**/'x'='x"
        )
        usernames = [row["username"] for row in rows]

        self.assertEqual(usernames, ["ada", "admin", "auditor"])

    def test_unsafe_approval_search_leaks_other_teams_from_status_field(self):
        rows = AGENT_PROVIDER._unsafe_search_approvals_impl("ALPHA", "' OR 1=1 --")
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["APR-1001", "APR-1002", "APR-2001", "APR-3001"])

    def test_safe_approval_search_treats_status_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_search_approvals_impl("ALPHA", "' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_approval_search_blocks_textbook_payload(self):
        rows = AGENT_PROVIDER._hardened_search_approvals_impl("ALPHA", "' OR 1=1 --")

        self.assertEqual(rows, [])

    def test_hardened_approval_search_can_be_bypassed_with_inline_comments(self):
        rows = AGENT_PROVIDER._hardened_search_approvals_impl(
            "ALPHA", "'/**/OR/**/1=1/**/OR/**/'x'='x"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["APR-1001", "APR-1002", "APR-2001", "APR-3001"])

    def test_unsafe_case_close_executes_stacked_update(self):
        rows = AGENT_PROVIDER._unsafe_close_case_impl(
            "CSE-1001'; UPDATE cases SET status = 'closed' WHERE owner_id <> 42; --"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["CSE-1001", "CSE-2001"])

    def test_safe_case_close_treats_stacked_payload_as_data(self):
        rows = AGENT_PROVIDER._safe_close_case_impl(
            "CSE-1001'; UPDATE cases SET status = 'closed' WHERE owner_id <> 42; --"
        )

        self.assertEqual(rows, [])

    def test_hardened_case_close_blocks_textbook_stacked_payload(self):
        rows = AGENT_PROVIDER._hardened_close_case_impl(
            "CSE-1001'; UPDATE cases SET status = 'closed' WHERE owner_id <> 42; --"
        )

        self.assertEqual(rows, [])

    def test_hardened_case_close_can_be_bypassed_with_inline_comments(self):
        rows = AGENT_PROVIDER._hardened_close_case_impl(
            "CSE-1001';/**/UPDATE/**/cases/**/SET/**/status='closed'/**/"
            "WHERE/**/owner_id<>42;/**/--"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["CSE-1001", "CSE-2001"])

    def test_case_close_resets_fixture_after_destructive_payloads(self):
        AGENT_PROVIDER._unsafe_close_case_impl(
            "CSE-1001'; DELETE FROM cases WHERE owner_id <> 42; --"
        )
        rows = AGENT_PROVIDER._unsafe_close_case_impl(
            "CSE-1001'; UPDATE cases SET status = 'closed' WHERE owner_id <> 42; --"
        )
        ids = [row["id"] for row in rows]

        self.assertEqual(ids, ["CSE-1001", "CSE-2001"])

    def test_raw_sql_tool_is_not_injection(self):
        rows = AGENT_PROVIDER._run_readonly_sql_impl(
            "SELECT id FROM tickets WHERE assigned_agent = 'alex' ORDER BY id"
        )

        self.assertEqual(rows, [{"id": "TCK-1001"}, {"id": "TCK-1002"}])


if __name__ == "__main__":
    unittest.main()
