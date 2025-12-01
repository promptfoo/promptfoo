"""
SSRF Protection Levels

Level 0 (none): No protection - vulnerable to SSRF
Level 1 (blocklist): Block known internal hosts - can be bypassed
Level 2 (allowlist): Only allow approved domains - recommended approach
"""
from urllib.parse import urlparse
import ipaddress
import socket


def no_protection(url: str) -> tuple[bool, str | None]:
    """Level 0: No protection - allows any URL (VULNERABLE)"""
    return True, None


def blocklist_protection(url: str) -> tuple[bool, str | None]:
    """
    Level 1: Blocklist approach - block known internal hosts

    This is better than nothing but has many bypasses:
    - URL encoding tricks
    - Alternative IP representations (decimal, hex, octal)
    - DNS rebinding
    - IPv6 representations
    """
    parsed = urlparse(url)
    hostname = parsed.hostname

    if not hostname:
        return False, "Invalid URL: no hostname"

    # Block common internal hostnames
    blocked_hosts = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "169.254.169.254",  # AWS metadata
        "metadata.google.internal",  # GCP metadata
        "169.254.169.253",  # Azure metadata
    ]

    if hostname.lower() in blocked_hosts:
        return False, f"Blocked: {hostname} is a known internal host"

    # Check if it's an IP address in private ranges
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private:
            return False, f"Blocked: {hostname} is a private IP"
        if ip.is_loopback:
            return False, f"Blocked: {hostname} is a loopback address"
        if ip.is_link_local:
            return False, f"Blocked: {hostname} is a link-local address"
    except ValueError:
        # Not an IP address, it's a hostname - could still resolve to internal IP
        # A more robust implementation would resolve DNS and check the IP
        pass

    return True, None


# Domains that are allowed to be fetched
ALLOWED_DOMAINS = [
    "example.com",
    "httpbin.org",
    "api.github.com",
    "jsonplaceholder.typicode.com",
]


def allowlist_protection(url: str) -> tuple[bool, str | None]:
    """
    Level 2: Allowlist approach - only allow explicitly approved domains

    This is the recommended approach:
    - Only pre-approved domains can be accessed
    - Much harder to bypass
    - Principle of least privilege
    """
    parsed = urlparse(url)
    hostname = parsed.hostname

    if not hostname:
        return False, "Invalid URL: no hostname"

    # Check against allowlist
    if hostname.lower() not in ALLOWED_DOMAINS:
        return False, f"Blocked: {hostname} not in allowlist. Allowed: {ALLOWED_DOMAINS}"

    # Additional safety: resolve DNS and verify it doesn't point to internal IP
    try:
        resolved_ip = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(resolved_ip)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            return False, f"Blocked: {hostname} resolves to internal IP {resolved_ip}"
    except socket.gaierror:
        return False, f"Blocked: Could not resolve {hostname}"

    return True, None
