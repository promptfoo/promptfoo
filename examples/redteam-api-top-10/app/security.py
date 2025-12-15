"""
Centralized security validation based on environment configuration.

This module provides security checks for the OWASP API Security Top 10 vulnerabilities.
Security levels: 1 = Weak (exploitable), 2 = Medium (bypassable), 3 = Strong (secure)
"""

import re
from typing import List, Optional, Tuple

from .config import (
    ADMIN_TOOLS,
    PROMPT_DIFFICULTY,
    SECURITY_AUTH,
    SECURITY_BOLA,
    SECURITY_FUNCTION_AUTH,
    SECURITY_INVENTORY,
    SECURITY_MISCONFIGURATION,
    SECURITY_PROPERTY_AUTH,
    SECURITY_SSRF,
    SECURITY_UNSAFE_CONSUMPTION,
    SENSITIVE_COLUMNS,
    SSRF_BLACKLIST,
    SSRF_WHITELIST,
)

# All demo user IDs for BOLA blacklist filtering
ALL_USER_IDS = ["emp_001", "emp_002", "emp_003", "emp_004", "emp_005"]


def validate_sql_query(query: str, user_id: str) -> Tuple[bool, str, Optional[str]]:
    """
    Validate SQL query based on SECURITY_BOLA level.

    Returns:
        Tuple of (is_allowed, modified_query_or_error, error_message_if_blocked)

    Level 1 (Weak): No validation - queries pass through unchanged
    Level 2 (Medium): Blacklist filter - reject queries mentioning other user IDs
    Level 3 (Strong): Auto-inject user_id filter at database layer
    """
    query_lower = query.lower().strip()

    if SECURITY_BOLA == 3:
        # Level 3: Strong - Auto-wrap queries with user_id filter
        # Only apply to SELECT queries on orders table
        if "from orders" in query_lower and "where user_id" not in query_lower:
            # Inject user_id filter
            if "where" in query_lower:
                # Add to existing WHERE
                modified = re.sub(
                    r"(where\s+)",
                    f"WHERE user_id = '{user_id}' AND ",
                    query,
                    flags=re.IGNORECASE,
                )
            else:
                # Add WHERE clause
                modified = re.sub(
                    r"(from\s+orders)",
                    f"FROM orders WHERE user_id = '{user_id}'",
                    query,
                    flags=re.IGNORECASE,
                )
            return True, modified, None
        return True, query, None

    elif SECURITY_BOLA == 2:
        # Level 2: Medium - Blacklist other user IDs
        other_users = [uid for uid in ALL_USER_IDS if uid != user_id]
        for other_id in other_users:
            if other_id in query_lower:
                return (
                    False,
                    query,
                    f"Access denied: Cannot query data for user '{other_id}'",
                )
        return True, query, None

    else:
        # Level 1: Weak - No validation, queries pass through unchanged
        return True, query, None


def validate_url(url: str) -> Tuple[bool, Optional[str]]:
    """
    Validate URL for SSRF based on SECURITY_SSRF level.

    Returns:
        Tuple of (is_allowed, error_message_if_blocked)

    Level 1 (Weak): No validation - any URL allowed
    Level 2 (Medium): Blacklist common internal IPs (but has bypasses)
    Level 3 (Strong): Whitelist only specific mock service URLs
    """
    url_lower = url.lower()

    if SECURITY_SSRF == 3:
        # Level 3: Strong - Whitelist only
        if any(url.startswith(allowed) for allowed in SSRF_WHITELIST):
            return True, None
        return (
            False,
            f"URL not in allowed list. Only these URLs are permitted: {SSRF_WHITELIST}",
        )

    elif SECURITY_SSRF == 2:
        # Level 2: Medium - Blacklist (but has bypasses like 0.0.0.0, [::1], etc.)
        for blocked in SSRF_BLACKLIST:
            if blocked in url_lower:
                return False, f"Blocked URL pattern: {blocked}"

        # Block obvious localhost patterns (but not all bypasses)
        if "127.0.0.1" in url_lower:
            return False, "Internal URL blocked: 127.0.0.1"
        if "localhost" in url_lower and "/mock/" not in url_lower:
            return False, "Internal URL blocked: localhost (except /mock/ endpoints)"

        return True, None

    else:
        # Level 1: Weak - No validation, any URL allowed
        return True, None


def filter_sensitive_columns(query: str, table: str) -> Tuple[bool, str, Optional[str]]:
    """
    Filter sensitive columns based on SECURITY_PROPERTY_AUTH level.

    Level 1 (Weak): All columns exposed
    Level 2 (Medium): SELECT * blocked, but direct column queries allowed
    Level 3 (Strong): Column whitelist enforced - sensitive columns blocked
    """
    query_lower = query.lower()
    sensitive = SENSITIVE_COLUMNS.get(table, [])

    if SECURITY_PROPERTY_AUTH == 3:
        # Level 3: Strong - Block any query requesting sensitive columns
        for col in sensitive:
            if col in query_lower:
                return False, query, f"Access denied: Column '{col}' is restricted"
        return True, query, None

    elif SECURITY_PROPERTY_AUTH == 2:
        # Level 2: Medium - Block SELECT * on tables with sensitive data
        if sensitive and "select *" in query_lower and table in query_lower:
            return (
                False,
                query,
                f"SELECT * not allowed on {table} table. Specify columns explicitly.",
            )
        return True, query, None

    else:
        # Level 1: Weak - All columns exposed
        return True, query, None


def filter_tools(tools: List[dict], user_role: str) -> List[dict]:
    """
    Filter admin tools based on SECURITY_FUNCTION_AUTH level.

    Level 1 (Weak): All tools visible and functional
    Level 2 (Medium): Admin tools available but not mentioned in system prompt
    Level 3 (Strong): Admin tools filtered out for non-admin users
    """
    if SECURITY_FUNCTION_AUTH == 3:
        # Level 3: Strong - Filter out admin tools for non-admins
        if user_role != "admin":
            return [t for t in tools if t.get("name") not in ADMIN_TOOLS]
        return tools

    # Level 1 & 2: All tools available (level 2 just hides them from prompt)
    return tools


def should_mention_admin_tools() -> bool:
    """Determine if admin tools should be mentioned in system prompt."""
    # Level 1: Mention all tools including admin
    # Level 2 & 3: Don't mention admin tools in prompt
    return SECURITY_FUNCTION_AUTH == 1


def should_mention_legacy_api() -> bool:
    """Determine if legacy v1 API should be mentioned in system prompt."""
    # Level 1: Mention v1 API in system prompt
    # Level 2: v1 exists but not documented
    # Level 3: v1 doesn't exist
    return SECURITY_INVENTORY == 1


def is_legacy_api_enabled() -> bool:
    """Check if legacy v1 API endpoints should be active."""
    # Level 1 & 2: Legacy API exists
    # Level 3: Legacy API disabled
    return SECURITY_INVENTORY < 3


def is_debug_enabled() -> bool:
    """Check if debug endpoints should be active."""
    return SECURITY_MISCONFIGURATION < 3


def get_debug_access_level() -> int:
    """Get the debug access level."""
    return SECURITY_MISCONFIGURATION


def should_follow_redirects() -> bool:
    """Check if external API redirects should be followed."""
    # Level 1: Follow all redirects
    # Level 2: Follow same-domain redirects only
    # Level 3: Don't follow redirects
    return SECURITY_UNSAFE_CONSUMPTION == 1


def sanitize_external_response(response: str) -> str:
    """Sanitize response from external APIs."""
    if SECURITY_UNSAFE_CONSUMPTION == 3:
        # Level 3: Sanitize response
        # Remove potential XSS, script tags, etc.
        sanitized = re.sub(
            r"<script[^>]*>.*?</script>", "", response, flags=re.IGNORECASE | re.DOTALL
        )
        sanitized = re.sub(r"javascript:", "", sanitized, flags=re.IGNORECASE)
        return sanitized
    # Level 1 & 2: Return unsanitized
    return response


def get_security_status() -> dict:
    """Get current security configuration status."""
    return {
        "BOLA": {"level": SECURITY_BOLA, "name": "Broken Object Level Authorization"},
        "AUTH": {"level": SECURITY_AUTH, "name": "Broken Authentication"},
        "PROPERTY_AUTH": {
            "level": SECURITY_PROPERTY_AUTH,
            "name": "Broken Object Property Level Authorization",
        },
        "FUNCTION_AUTH": {
            "level": SECURITY_FUNCTION_AUTH,
            "name": "Broken Function Level Authorization",
        },
        "SSRF": {"level": SECURITY_SSRF, "name": "Server Side Request Forgery"},
        "MISCONFIGURATION": {
            "level": SECURITY_MISCONFIGURATION,
            "name": "Security Misconfiguration",
        },
        "INVENTORY": {
            "level": SECURITY_INVENTORY,
            "name": "Improper Inventory Management",
        },
        "UNSAFE_CONSUMPTION": {
            "level": SECURITY_UNSAFE_CONSUMPTION,
            "name": "Unsafe Consumption of APIs",
        },
        "PROMPT_DIFFICULTY": {
            "level": PROMPT_DIFFICULTY,
            "name": "System Prompt Difficulty (easy/hard)",
        },
    }
