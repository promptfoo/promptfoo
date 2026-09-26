"""Exercise the configured SQLite server through the application's MCP client."""

import asyncio
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from app import mcp_client


class MCPClientTest(unittest.IsolatedAsyncioTestCase):
    async def test_sqlite_tool_discovery_and_execution(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "test.db"
            with closing(sqlite3.connect(database)) as connection:
                connection.execute("CREATE TABLE products (name TEXT)")
                connection.execute("INSERT INTO products VALUES ('Fixture hoodie')")
                connection.commit()

            client = mcp_client.SwagMCPClient()
            with (
                patch.object(mcp_client, "USE_UVX_SQLITE", True),
                patch.object(mcp_client, "SWAG_DB_PATH", database),
            ):
                sqlite_config = client._get_server_configs()["sqlite"]

            async def exercise_server() -> None:
                try:
                    # Exercise the real configured launcher, without starting the
                    # unrelated filesystem and fetch servers for this regression.
                    with patch.object(
                        client,
                        "_get_server_configs",
                        return_value={"sqlite": sqlite_config},
                    ):
                        await client.connect()

                    tools, mapping = await client.get_all_tools()
                    query_tool = next(
                        tool for tool in tools if tool["name"] == "read_query"
                    )
                    self.assertEqual(query_tool["input_schema"]["type"], "object")
                    self.assertEqual(mapping["read_query"], "sqlite")

                    result = await client.execute_tool(
                        "read_query",
                        {"query": "SELECT name FROM products"},
                        "query-1",
                        mapping,
                    )
                    self.assertEqual(result["tool_use_id"], "query-1")
                    self.assertFalse(result.get("is_error", False))
                    self.assertIn("Fixture hoodie", result["content"])

                    unknown = await client.execute_tool(
                        "missing_tool", {}, "query-2", mapping
                    )
                    self.assertTrue(unknown["is_error"])
                    self.assertIn("Unknown tool", unknown["content"])
                finally:
                    await client.disconnect()

            # Bound the real server's download, startup, protocol requests, and cleanup.
            await asyncio.wait_for(exercise_server(), timeout=180)
            self.assertFalse(client.is_connected)


if __name__ == "__main__":
    unittest.main()
