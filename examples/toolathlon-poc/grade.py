from __future__ import annotations

import csv
import json
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT / "workspace"
SEEDS = ROOT / "seeds"
DB_PATH = WORKSPACE / "orders.db"
CUSTOMERS_PATH = WORKSPACE / "customers.csv"
SUMMARY_PATH = WORKSPACE / "summary.json"


def _seed_orders() -> list[dict[str, str]]:
    with (SEEDS / "orders.csv").open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _seed_customers() -> set[str]:
    with (SEEDS / "customers.csv").open(newline="", encoding="utf-8") as handle:
        return {row["email"] for row in csv.DictReader(handle)}


def _current_customers() -> list[dict[str, str]]:
    with CUSTOMERS_PATH.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    del output, context
    failures: list[str] = []

    if not DB_PATH.exists():
        return {"pass": False, "score": 0.0, "reason": f"Missing sqlite database: {DB_PATH}"}
    if not CUSTOMERS_PATH.exists():
        return {"pass": False, "score": 0.0, "reason": f"Missing customer CSV: {CUSTOMERS_PATH}"}
    if not SUMMARY_PATH.exists():
        return {"pass": False, "score": 0.0, "reason": f"Missing summary JSON: {SUMMARY_PATH}"}

    seed_orders = _seed_orders()
    seed_customer_emails = _seed_customers()
    expected_order_count = len(seed_orders)
    order_emails = {row["customer_email"] for row in seed_orders}
    expected_orphans = sorted(order_emails - seed_customer_emails)
    expected_pending_confirmed = sum(1 for row in seed_orders if row["status"] == "pending")

    try:
        customers = _current_customers()
    except Exception as exc:
        return {"pass": False, "score": 0.0, "reason": f"Could not read customers.csv: {exc}"}

    customer_emails = [row.get("email", "") for row in customers]
    customer_email_set = set(customer_emails)

    if not set(expected_orphans).issubset(customer_email_set):
        missing = sorted(set(expected_orphans) - customer_email_set)
        failures.append(f"missing orphan customers: {missing}")

    duplicate_emails = sorted({email for email in customer_emails if customer_emails.count(email) > 1})
    if duplicate_emails:
        failures.append(f"duplicate customer rows: {duplicate_emails}")

    with sqlite3.connect(DB_PATH) as conn:
        row_count = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        pending_count = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'pending'").fetchone()[0]
        confirmed_count = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'confirmed'").fetchone()[0]
        orphan_pending = conn.execute(
            """
            SELECT COUNT(*)
            FROM orders
            WHERE status = 'pending'
              AND customer_email IN (%s)
            """
            % ",".join("?" for _ in customer_email_set),
            tuple(customer_email_set),
        ).fetchone()[0]

    if row_count != expected_order_count:
        failures.append(f"orders row count changed: expected {expected_order_count}, got {row_count}")

    if pending_count != 0 or orphan_pending != 0:
        failures.append(f"pending orders remain: total={pending_count}, for listed customers={orphan_pending}")

    try:
        summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"pass": False, "score": 0.25, "reason": f"Could not read summary.json: {exc}"}

    expected_summary = {
        "added_customers": len(expected_orphans),
        "confirmed_orders": expected_pending_confirmed,
    }
    if summary != expected_summary:
        failures.append(f"summary mismatch: expected {expected_summary}, got {summary}")

    expected_confirmed = sum(1 for row in seed_orders if row["status"] == "confirmed") + expected_pending_confirmed
    if confirmed_count != expected_confirmed:
        failures.append(f"confirmed order count mismatch: expected {expected_confirmed}, got {confirmed_count}")

    checks_passed = 4 - min(4, len(failures))
    score = checks_passed / 4
    if failures:
        return {"pass": False, "score": score, "reason": "; ".join(failures)}
    return {
        "pass": True,
        "score": 1.0,
        "reason": "All orphan customers were added, all pending orders were confirmed, summary.json is correct, and the orders schema row count is unchanged.",
    }
