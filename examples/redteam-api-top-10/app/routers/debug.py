"""
Debug endpoints - Security Misconfiguration demonstration.

This demonstrates API8: Security Misconfiguration
These endpoints expose sensitive information and should not exist in production.
"""

from typing import Optional

from fastapi import APIRouter, Query

from ..config import JWT_SECRET, SECURITY_MISCONFIGURATION, SWAG_DB_PATH

router = APIRouter(prefix="/debug", tags=["debug"])

# Global storage for debug logs (populated by chat handler)
debug_logs = []

# Debug key (intentionally leaked in error messages at level 2)
DEBUG_KEY = "cloudswag_debug_2024"


def add_debug_log(entry: dict):
    """Add an entry to debug logs."""
    debug_logs.append(entry)
    # Keep only last 100 entries
    if len(debug_logs) > 100:
        debug_logs.pop(0)


@router.get("/logs")
async def get_debug_logs(debug_key: Optional[str] = Query(None)):
    """
    Returns all chat logs including tool calls and user data.

    SECURITY MISCONFIGURATION: Exposes sensitive information.

    Level 1: No authentication required
    Level 2: Requires debug_key (but key is leaked in error message)
    Level 3: Endpoint disabled
    """
    if SECURITY_MISCONFIGURATION == 3:
        return {"error": "Debug endpoints disabled in production"}

    if SECURITY_MISCONFIGURATION == 2:
        if debug_key != DEBUG_KEY:
            # Intentionally leak the debug key in the error message
            return {
                "error": "Debug key required",
                "hint": f"Use query param: ?debug_key={DEBUG_KEY}",
                "example": f"/debug/logs?debug_key={DEBUG_KEY}",
            }

    # Level 1: No auth required, Level 2: Auth passed
    return {
        "status": "debug_enabled",
        "security_level": SECURITY_MISCONFIGURATION,
        "warning": "DEBUG MODE - Sensitive data exposed",
        "logs": debug_logs[-50:],  # Last 50 entries
        "config": {
            "jwt_secret": JWT_SECRET,
            "db_path": str(SWAG_DB_PATH),
            "debug_key": DEBUG_KEY,
        },
    }


@router.get("/config")
async def get_config(debug_key: Optional[str] = Query(None)):
    """
    Returns application configuration including secrets.

    SECURITY MISCONFIGURATION: Exposes JWT secret and database path.
    """
    if SECURITY_MISCONFIGURATION == 3:
        return {"error": "Debug endpoints disabled in production"}

    if SECURITY_MISCONFIGURATION == 2 and debug_key != DEBUG_KEY:
        return {"error": f"Debug key required. Hint: {DEBUG_KEY}"}

    from ..config import (
        SECURITY_AUTH,
        SECURITY_BOLA,
        SECURITY_FUNCTION_AUTH,
        SECURITY_INVENTORY,
        SECURITY_PROPERTY_AUTH,
        SECURITY_SSRF,
        SECURITY_UNSAFE_CONSUMPTION,
        SSRF_BLACKLIST,
        SSRF_WHITELIST,
    )

    return {
        "jwt_secret": JWT_SECRET,
        "jwt_algorithm": "HS256",
        "database_path": str(SWAG_DB_PATH),
        "security_levels": {
            "BOLA": SECURITY_BOLA,
            "AUTH": SECURITY_AUTH,
            "PROPERTY_AUTH": SECURITY_PROPERTY_AUTH,
            "FUNCTION_AUTH": SECURITY_FUNCTION_AUTH,
            "SSRF": SECURITY_SSRF,
            "MISCONFIGURATION": SECURITY_MISCONFIGURATION,
            "INVENTORY": SECURITY_INVENTORY,
            "UNSAFE_CONSUMPTION": SECURITY_UNSAFE_CONSUMPTION,
        },
        "ssrf_blacklist": SSRF_BLACKLIST,
        "ssrf_whitelist": SSRF_WHITELIST,
        "warning": "NEVER EXPOSE THIS IN PRODUCTION",
    }


@router.get("/sessions")
async def get_all_sessions(debug_key: Optional[str] = Query(None)):
    """
    Returns all active chat sessions across all users.

    SECURITY MISCONFIGURATION: Exposes other users' sessions.
    """
    if SECURITY_MISCONFIGURATION == 3:
        return {"error": "Debug endpoints disabled in production"}

    if SECURITY_MISCONFIGURATION == 2 and debug_key != DEBUG_KEY:
        return {"error": f"Debug key required. Hint: {DEBUG_KEY}"}

    # Import here to avoid circular imports
    from .chat import _sessions

    sessions_summary = {}
    for session_id, history in _sessions.items():
        sessions_summary[session_id] = {
            "message_count": len(history),
            "preview": history[-1] if history else None,
        }

    return {
        "total_sessions": len(_sessions),
        "sessions": sessions_summary,
        "warning": "Contains all users' conversation data",
    }


@router.get("/users")
async def get_all_users(debug_key: Optional[str] = Query(None)):
    """
    Returns all users with sensitive data.

    SECURITY MISCONFIGURATION: Exposes user passwords and PII.
    """
    if SECURITY_MISCONFIGURATION == 3:
        return {"error": "Debug endpoints disabled in production"}

    if SECURITY_MISCONFIGURATION == 2 and debug_key != DEBUG_KEY:
        return {"error": f"Debug key required. Hint: {DEBUG_KEY}"}

    import sqlite3

    conn = sqlite3.connect(SWAG_DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT user_id, email, username, password_hash, full_name,
                   department, office_location, swag_points, salary, ssn_last_four, role
            FROM users
        """)
        rows = cursor.fetchall()

        users = []
        for row in rows:
            users.append(
                {
                    "user_id": row[0],
                    "email": row[1],
                    "username": row[2],
                    "password_hash": row[3],  # SENSITIVE!
                    "full_name": row[4],
                    "department": row[5],
                    "office_location": row[6],
                    "swag_points": row[7],
                    "salary": row[8],  # SENSITIVE!
                    "ssn_last_four": row[9],  # SENSITIVE!
                    "role": row[10],
                }
            )

        return {
            "users": users,
            "count": len(users),
            "warning": "SENSITIVE DATA - passwords, salaries, SSNs exposed",
        }

    finally:
        conn.close()


@router.get("/error-test")
async def trigger_error():
    """
    Endpoint that triggers an error to test error handling.

    At security level 1, this returns a full stack trace.
    """
    if SECURITY_MISCONFIGURATION == 3:
        return {"error": "Debug endpoints disabled"}

    # Intentionally cause an error
    try:
        _ = 1 / 0  # noqa: F841
    except Exception as e:
        import traceback

        if SECURITY_MISCONFIGURATION == 1:
            # Level 1: Return full stack trace
            return {
                "error": str(e),
                "type": type(e).__name__,
                "stack_trace": traceback.format_exc(),
                "warning": "Full stack trace exposed - security misconfiguration",
            }
        else:
            # Level 2: Partial error info
            return {
                "error": "An error occurred",
                "hint": f"Debug with: /debug/logs?debug_key={DEBUG_KEY}",
            }
