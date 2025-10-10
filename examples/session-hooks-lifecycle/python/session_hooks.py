import os
import asyncio
import json
from typing import Optional, Dict, Any
from session_service import get_session_service
from session_state import save_session_id, load_session_id, clear_session_id


async def session_hook(hook_name: str, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extension hook for managing session lifecycle.
    This hook creates a session before all tests and cleans it up after.

    Args:
        hook_name: The name of the hook being called
        context: Hook context object

    Returns:
        Modified context for beforeAll/beforeEach, None for afterAll/afterEach
    """
    service = get_session_service()

    if hook_name == "beforeAll":
        print("\n=== Session Lifecycle Hook: Setting up ===")

        try:
            # Initialize the session service
            await service.initialize()

            # Get user ID from environment or use default
            user_id = os.getenv("TEST_USER_ID", "test-user-123")

            # Create a new session
            session_id = service.create_session(user_id)

            # Store session ID in persistent storage (works across Python processes)
            save_session_id(session_id)

            print(f"✓ Session created successfully: {session_id}")
            print(f"✓ User ID: {user_id}")
            print("===========================================\n")

            # Return the context (required for beforeAll/beforeEach)
            return context

        except Exception as error:
            print(f"✗ Failed to create session: {str(error)}")
            print("===========================================\n")
            # Don't throw - let tests fail gracefully with clear error messages
            return context

    elif hook_name == "afterAll":
        print("\n=== Session Lifecycle Hook: Cleaning up ===")

        # Load session ID from persistent storage
        session_id = load_session_id()

        if session_id:
            try:
                # Get final stats before closing
                stats = service.get_stats()
                print(f"✓ Session stats: {json.dumps(stats)}")

                # Close the session
                service.close_session(session_id)
                print(f"✓ Session closed: {session_id}")

                # Clear the persistent state
                clear_session_id()

            except Exception as error:
                print(f"⚠ Warning during cleanup: {str(error)}")
        else:
            print("ℹ No session to clean up")

        print("============================================\n")
        # Don't return anything from afterAll/afterEach
        return None

    # For other hooks, just pass through
    return None