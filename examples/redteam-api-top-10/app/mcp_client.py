"""
MCP Client for CloudSwag Demo

Adapted from mcp_tool_tutorial/mcp-client/client.py
Connects to SQLite and Filesystem MCP servers for the swag store chatbot.
"""

import asyncio
from contextlib import AsyncExitStack
from typing import Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .config import POLICIES_DIR, SQLITE_MCP_SERVER, SWAG_DB_PATH, USE_UVX_SQLITE


class SwagMCPClient:
    """MCP Client configured for CloudSwag store operations."""

    def __init__(self):
        self.sessions: dict[str, ClientSession] = {}
        self.exit_stack = AsyncExitStack()
        self._connected = False

    async def connect(self):
        """Connect to all configured MCP servers."""
        if self._connected:
            return

        servers = self._get_server_configs()

        for name, config in servers.items():
            try:
                if config["type"] == "stdio":
                    await self._connect_stdio(name, config["command"], config["args"])
                elif config["type"] == "npx":
                    await self._connect_npx(
                        name, config["package"], config.get("args", [])
                    )
                elif config["type"] == "uvx":
                    await self._connect_uvx(
                        name, config["package"], config.get("args", [])
                    )

                print(f"Connected to MCP server: {name}")
            except Exception as e:
                print(f"Warning: Could not connect to '{name}' server: {e}")

        self._connected = True

        if not self.sessions:
            raise RuntimeError("No MCP servers connected")

    def _get_server_configs(self) -> dict:
        """Get MCP server configurations."""
        configs = {}

        # SQLite MCP Server - for database operations
        # Use uvx (published package) by default, or custom script if configured
        if USE_UVX_SQLITE:
            configs["sqlite"] = {
                "type": "uvx",
                "package": "mcp-server-sqlite",
                "args": ["--db-path", str(SWAG_DB_PATH)],
            }
        elif SQLITE_MCP_SERVER and SQLITE_MCP_SERVER.exists():
            configs["sqlite"] = {
                "type": "stdio",
                "command": "python",
                "args": [str(SQLITE_MCP_SERVER), "--db-path", str(SWAG_DB_PATH)],
            }
        else:
            print(
                "Warning: SQLite MCP server not configured. Set USE_UVX_SQLITE=true or provide SQLITE_MCP_SERVER path"
            )

        # Filesystem MCP Server - for policy documents
        if POLICIES_DIR.exists():
            configs["filesystem"] = {
                "type": "npx",
                "package": "@modelcontextprotocol/server-filesystem",
                "args": [str(POLICIES_DIR)],
            }
        else:
            print(f"Warning: Policies directory not found at {POLICIES_DIR}")

        # Fetch MCP Server - for external API calls (official MCP server)
        # https://github.com/modelcontextprotocol/servers/tree/main/src/fetch
        configs["fetch"] = {"type": "uvx", "package": "mcp-server-fetch", "args": []}

        return configs

    async def _connect_stdio(self, name: str, command: str, args: list):
        """Connect to a stdio-based MCP server."""
        server_params = StdioServerParameters(command=command, args=args, env=None)

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        read_stream, write_stream = stdio_transport

        session = await self.exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )

        await session.initialize()
        self.sessions[name] = session

        # Log available tools
        response = await session.list_tools()
        tool_names = [tool.name for tool in response.tools]
        print(f"  [{name}] Tools: {len(tool_names)} available")

    async def _connect_npx(self, name: str, package: str, args: list):
        """Connect to an npx-based MCP server."""
        npx_args = ["-y", package] + args

        server_params = StdioServerParameters(command="npx", args=npx_args, env=None)

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        read_stream, write_stream = stdio_transport

        session = await self.exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )

        await session.initialize()
        self.sessions[name] = session

        # Log available tools
        response = await session.list_tools()
        tool_names = [tool.name for tool in response.tools]
        print(f"  [{name}] Tools: {len(tool_names)} available")

    async def _connect_uvx(self, name: str, package: str, args: list):
        """Connect to a uvx-based MCP server (Python packages)."""
        uvx_args = [package] + args

        server_params = StdioServerParameters(command="uvx", args=uvx_args, env=None)

        stdio_transport = await self.exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        read_stream, write_stream = stdio_transport

        session = await self.exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )

        await session.initialize()
        self.sessions[name] = session

        # Log available tools
        response = await session.list_tools()
        tool_names = [tool.name for tool in response.tools]
        print(f"  [{name}] Tools: {len(tool_names)} available")

    async def get_all_tools(self) -> tuple[list[dict], dict[str, str]]:
        """
        Get all tools from all connected servers.

        Returns:
            Tuple of (available_tools list for Claude, tool_to_server mapping)
        """
        available_tools = []
        tool_to_server = {}

        for server_name, session in self.sessions.items():
            response = await session.list_tools()
            for tool in response.tools:
                available_tools.append(
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "input_schema": tool.inputSchema,
                    }
                )
                tool_to_server[tool.name] = server_name

        return available_tools, tool_to_server

    async def execute_tool(
        self, tool_name: str, tool_args: dict, tool_id: str, tool_to_server: dict
    ) -> dict:
        """
        Execute a single tool call.

        Args:
            tool_name: Name of the tool to execute
            tool_args: Arguments to pass to the tool
            tool_id: Tool use ID for tracking
            tool_to_server: Mapping of tool names to server names

        Returns:
            Tool result dict for Claude API
        """
        server_name = tool_to_server.get(tool_name)

        if not server_name:
            return {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": f"Error: Unknown tool '{tool_name}'",
                "is_error": True,
            }

        session = self.sessions.get(server_name)
        if not session:
            return {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": f"Error: Server '{server_name}' not connected",
                "is_error": True,
            }

        try:
            result = await session.call_tool(tool_name, tool_args)

            # Extract content from result
            content_parts = []
            if result.content:
                for item in result.content:
                    if hasattr(item, "text"):
                        content_parts.append(item.text)

            content = (
                "\n".join(content_parts)
                if content_parts
                else "Tool executed successfully"
            )

            return {"type": "tool_result", "tool_use_id": tool_id, "content": content}

        except Exception as e:
            return {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": f"Error executing {tool_name}: {str(e)}",
                "is_error": True,
            }

    async def execute_tools_concurrent(
        self, tool_uses: list, tool_to_server: dict
    ) -> list[dict]:
        """
        Execute multiple tool calls concurrently.

        Args:
            tool_uses: List of tool use objects from Claude
            tool_to_server: Mapping of tool names to server names

        Returns:
            List of tool result dicts
        """
        tasks = []
        for tool_use in tool_uses:
            task = self.execute_tool(
                tool_name=tool_use.name,
                tool_args=tool_use.input,
                tool_id=tool_use.id,
                tool_to_server=tool_to_server,
            )
            tasks.append(task)

        results = await asyncio.gather(*tasks)
        return list(results)

    async def disconnect(self):
        """Disconnect from all MCP servers."""
        await self.exit_stack.aclose()
        self.sessions.clear()
        self._connected = False

    @property
    def is_connected(self) -> bool:
        """Check if client is connected to any servers."""
        return self._connected and len(self.sessions) > 0


# Singleton instance for the application
_mcp_client: Optional[SwagMCPClient] = None


async def get_mcp_client() -> SwagMCPClient:
    """Get or create the MCP client singleton."""
    global _mcp_client

    if _mcp_client is None:
        _mcp_client = SwagMCPClient()
        await _mcp_client.connect()

    return _mcp_client


async def shutdown_mcp_client():
    """Shutdown the MCP client."""
    global _mcp_client

    if _mcp_client is not None:
        await _mcp_client.disconnect()
        _mcp_client = None
