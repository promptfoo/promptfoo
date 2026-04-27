#!/usr/bin/env python3
"""Rebuild the local Toolathlon PoC workspace from checked-in seeds."""

from __future__ import annotations

import csv
import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEEDS = ROOT / "seeds"
WORKSPACE = ROOT / "workspace"
DB_PATH = WORKSPACE / "orders.db"


def reset_workspace() -> None:
    if WORKSPACE.exists():
        shutil.rmtree(WORKSPACE)
    WORKSPACE.mkdir(parents=True)
    shutil.copy2(SEEDS / "customers.csv", WORKSPACE / "customers.csv")
    shutil.copy2(SEEDS / "README.md", WORKSPACE / "README.md")


def seed_database() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY,
                customer_email TEXT NOT NULL,
                amount REAL NOT NULL,
                status TEXT NOT NULL
            )
            """,
        )
        with (SEEDS / "orders.csv").open(newline="", encoding="utf-8") as handle:
            rows = [
                (int(row["id"]), row["customer_email"], float(row["amount"]), row["status"])
                for row in csv.DictReader(handle)
            ]
        conn.executemany(
            "INSERT INTO orders (id, customer_email, amount, status) VALUES (?, ?, ?, ?)",
            rows,
        )


def write_env() -> None:
    (ROOT / ".env").write_text(
        "\n".join(
            [
                f"PROMPTFOO_TOOLATHLON_WORKSPACE={WORKSPACE}",
                f"PROMPTFOO_TOOLATHLON_DB={DB_PATH}",
                "",
            ],
        ),
        encoding="utf-8",
    )


def main() -> None:
    reset_workspace()
    seed_database()
    write_env()
    print(f"Rebuilt workspace at {WORKSPACE}")
    print(f"Wrote environment file at {ROOT / '.env'}")


if __name__ == "__main__":
    main()
