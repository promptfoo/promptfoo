import json
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path
import tempfile


class SessionService:
    """
    Mock session service that simulates a stateful API or database connection
    that requires session management. Uses file-based storage to persist
    sessions across Python process invocations.
    """

    def __init__(self):
        # Use a temp directory for session storage
        self.storage_dir = Path(tempfile.gettempdir()) / "promptfoo_sessions"
        self.storage_dir.mkdir(exist_ok=True)
        self.is_initialized = False

    async def initialize(self) -> None:
        """Initialize the service (simulated async operation)"""
        if not self.is_initialized:
            # Simulate service startup delay
            time.sleep(0.1)
            self.is_initialized = True
            print("SessionService initialized")

    def _get_session_file(self, session_id: str) -> Path:
        """Get the file path for a session."""
        return self.storage_dir / f"{session_id}.json"

    def _save_session(self, session: Dict[str, Any]) -> None:
        """Save session to file."""
        session_file = self._get_session_file(session["id"])
        with open(session_file, 'w') as f:
            json.dump(session, f, indent=2)

    def _load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load session from file."""
        session_file = self._get_session_file(session_id)
        if not session_file.exists():
            return None
        try:
            with open(session_file, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def create_session(self, user_id: str) -> str:
        """
        Create a new session for a user.

        Args:
            user_id: The user ID to create a session for

        Returns:
            The created session ID

        Raises:
            RuntimeError: If service is not initialized
        """
        if not self.is_initialized:
            raise RuntimeError("SessionService not initialized. Call initialize() first.")

        session_id = str(uuid.uuid4())
        session = {
            "id": session_id,
            "user_id": user_id,
            "created_at": datetime.now().isoformat(),
            "conversation_history": [],
            "metadata": {
                "request_count": 0,
                "last_activity": datetime.now().isoformat(),
            },
        }

        self._save_session(session)
        print(f"Session created for user {user_id}: {session_id}")
        return session_id

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a session by ID.

        Args:
            session_id: The session ID to retrieve

        Returns:
            The session dict or None if not found
        """
        return self._load_session(session_id)

    async def make_request(self, session_id: str, prompt: str) -> Dict[str, Any]:
        """
        Make a request within a session context.

        Args:
            session_id: The session ID
            prompt: The prompt/request to process

        Returns:
            The response object

        Raises:
            ValueError: If session is not found
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Update activity timestamp
        session["metadata"]["last_activity"] = datetime.now().isoformat()
        session["metadata"]["request_count"] += 1

        # Build context from conversation history (last 3 exchanges)
        context_history = self._build_context(session["conversation_history"][-3:])

        # Simulate an API call with session context
        time.sleep(0.05)

        # Generate a mock response that shows session awareness
        response_text = (
            f'Response to: "{prompt}"\n'
            f'(Session has {len(session["conversation_history"])} prior exchanges, '
            f'request #{session["metadata"]["request_count"]} for user {session["user_id"]})'
        )

        # Store in conversation history
        session["conversation_history"].append(
            {
                "prompt": prompt,
                "response": response_text,
                "timestamp": datetime.now().isoformat(),
            }
        )

        # Save updated session to file
        self._save_session(session)

        return {
            "text": response_text,
            "request_count": session["metadata"]["request_count"],
            "session_id": session_id,
            "context_used": len(context_history) > 0,
        }

    def _build_context(self, history: List[Dict[str, Any]]) -> str:
        """Build context string from conversation history."""
        if not history:
            return ""

        context_parts = []
        for entry in history:
            context_parts.append(f"User: {entry['prompt']}\nAssistant: {entry['response']}")

        return "\n\n".join(context_parts)

    def close_session(self, session_id: str) -> None:
        """
        Close a session and clean up resources.

        Args:
            session_id: The session ID to close
        """
        session = self.get_session(session_id)
        if session:
            created_at = datetime.fromisoformat(session["created_at"])
            duration = (datetime.now() - created_at).total_seconds() * 1000

            print(f"Closing session {session_id} for user {session['user_id']}")
            print(f"  Total requests: {session['metadata']['request_count']}")
            print(f"  Duration: {duration:.0f}ms")

            # Delete the session file
            session_file = self._get_session_file(session_id)
            if session_file.exists():
                session_file.unlink()

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about active sessions.

        Returns:
            Session statistics dict
        """
        # Count active sessions by counting JSON files
        session_files = list(self.storage_dir.glob("*.json"))
        total_requests = 0

        for session_file in session_files:
            try:
                with open(session_file, 'r') as f:
                    session = json.load(f)
                    total_requests += session["metadata"]["request_count"]
            except (json.JSONDecodeError, IOError, KeyError):
                continue

        return {
            "active_sessions": len(session_files),
            "total_requests": total_requests,
        }


# Singleton instance
_service_instance: Optional[SessionService] = None


def get_session_service() -> SessionService:
    """Get the singleton SessionService instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = SessionService()
    return _service_instance