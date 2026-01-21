"""
CloudSwag Customer Service Bot - FastAPI Application

Main entry point for the swag store demo.
Demonstrates MCP tool integration with JWT-based session management.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from mock_services.internal import router as internal_router
from mock_services.router import router as mock_router

from .config import ANTHROPIC_API_KEY, PROJECT_ROOT
from .mcp_client import get_mcp_client, shutdown_mcp_client
from .routers import auth, chat, products
from .security import get_security_status, is_debug_enabled, is_legacy_api_enabled


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Connects to MCP servers on startup, disconnects on shutdown.
    """
    print("\n" + "=" * 60)
    print("CloudSwag Customer Service Bot Starting...")
    print("=" * 60)

    # Display security configuration
    print("\nSecurity Configuration (OWASP API Top 10):")
    security_status = get_security_status()
    for key, info in security_status.items():
        level_text = {1: "WEAK (vulnerable)", 2: "MEDIUM", 3: "STRONG (secure)"}.get(
            info["level"], "?"
        )
        print(f"  {key}: Level {info['level']} - {level_text}")

    # Check for API key
    if not ANTHROPIC_API_KEY:
        print("\nWARNING: ANTHROPIC_API_KEY not set!")
        print("Set it in .env file or environment variable.")
        print("Chat functionality will not work without it.\n")

    # Connect to MCP servers
    try:
        print("\nConnecting to MCP servers...")
        mcp_client = await get_mcp_client()
        tools, _ = await mcp_client.get_all_tools()
        print(f"Total tools available: {len(tools)}")
        print("MCP servers connected successfully!\n")
    except Exception as e:
        print(f"\nWarning: MCP connection issue: {e}")
        print("Some features may not work.\n")

    print("=" * 60)
    print("Server ready! Open http://localhost:8000 in your browser")
    print("=" * 60 + "\n")

    yield  # Application runs here

    # Cleanup on shutdown
    print("\nShutting down MCP connections...")
    await shutdown_mcp_client()
    print("Goodbye!")


# Create FastAPI app
app = FastAPI(
    title="CloudSwag Customer Service Bot",
    description="Demo application showcasing MCP tool integration for a swag store chatbot",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for web UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(products.router)
app.include_router(mock_router)

# Conditionally include debug router (API8: Security Misconfiguration)
if is_debug_enabled():
    from .routers import debug

    app.include_router(debug.router)

# Conditionally include legacy v1 router (API9: Improper Inventory Management)
if is_legacy_api_enabled():
    from .routers import legacy

    app.include_router(legacy.router)

# Include internal metadata endpoints (API7: SSRF demo target)
app.include_router(internal_router)

# Static files for web UI
static_dir = PROJECT_ROOT / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
async def root():
    """Serve the chat UI or redirect to it."""
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {
        "message": "CloudSwag Customer Service Bot",
        "docs": "/docs",
        "chat_ui": "/static/index.html",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    from .mcp_client import _mcp_client

    mcp_status = (
        "connected" if (_mcp_client and _mcp_client.is_connected) else "disconnected"
    )

    return {
        "status": "healthy",
        "mcp_servers": mcp_status,
        "anthropic_configured": bool(ANTHROPIC_API_KEY),
    }


@app.get("/security/status")
async def security_status():
    """
    Get current security configuration levels.
    Useful for understanding which vulnerabilities are enabled.
    """
    return {
        "description": "OWASP API Security Top 10 Vulnerability Configuration",
        "levels": {
            1: "Weak (easily exploitable)",
            2: "Medium (bypassable with effort)",
            3: "Strong (secure)",
        },
        "configuration": get_security_status(),
        "active_endpoints": {
            "debug": is_debug_enabled(),
            "legacy_v1": is_legacy_api_enabled(),
        },
    }


@app.get("/api/info")
async def api_info():
    """Get API information and available endpoints."""
    return {
        "name": "CloudSwag Customer Service Bot",
        "version": "1.0.0",
        "endpoints": {
            "chat": {
                "POST /chat/": "Send a message to the bot",
                "GET /chat/sessions": "List user's chat sessions",
                "GET /chat/session/{id}/history": "Get session history",
                "DELETE /chat/session/{id}": "Clear a session",
            },
            "auth": {
                "POST /auth/token": "Generate JWT token for demo user",
                "POST /auth/validate": "Validate a token",
                "GET /auth/demo-users": "List available demo users",
                "GET /auth/demo-tokens": "Get JWT tokens for all demo users",
            },
            "mock_services": {
                "GET /mock/shipping/track/{tracking}": "Track a package",
                "GET /mock/promotions/current": "Get current promotions",
                "GET /mock/weather/{location}": "Get weather data",
            },
        },
        "demo_users": ["alice", "bob", "charlie", "diana", "eve"],
        "hint": "In mock auth mode, use demo user names directly as tokens",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
