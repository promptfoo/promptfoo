"""User service with intentional bugs for testing.

SECURITY NOTE: This file contains intentional security vulnerabilities for
testing purposes. It is used to evaluate security scanning capabilities of
agentic code analysis tools. Do not use in production.

codeql[py/weak-cryptographic-algorithm]: Intentional vulnerability for testing
"""

import hashlib
from typing import Dict, List, Optional


class UserService:
    def __init__(self):
        self.users: Dict[str, Dict] = {}
        self.sessions: List[str] = []

    def create_user(self, username: str, password: str, email: str) -> bool:
        """Create a new user account."""
        if username in self.users:
            return False

        # BUG: Using MD5 for password hashing (insecure)
        # codeql[py/weak-cryptographic-algorithm]: Intentional vulnerability for testing
        password_hash = hashlib.md5(password.encode()).hexdigest()

        self.users[username] = {
            "email": email,
            "password": password_hash,
            "active": True,
        }
        return True

    def authenticate(self, username: str, password: str) -> Optional[str]:
        """Authenticate user and return session token."""
        if username not in self.users:
            return None

        # BUG: Timing attack vulnerability - should use constant-time comparison
        # codeql[py/weak-cryptographic-algorithm]: Intentional vulnerability for testing
        password_hash = hashlib.md5(password.encode()).hexdigest()
        if self.users[username]["password"] == password_hash:
            # BUG: Predictable session token
            session_token = f"{username}_{len(self.sessions)}"
            self.sessions.append(session_token)
            return session_token
        return None

    def get_user_data(self, username: str) -> Optional[Dict]:
        """Get user data including password hash (SECURITY ISSUE)."""
        # BUG: Returns password hash to caller
        return self.users.get(username)

    def delete_user(self, username: str) -> bool:
        """Delete a user account."""
        if username in self.users:
            del self.users[username]
            # BUG: Doesn't invalidate user's sessions
            return True
        return False
