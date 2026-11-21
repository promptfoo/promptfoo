from fastmcp import FastMCP

mcp = FastMCP("MyServer")


@mcp.tool
def hello(name: str) -> str:
    return f"Hello, {name}!"


if __name__ == "__main__":
    # Start the optional local HTTP server on port 8080
    mcp.run(transport="http", host="127.0.0.1", port=8080)
