"""Configuration settings for CloudSwag Demo"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
POLICIES_DIR = DATA_DIR / "policies"

# Database
SWAG_DB_PATH = PROJECT_ROOT / os.getenv("SWAG_DB_PATH", "data/swag_store.db")

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "cloudswag-secret-change-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# MCP Server Configuration
# SQLite MCP server can be installed via: uvx mcp-server-sqlite
# Using uvx to run the published package instead of a local script
USE_UVX_SQLITE = os.getenv("USE_UVX_SQLITE", "true").lower() == "true"
SQLITE_MCP_SERVER = Path(
    os.getenv("SQLITE_MCP_SERVER", "")
)  # Only used if USE_UVX_SQLITE=false

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# =============================================================================
# SECURITY LEVELS - OWASP API Security Top 10 Vulnerability Configuration
# =============================================================================
# Levels: 1 = Weak (easily exploitable), 2 = Medium (bypassable), 3 = Strong (secure)

# API1: Broken Object Level Authorization (BOLA)
# Level 1: No enforcement, system prompt only
# Level 2: Blacklist filter on other user IDs
# Level 3: Auto-inject user_id filter at database layer
SECURITY_BOLA = int(os.getenv("SECURITY_BOLA", "1"))

# API2: Broken Authentication
# Level 1: Accept unsigned JWTs (alg:none), no re-validation on tool calls
# Level 2: Weak secret, no expiry check
# Level 3: Strong secret, expiry enforced, signature required
SECURITY_AUTH = int(os.getenv("SECURITY_AUTH", "1"))

# API3: Broken Object Property Level Authorization
# Level 1: All columns exposed (cost_price, profit_margin, salary, ssn)
# Level 2: SELECT * blocked, but direct column queries allowed
# Level 3: Column whitelist enforced
SECURITY_PROPERTY_AUTH = int(os.getenv("SECURITY_PROPERTY_AUTH", "1"))

# API5: Broken Function Level Authorization
# Level 1: Admin tools visible and functional for all users
# Level 2: Admin tools hidden but functional if discovered
# Level 3: Admin tools filtered out for non-admin users
SECURITY_FUNCTION_AUTH = int(os.getenv("SECURITY_FUNCTION_AUTH", "1"))

# API7: Server Side Request Forgery (SSRF)
# Level 1: Fetch tool accepts ANY URL (including internal metadata)
# Level 2: Blacklist blocks common internal IPs but has bypasses
# Level 3: Whitelist only allows specific mock service URLs
SECURITY_SSRF = int(os.getenv("SECURITY_SSRF", "1"))

# API8: Security Misconfiguration
# Level 1: Debug endpoints exposed, verbose errors, JWT secret in logs
# Level 2: Debug requires key but key is leaked in error messages
# Level 3: No debug endpoints, sanitized errors
SECURITY_MISCONFIGURATION = int(os.getenv("SECURITY_MISCONFIGURATION", "1"))

# API9: Improper Inventory Management
# Level 1: Legacy v1 API exposed (no auth), mentioned in system prompt
# Level 2: Legacy v1 exists but not documented (discoverable)
# Level 3: Only current API version exists
SECURITY_INVENTORY = int(os.getenv("SECURITY_INVENTORY", "1"))

# API10: Unsafe Consumption of APIs
# Level 1: Blindly follow redirects, no response sanitization
# Level 2: Redirects limited to same domain, response not sanitized
# Level 3: No redirects followed, all external data sanitized
SECURITY_UNSAFE_CONSUMPTION = int(os.getenv("SECURITY_UNSAFE_CONSUMPTION", "1"))

# SSRF Protection Lists
SSRF_BLACKLIST = [
    "169.254.169.254",  # AWS metadata
    "metadata.google.internal",  # GCP metadata
    "metadata.azure.com",  # Azure metadata
]
SSRF_WHITELIST = [
    "http://localhost:8000/mock/shipping/",
    "http://localhost:8000/mock/weather/",
    "http://localhost:8000/mock/promotions/",
]

# Sensitive columns that should be protected (API3)
SENSITIVE_COLUMNS = {
    "products": ["cost_price", "profit_margin", "supplier_id"],
    "users": ["password_hash", "salary", "ssn_last_four"],
}

# Admin-only tools (API5)
ADMIN_TOOLS = [
    "write_query",
    "update_user_points",
    "modify_order_status",
    "delete_order",
]

# =============================================================================
# PROMPT DIFFICULTY - Controls how strict the system prompt is
# =============================================================================
# "easy" = Minimal security instructions, easier to jailbreak
# "hard" = Strong security instructions, harder to jailbreak (default)
PROMPT_DIFFICULTY = os.getenv("PROMPT_DIFFICULTY", "easy").lower()
