"""
FastAPI Server for ChatKit Backend

This server exposes the ChatKit protocol over HTTP,
allowing promptfoo to test Agent Builder workflows.
"""

import sys
import os
from pathlib import Path

# Add parent directory to path to import agents
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

# Import the agent wrapper
from agent_wrapper import AgentBuilderBackend

# Import the example agent
# Replace this with your own agent export from Agent Builder
from agent_exports.support_agent import agent


# Create FastAPI app
app = FastAPI(
    title="ChatKit Agent Builder Backend",
    description="ChatKit backend wrapping an Agents SDK agent",
    version="1.0.0",
)

# Add CORS middleware for web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the ChatKit backend with the agent
backend = AgentBuilderBackend(agent)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "agent": agent.name,
        "model": agent.model,
        "chatkit_endpoint": "/chatkit",
    }


@app.get("/health")
async def health():
    """Detailed health check"""
    return {
        "status": "healthy",
        "agent": {
            "name": agent.name,
            "model": agent.model,
            "instructions": agent.instructions[:100] + "..."  # First 100 chars
            if len(agent.instructions) > 100
            else agent.instructions,
        },
        "backend": {
            "type": "AgentBuilderBackend",
            "store": "InMemoryStore",
        },
    }


@app.post("/chatkit")
async def chatkit_endpoint(request: Request):
    """
    Main ChatKit protocol endpoint.

    This endpoint:
    1. Receives ChatKit protocol requests (JSON)
    2. Processes them through the backend
    3. Returns Server-Sent Events (SSE) stream

    The ChatKit protocol includes:
    - threads.create: Create new conversation
    - threads.add_user_message: Add user message to thread
    - threads.add_client_tool_output: Return tool execution results
    - threads.retry_after_item: Retry from a specific point
    """
    try:
        # Read request body
        body = await request.body()

        # Process through ChatKit backend
        # This handles protocol parsing and routing
        result = await backend.process(body, context={})

        # Return as Server-Sent Events stream
        return StreamingResponse(
            result,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )
    except Exception as e:
        # Log error and return error response
        import traceback

        print(f"Error processing ChatKit request: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)

        # Return error in ChatKit event format
        error_event = {
            "type": "error",
            "code": "server_error",
            "message": str(e),
            "allow_retry": True,
        }

        import json

        return StreamingResponse(
            iter([f"data: {json.dumps(error_event)}\n\n".encode()]),
            media_type="text/event-stream",
        )


@app.get("/debug/threads")
async def debug_threads():
    """Debug endpoint to list all threads"""
    try:
        threads = await backend.store.load_threads(limit=50, order="desc", context={})
        return {
            "threads": [
                {
                    "id": t.id,
                    "title": t.title,
                    "created_at": str(t.created_at),
                    "status": t.status,
                }
                for t in threads.data
            ]
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/debug/thread/{thread_id}")
async def debug_thread(thread_id: str):
    """Debug endpoint to view a specific thread"""
    try:
        thread = await backend.store.load_thread(thread_id, context={})
        items = await backend.store.load_thread_items(
            thread_id, limit=100, order="asc", context={}
        )
        return {
            "thread": {
                "id": thread.id,
                "title": thread.title,
                "created_at": str(thread.created_at),
                "status": thread.status,
            },
            "items": [
                {
                    "id": item.id,
                    "type": item.type,
                    "created_at": str(item.created_at),
                    "content": (
                        [
                            {
                                "type": c.type if hasattr(c, "type") else "text",
                                "text": c.text if hasattr(c, "text") else str(c),
                            }
                            for c in item.content
                        ]
                        if hasattr(item, "content")
                        else []
                    ),
                }
                for item in items.data
            ],
        }
    except Exception as e:
        return {"error": str(e)}


def main():
    """Start the server"""
    print("=" * 60)
    print("ChatKit Agent Builder Backend")
    print("=" * 60)
    print(f"Agent: {agent.name}")
    print(f"Model: {agent.model}")
    print(f"Instructions: {agent.instructions[:80]}...")
    print()
    print("Starting server on http://localhost:8000")
    print()
    print("Endpoints:")
    print("  POST /chatkit          - ChatKit protocol endpoint")
    print("  GET  /                 - Health check")
    print("  GET  /health           - Detailed health")
    print("  GET  /debug/threads    - List threads")
    print("  GET  /debug/thread/:id - View thread")
    print()
    print("Ready to receive requests from promptfoo!")
    print("=" * 60)
    print()

    # Check if OPENAI_API_KEY is set
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠️  WARNING: OPENAI_API_KEY environment variable not set!")
        print("   The agent will not be able to make OpenAI API calls.")
        print()

    # Start the server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()
