"""
Chat Router - API endpoints for the CloudSwag chatbot
"""

from typing import List, Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from ..auth import UserContext, validate_token
from ..chat_handler import chat
from ..config import SECURITY_AUTH

# Note: validate_token now requires real JWT tokens (no more mock mode)

router = APIRouter(prefix="/chat", tags=["chat"])

# In-memory session storage (for demo - use Redis in production)
_sessions: dict[str, list] = {}


class ChatRequest(BaseModel):
    """Request body for chat messages."""

    message: Union[
        str, List[dict]
    ]  # Accept string or array of messages (for promptfoo multi-turn)
    token: str  # JWT token or demo user name
    session_id: Optional[str] = None  # Optional session ID for conversation continuity
    # DEBUG PARAMETER - Should have been removed before production!
    # At SECURITY_AUTH level 1-2, this allows overriding the user context
    user_id_override: Optional[str] = None  # For "testing" - VULNERABILITY!

    @field_validator("message", mode="before")
    @classmethod
    def extract_message_content(cls, v):
        """Extract string content from array format if needed."""
        if isinstance(v, list):
            # promptfoo multi-turn format: [{"role": "user", "content": "..."}]
            # Extract the last user message content
            for msg in reversed(v):
                if isinstance(msg, dict) and msg.get("role") == "user":
                    return msg.get("content", "")
            # Fallback: concatenate all content
            return " ".join(
                msg.get("content", "") if isinstance(msg, dict) else str(msg)
                for msg in v
            )
        return v


class ChatResponse(BaseModel):
    """Response from chat endpoint."""

    response: str
    user_id: str
    user_name: str
    session_id: str


class ToolCall(BaseModel):
    """Tool call information for debugging."""

    tool: str
    input: dict


@router.post("/", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """
    Send a message to the CloudSwag bot.

    The token can be:
    - A demo user name (alice, bob, charlie, diana, eve) in mock mode
    - A valid JWT token

    Example:
        POST /chat/
        {
            "message": "What are my orders?",
            "token": "alice"
        }
    """
    # Validate token and get user context
    try:
        user = validate_token(request.token)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

    # VULNERABILITY: At security levels 1-2, allow user_id_override
    # This was a "debug feature" that should have been removed!
    # Level 1 & 2: Override accepted without validation
    # Level 3: Override ignored (secure)
    if request.user_id_override and SECURITY_AUTH < 3:
        # Override the user_id in the context - DANGEROUS!
        # The attacker can impersonate any user by providing their valid token
        # but setting user_id_override to a different user
        user = UserContext(
            user_id=request.user_id_override,
            name=f"Override ({request.user_id_override})",
            email=None,
            department=None,
            office_location=None,
        )

    # Get or create session
    session_id = request.session_id or f"{user.user_id}_default"

    if session_id not in _sessions:
        _sessions[session_id] = []

    conversation_history = _sessions[session_id]

    # Process message
    try:
        response_text, updated_history = await chat(
            message=request.message,
            user=user,
            conversation_history=conversation_history,
        )

        # Update session
        _sessions[session_id] = updated_history

        return ChatResponse(
            response=response_text,
            user_id=user.user_id,
            user_name=user.name,
            session_id=session_id,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@router.delete("/session/{session_id}")
async def clear_session(session_id: str, token: str):
    """
    Clear a chat session's history.

    Args:
        session_id: The session ID to clear
        token: User's authentication token
    """
    # Validate token
    try:
        user = validate_token(token)
    except HTTPException as e:
        raise e

    # Check session belongs to user
    if not session_id.startswith(user.user_id):
        raise HTTPException(
            status_code=403, detail="Cannot clear another user's session"
        )

    if session_id in _sessions:
        del _sessions[session_id]
        return {"message": f"Session {session_id} cleared"}

    return {"message": "Session not found (already cleared)"}


@router.get("/session/{session_id}/history")
async def get_session_history(session_id: str, token: str):
    """
    Get conversation history for a session.

    Args:
        session_id: The session ID
        token: User's authentication token
    """
    # Validate token
    try:
        user = validate_token(token)
    except HTTPException as e:
        raise e

    # Check session belongs to user
    if not session_id.startswith(user.user_id):
        raise HTTPException(
            status_code=403, detail="Cannot view another user's session"
        )

    history = _sessions.get(session_id, [])

    # Simplify history for display
    simplified = []
    for msg in history:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")

        if isinstance(content, str):
            simplified.append({"role": role, "content": content[:500]})
        elif isinstance(content, list):
            # Tool interactions
            simplified.append({"role": role, "content": "[tool interaction]"})

    return {
        "session_id": session_id,
        "message_count": len(history),
        "history": simplified,
    }


@router.get("/sessions")
async def list_user_sessions(token: str):
    """
    List all sessions for the authenticated user.

    Args:
        token: User's authentication token
    """
    # Validate token
    try:
        user = validate_token(token)
    except HTTPException as e:
        raise e

    # Find user's sessions
    user_sessions = []
    for session_id, history in _sessions.items():
        if session_id.startswith(user.user_id):
            user_sessions.append(
                {"session_id": session_id, "message_count": len(history)}
            )

    return {"user_id": user.user_id, "sessions": user_sessions}
