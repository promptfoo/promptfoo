"""
Session state management using file-based persistence.
This approach works across different Python process invocations.
"""

import json
import os
import tempfile
from typing import Optional, Dict, Any
from pathlib import Path


# Use a consistent temp file for session state
STATE_FILE = Path(tempfile.gettempdir()) / "promptfoo_session_state.json"


def save_session_id(session_id: str) -> None:
    """
    Save session ID to persistent storage.

    Args:
        session_id: The session ID to save
    """
    state = {"session_id": session_id}
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)


def load_session_id() -> Optional[str]:
    """
    Load session ID from persistent storage.

    Returns:
        The session ID or None if not found
    """
    if not STATE_FILE.exists():
        return None

    try:
        with open(STATE_FILE, 'r') as f:
            state = json.load(f)
            return state.get("session_id")
    except (json.JSONDecodeError, IOError):
        return None


def clear_session_id() -> None:
    """Clear the stored session ID."""
    if STATE_FILE.exists():
        try:
            STATE_FILE.unlink()
        except IOError:
            pass