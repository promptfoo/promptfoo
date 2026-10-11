import unittest

from fastmcp import Client

from server import mcp


class HelloToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_tool_listing_and_call(self):
        async with Client(mcp) as client:
            tools = await client.list_tools()
            self.assertIn("hello", [tool.name for tool in tools])
            result = await client.call_tool("hello", {"name": "Promptfoo"})
            self.assertFalse(result.is_error)
            self.assertEqual(result.content[0].text, "Hello, Promptfoo!")

    async def test_missing_argument_is_rejected(self):
        async with Client(mcp) as client:
            result = await client.call_tool("hello", {}, raise_on_error=False)
            self.assertTrue(result.is_error)


if __name__ == "__main__":
    unittest.main()
