import asyncio
from typing import Dict, Any
from session_service import get_session_service
from session_state import load_session_id


async def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Custom provider that uses a managed session.
    The session is created in the beforeAll hook and cleaned up in afterAll.

    Args:
        prompt: The prompt to send
        options: Provider options
        context: Provider context

    Returns:
        Provider response dict
    """
    # Load session ID from persistent storage (works across Python processes)
    session_id = load_session_id()
    if not session_id:
        raise RuntimeError(
            "No active session found. Make sure beforeAll hook ran successfully. "
            "The session should be created before any provider calls."
        )

    try:
        # Get the session service
        service = get_session_service()

        # Make request using the session
        response = await service.make_request(session_id, prompt)

        # Return in ProviderResponse format
        return {
            "output": response["text"],
            "metadata": {
                "sessionId": session_id,
                "requestCount": response["request_count"],
                "contextUsed": response["context_used"],
                "provider": "python-session-provider",
            },
        }
    except Exception as error:
        # Handle errors gracefully
        return {
            "error": f"Session provider error: {str(error)}",
            "metadata": {
                "sessionId": session_id,
                "provider": "python-session-provider",
                "errorType": type(error).__name__,
            },
        }