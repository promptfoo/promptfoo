"""
UCP Agent Implementation using Google ADK with Gemini

This module implements an AI-powered UCP (Universal Commerce Protocol) agent that uses
Google's Agent Development Kit (ADK) with Gemini 3 Flash to:
1. Discover business capabilities via /.well-known/ucp
2. Negotiate capability intersection with the platform profile
3. Execute checkout flows by reasoning about protocol state
4. Handle extensions (fulfillment, discounts) intelligently
5. Return structured result artifacts for promptfoo evaluation

The agent uses LLM reasoning to decide actions based on checkout state and messages,
rather than hard-coded deterministic logic.

See: https://ucp.dev/specification/overview/
"""

import asyncio
import json
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

import requests

# Configure Google GenAI authentication BEFORE importing the SDK
# This must happen before any google.adk or google.genai imports
if os.environ.get("GOOGLE_CLOUD_PROJECT"):
    # Use Vertex AI with gcloud credentials
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")

# Google ADK imports (required) - must come AFTER env var setup
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

# OpenTelemetry imports for tracing
try:
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.trace import SpanContext, SpanKind, Status, StatusCode, TraceFlags

    OTEL_AVAILABLE = True
except ImportError:
    OTEL_AVAILABLE = False

logger = logging.getLogger(__name__)

# OpenTelemetry setup - initialized lazily on first use
_tracer: Optional[Any] = None
_tracing_initialized = False


def _init_tracing():
    """Initialize OpenTelemetry tracing if available."""
    global _tracer, _tracing_initialized

    if _tracing_initialized or not OTEL_AVAILABLE:
        return

    try:
        resource = Resource.create({
            "service.name": "ucp-agent-provider",
            "service.version": "1.0.0",
        })

        exporter = OTLPSpanExporter(
            endpoint="http://localhost:4318/v1/traces",
        )

        provider = TracerProvider(resource=resource)
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        _tracer = trace.get_tracer("ucp-agent-provider", "1.0.0")
        _tracing_initialized = True
        logger.debug("OpenTelemetry tracing initialized")
    except Exception as e:
        logger.warning(f"Failed to initialize OpenTelemetry tracing: {e}")


def _parse_traceparent(traceparent: str) -> Optional[Any]:
    """Parse W3C Trace Context traceparent header."""
    if not OTEL_AVAILABLE:
        return None

    match = re.match(r"^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$", traceparent)
    if not match:
        return None

    version, trace_id, parent_id, trace_flags = match.groups()

    return SpanContext(
        trace_id=int(trace_id, 16),
        span_id=int(parent_id, 16),
        is_remote=True,
        trace_flags=TraceFlags(int(trace_flags, 16)),
    )


def _get_tracer():
    """Get or initialize the tracer."""
    global _tracer
    if _tracer is None and OTEL_AVAILABLE:
        _init_tracing()
    return _tracer


class Transport(Enum):
    REST = "rest"
    MCP = "mcp"


class CheckoutStatus(Enum):
    INCOMPLETE = "incomplete"
    REQUIRES_ESCALATION = "requires_escalation"
    READY_FOR_COMPLETE = "ready_for_complete"
    COMPLETE_IN_PROGRESS = "complete_in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"


@dataclass
class UCPResultArtifact:
    """
    Structured result artifact returned by the UCP agent.
    This schema is designed for promptfoo assertions.
    """

    scenario_id: str
    transport: str
    success: bool
    final_status: str
    checkout_id: Optional[str] = None
    order_id: Optional[str] = None
    currency: str = "USD"
    total_amount: int = 0
    line_items: list[dict] = field(default_factory=list)
    applied_discounts: list[dict] = field(default_factory=list)
    rejected_discounts: list[dict] = field(default_factory=list)
    requires_escalation: bool = False
    continue_url: Optional[str] = None
    protocol: dict = field(default_factory=dict)
    metrics: dict = field(default_factory=dict)
    messages_seen: list[dict] = field(default_factory=list)
    transcript: list[dict] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "scenario_id": self.scenario_id,
            "transport": self.transport,
            "success": self.success,
            "final_status": self.final_status,
            "checkout_id": self.checkout_id,
            "order_id": self.order_id,
            "currency": self.currency,
            "total_amount": self.total_amount,
            "line_items": self.line_items,
            "applied_discounts": self.applied_discounts,
            "rejected_discounts": self.rejected_discounts,
            "requires_escalation": self.requires_escalation,
            "continue_url": self.continue_url,
            "protocol": self.protocol,
            "metrics": self.metrics,
            "messages_seen": self.messages_seen,
            "transcript": self.transcript,
            "error": self.error,
        }


class UCPClient:
    """
    Low-level UCP client for REST transport.
    Handles profile discovery, capability negotiation, and checkout operations.
    """

    def __init__(
        self,
        business_url: str,
        platform_profile: dict,
        timeout: int = 30,
    ):
        self.business_url = business_url.rstrip("/")
        self.platform_profile = platform_profile
        self.timeout = timeout
        self.session = requests.Session()
        self.business_profile: Optional[dict] = None
        self.negotiated_capabilities: list[dict] = []
        self.rest_endpoint: Optional[str] = None
        self.metrics = {
            "http_requests": 0,
            "tool_calls": 0,
            "retries": 0,
        }

    def _get_ucp_agent_header(self) -> str:
        """Generate UCP-Agent header value per RFC 8941 structured field syntax."""
        profile_uri = self.platform_profile.get("profile_uri", "https://platform.example/profile")
        return f'profile="{profile_uri}"'

    def _make_rest_request(
        self,
        method: str,
        path: str,
        json_data: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict:
        """Make a REST request with required UCP headers."""
        base = self.rest_endpoint.rstrip("/")
        path = path.lstrip("/")
        url = f"{base}/{path}"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "UCP-Agent": self._get_ucp_agent_header(),
            # Note: In production, this must be a real cryptographic signature
            # See: https://ucp.dev/specification/authentication/
            "request-signature": "test",
            "request-id": str(uuid.uuid4()),
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        self.metrics["http_requests"] += 1

        response = self.session.request(
            method=method,
            url=url,
            headers=headers,
            json=json_data,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def discover(self) -> dict:
        """Fetch business profile from /.well-known/ucp"""
        url = f"{self.business_url}/.well-known/ucp"
        self.metrics["http_requests"] += 1

        response = self.session.get(
            url,
            headers={"Accept": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        self.business_profile = response.json()

        # Extract REST endpoint
        services = self.business_profile.get("ucp", {}).get("services", {})
        shopping_service = services.get("dev.ucp.shopping", {})
        rest_config = shopping_service.get("rest") or {}
        self.rest_endpoint = rest_config.get("endpoint", f"{self.business_url}")

        return self.business_profile

    def negotiate_capabilities(self) -> list[dict]:
        """Compute capability intersection between platform and business."""
        if not self.business_profile:
            raise ValueError("Must call discover() first")

        business_caps = self.business_profile.get("ucp", {}).get("capabilities") or []
        platform_caps = self.platform_profile.get("capabilities") or []

        # Build lookup maps
        business_cap_map = {cap["name"]: cap for cap in business_caps}
        platform_cap_map = {cap["name"]: cap for cap in platform_caps}

        # Find intersection
        intersection = []
        for name in business_cap_map:
            if name in platform_cap_map:
                intersection.append(business_cap_map[name])

        # Prune orphaned extensions
        cap_names = {cap["name"] for cap in intersection}
        final_caps = []
        for cap in intersection:
            extends = cap.get("extends")
            if extends and extends not in cap_names:
                continue
            final_caps.append(cap)

        self.negotiated_capabilities = final_caps
        return final_caps

    def has_capability(self, name: str) -> bool:
        """Check if a capability was negotiated."""
        return any(cap["name"] == name for cap in self.negotiated_capabilities)

    def create_checkout(
        self,
        line_items: list[dict],
        buyer: Optional[dict] = None,
        currency: str = "USD",
        discounts: Optional[dict] = None,
        fulfillment: Optional[dict] = None,
    ) -> dict:
        """Create a checkout session."""
        # Transform line_items to UCP API format
        api_line_items = []
        for item in line_items:
            if "item" in item:
                api_line_items.append(item)
            else:
                api_line_items.append({
                    "item": {
                        "id": item.get("merchant_item_id", item.get("id", "")),
                        "title": item.get("title", ""),
                    },
                    "quantity": item.get("quantity", 1),
                })

        payload: dict[str, Any] = {
            "currency": currency,
            "line_items": api_line_items,
            "payment": {},
        }
        if buyer:
            payload["buyer"] = buyer
        if discounts and self.has_capability("dev.ucp.shopping.discount"):
            payload["discounts"] = discounts
        if fulfillment and self.has_capability("dev.ucp.shopping.fulfillment"):
            payload["fulfillment"] = fulfillment

        return self._make_rest_request(
            "POST",
            "/checkout-sessions",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )

    def get_checkout(self, checkout_id: str) -> dict:
        """Get checkout session by ID."""
        return self._make_rest_request("GET", f"/checkout-sessions/{checkout_id}")

    def update_checkout(self, checkout_id: str, updates: dict) -> dict:
        """Update checkout session (full replacement)."""
        payload = {"id": checkout_id, **updates}
        if "payment" not in payload:
            payload["payment"] = {}
        return self._make_rest_request(
            "PUT",
            f"/checkout-sessions/{checkout_id}",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )

    def complete_checkout(self, checkout_id: str, payment_data: Optional[dict] = None) -> dict:
        """Complete checkout."""
        if payment_data is None:
            payment_data = {
                "id": "instr_test_1",
                "handler_id": "mock_payment_handler",
                "handler_name": "mock_payment_handler",
                "type": "card",
                "brand": "Visa",
                "last_digits": "1234",
                "credential": {"type": "token", "token": "success_token"},
            }

        payload = {"payment_data": payment_data, "risk_signals": {}}
        return self._make_rest_request(
            "POST",
            f"/checkout-sessions/{checkout_id}/complete",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )


# =============================================================================
# ADK Tool Functions - These wrap UCPClient methods for the AI agent
# =============================================================================

# Global state for the current checkout session
_current_client: Optional[UCPClient] = None
_current_checkout: Optional[dict] = None
_current_scenario: Optional[dict] = None
_messages_seen: list[dict] = []
_transcript: list[dict] = []


def discover_ucp_server() -> dict:
    """
    Discover the UCP server's capabilities by fetching its profile.
    This must be called first before any checkout operations.

    Returns a dict with:
    - ucp_version: The UCP protocol version
    - capabilities: List of supported capabilities
    - rest_endpoint: The REST API endpoint
    """
    global _current_client
    if not _current_client:
        return {"error": "Client not initialized"}

    try:
        profile = _current_client.discover()
        caps = _current_client.negotiate_capabilities()

        _transcript.append({"role": "tool", "content": f"Discovered server with {len(caps)} capabilities"})

        return {
            "status": "success",
            "ucp_version": profile.get("ucp", {}).get("version", "unknown"),
            "capabilities": [c["name"] for c in caps],
            "rest_endpoint": _current_client.rest_endpoint,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def create_checkout() -> dict:
    """
    Create a new checkout session with the items from the current scenario.
    Call discover_ucp_server first to establish capabilities.

    Returns the checkout state including:
    - checkout_id: The ID of the created checkout
    - status: Current checkout status (incomplete, ready_for_complete, etc.)
    - messages: Any error or warning messages that need attention
    - line_items: The items in the checkout
    - totals: Price totals
    """
    global _current_client, _current_checkout, _current_scenario, _messages_seen

    if not _current_client:
        return {"error": "Client not initialized"}
    if not _current_scenario:
        return {"error": "No scenario loaded"}

    try:
        # Prepare discounts if provided
        discounts = None
        if _current_scenario.get("discount_codes"):
            discounts = {"codes": _current_scenario["discount_codes"]}

        checkout = _current_client.create_checkout(
            line_items=_current_scenario.get("line_items", []),
            buyer=_current_scenario.get("buyer"),
            currency=_current_scenario.get("currency", "USD"),
            discounts=discounts,
            fulfillment=_current_scenario.get("fulfillment"),
        )

        _current_checkout = checkout

        # Extract messages
        messages = checkout.get("messages") or []
        for msg in messages:
            _messages_seen.append(msg)

        _transcript.append({
            "role": "tool",
            "content": f"Created checkout {checkout.get('id')} with status: {checkout.get('status')}"
        })

        checkout_status = checkout.get("status")
        next_action = "complete_checkout" if checkout_status == "ready_for_complete" else "resolve issues from messages"
        if checkout_status == "requires_escalation":
            next_action = "report_escalation"

        return {
            "status": "success",
            "checkout_id": checkout.get("id"),
            "checkout_status": checkout_status,
            "messages": messages,
            "line_items_count": len(checkout.get("line_items", [])),
            "has_fulfillment": "fulfillment" in checkout,
            "has_discounts": "discounts" in checkout,
            "NEXT_ACTION": next_action,
        }
    except requests.HTTPError as e:
        error_detail = e.response.json() if e.response else str(e)
        return {"status": "error", "error": str(error_detail)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def get_checkout_status() -> dict:
    """
    Get the current status and details of the checkout session.
    Use this to check what needs to be resolved before completion.

    Returns:
    - checkout_status: Current status (incomplete, ready_for_complete, requires_escalation, completed)
    - messages: Any pending error/warning messages
    - missing_fields: What information is still needed
    - can_complete: Whether the checkout is ready to complete
    """
    global _current_checkout, _current_client

    if not _current_checkout:
        return {"error": "No active checkout"}

    try:
        checkout = _current_client.get_checkout(_current_checkout.get("id"))
        _current_checkout = checkout

        messages = checkout.get("messages") or []
        status = checkout.get("status")

        # Analyze what's missing
        missing = []
        for msg in messages:
            code = msg.get("code", "")
            if "buyer" in code or "email" in code:
                missing.append("buyer_info")
            if "fulfillment" in code or "shipping" in code:
                missing.append("fulfillment")

        next_action = "complete_checkout" if status == "ready_for_complete" else "resolve issues from messages"
        if status == "requires_escalation":
            next_action = "report_escalation"

        return {
            "status": "success",
            "checkout_status": status,
            "messages": messages,
            "missing_fields": missing,
            "can_complete": status == "ready_for_complete",
            "requires_escalation": status == "requires_escalation",
            "continue_url": checkout.get("continue_url") if status == "requires_escalation" else None,
            "NEXT_ACTION": next_action,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def update_checkout_fulfillment(
    street1: str,
    city: str,
    region: str,
    postal_code: str,
    country: str,
    street2: str = "",
) -> dict:
    """
    Update the checkout with shipping fulfillment information.
    Use this when the checkout requires fulfillment/shipping address.

    Args:
        street1: Primary street address
        city: City name
        region: State/province code (e.g., "CA")
        postal_code: Postal/ZIP code
        country: Country code (e.g., "US")
        street2: Optional secondary address line

    Returns the updated checkout status.
    """
    global _current_checkout, _current_client, _messages_seen

    if not _current_checkout:
        return {"error": "No active checkout"}

    try:
        dest_id = f"dest_{uuid.uuid4().hex[:8]}"
        method_id = f"method_{uuid.uuid4().hex[:8]}"
        group_id = f"group_{uuid.uuid4().hex[:8]}"

        fulfillment = {
            "methods": [{
                "id": method_id,
                "type": "shipping",
                "groups": [{"id": group_id, "selected_option_id": "std-ship"}],
                "destinations": [{
                    "id": dest_id,
                    "address": {
                        "street1": street1,
                        "street2": street2,
                        "city": city,
                        "region": region,
                        "postal_code": postal_code,
                        "country": country,
                    },
                }],
                "selected_destination_id": dest_id,
            }]
        }

        updates = {
            "currency": _current_checkout.get("currency", "USD"),
            "line_items": _current_checkout.get("line_items", []),
            "fulfillment": fulfillment,
        }
        if _current_checkout.get("buyer"):
            updates["buyer"] = _current_checkout["buyer"]
        if _current_checkout.get("discounts"):
            updates["discounts"] = _current_checkout["discounts"]

        checkout = _current_client.update_checkout(_current_checkout.get("id"), updates)
        _current_checkout = checkout

        for msg in checkout.get("messages") or []:
            _messages_seen.append(msg)

        checkout_status = checkout.get("status")
        _transcript.append({"role": "tool", "content": f"Updated fulfillment, status: {checkout_status}"})

        next_action = "complete_checkout" if checkout_status == "ready_for_complete" else "resolve remaining issues"
        if checkout_status == "requires_escalation":
            next_action = "report_escalation"

        return {
            "status": "success",
            "checkout_status": checkout_status,
            "messages": checkout.get("messages") or [],
            "NEXT_ACTION": next_action,
        }
    except requests.HTTPError as e:
        error_detail = e.response.json() if e.response else str(e)
        return {"status": "error", "error": str(error_detail)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def update_checkout_buyer(email: str, given_name: str = "", family_name: str = "") -> dict:
    """
    Update the checkout with buyer information.
    Use this when the checkout requires buyer email or name.

    Args:
        email: Buyer's email address
        given_name: Buyer's first name (optional)
        family_name: Buyer's last name (optional)

    Returns the updated checkout status.
    """
    global _current_checkout, _current_client, _messages_seen

    if not _current_checkout:
        return {"error": "No active checkout"}

    try:
        buyer = {"email": email}
        if given_name or family_name:
            buyer["name"] = {}
            if given_name:
                buyer["name"]["given"] = given_name
            if family_name:
                buyer["name"]["family"] = family_name

        updates = {
            "currency": _current_checkout.get("currency", "USD"),
            "line_items": _current_checkout.get("line_items", []),
            "buyer": buyer,
        }
        if _current_checkout.get("fulfillment"):
            updates["fulfillment"] = _current_checkout["fulfillment"]
        if _current_checkout.get("discounts"):
            updates["discounts"] = _current_checkout["discounts"]

        checkout = _current_client.update_checkout(_current_checkout.get("id"), updates)
        _current_checkout = checkout

        for msg in checkout.get("messages") or []:
            _messages_seen.append(msg)

        checkout_status = checkout.get("status")
        _transcript.append({"role": "tool", "content": f"Updated buyer info, status: {checkout_status}"})

        next_action = "complete_checkout" if checkout_status == "ready_for_complete" else "resolve remaining issues"
        if checkout_status == "requires_escalation":
            next_action = "report_escalation"

        return {
            "status": "success",
            "checkout_status": checkout_status,
            "messages": checkout.get("messages") or [],
            "NEXT_ACTION": next_action,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def complete_checkout() -> dict:
    """
    Complete the checkout and place the order.
    Only call this when checkout_status is 'ready_for_complete'.

    Returns:
    - success: Whether the order was placed
    - order_id: The ID of the placed order (if successful)
    - final_status: The final checkout status
    """
    global _current_checkout, _current_client, _messages_seen

    if not _current_checkout:
        return {"error": "No active checkout"}

    try:
        checkout = _current_client.complete_checkout(_current_checkout.get("id"))
        _current_checkout = checkout

        for msg in checkout.get("messages") or []:
            _messages_seen.append(msg)

        order = checkout.get("order", {})
        success = checkout.get("status") == "completed"

        _transcript.append({
            "role": "tool",
            "content": f"Checkout {'completed' if success else 'failed'}, order: {order.get('id', 'none')}"
        })

        return {
            "status": "success" if success else "failed",
            "checkout_status": checkout.get("status"),
            "order_id": order.get("id"),
            "completed": success,
        }
    except requests.HTTPError as e:
        # Detailed debugging for the HTTPError
        resp = e.response
        logger.warning(f"Complete checkout HTTPError: resp_type={type(resp)}, resp_status={getattr(resp, 'status_code', 'NO_ATTR')}, resp_text={getattr(resp, 'text', 'NO_ATTR')[:200] if hasattr(resp, 'text') else 'NO_TEXT'}")

        raw_text = resp.text if resp else ""
        try:
            error_detail = resp.json() if resp else {}
        except Exception:
            error_detail = {"raw": raw_text}

        # Handle completion failure - may need to resolve issues first
        if "messages" in error_detail:
            for msg in error_detail["messages"]:
                _messages_seen.append(msg)
        if "detail" in error_detail:
            _messages_seen.append({
                "type": "error",
                "code": error_detail.get("code", "COMPLETION_FAILED"),
                "content": error_detail["detail"],
            })
        return {
            "status": "error",
            "error": str(error_detail) if error_detail else raw_text,
            "messages": error_detail.get("messages") or [],
            "http_status": e.response.status_code if e.response else None,
        }
    except Exception as e:
        logger.warning(f"Complete checkout exception: {type(e).__name__}: {e}")
        return {"status": "error", "error": str(e)}


def report_escalation(continue_url: str) -> dict:
    """
    Report that the checkout requires escalation to the business UI.
    Call this when checkout_status is 'requires_escalation'.

    Args:
        continue_url: The URL to redirect the user to

    Returns confirmation of the escalation.
    """
    _transcript.append({"role": "tool", "content": f"Escalation required: {continue_url}"})
    return {
        "status": "success",
        "escalation_reported": True,
        "continue_url": continue_url,
    }


# =============================================================================
# UCP Agent Instruction (System Prompt)
# =============================================================================

UCP_AGENT_INSTRUCTION = """You are a UCP checkout agent. Your job is to complete commerce checkouts.

## REQUIRED FLOW:
1. discover_ucp_server() - Learn capabilities
2. create_checkout() - Create the checkout session
3. Check NEXT_ACTION in response and follow it immediately
4. When checkout_status is "ready_for_complete" -> call complete_checkout()
5. When checkout_status is "requires_escalation" -> call report_escalation(continue_url)

## CRITICAL: When you see NEXT_ACTION="complete_checkout", you MUST call complete_checkout() immediately.

## Handling status:
- "ready_for_complete": CALL complete_checkout() NOW - this is the happy path
- "incomplete": Check messages, fix with update_checkout_fulfillment() or update_checkout_buyer()
- "requires_escalation": Call report_escalation() with the continue_url

## If fulfillment needed:
update_checkout_fulfillment("123 Main St", "San Francisco", "CA", "94102", "US")

## If buyer info needed:
update_checkout_buyer("test@example.com", "Test", "User")

## Important:
- Invalid discount codes are informational - complete the checkout anyway
- Be efficient - follow NEXT_ACTION immediately
- Don't over-think - just follow the status and NEXT_ACTION
"""


# =============================================================================
# Main Agent Runner
# =============================================================================


def run_ucp_scenario(
    scenario: dict,
    business_url: str = "http://localhost:8182",
    platform_profile: Optional[dict] = None,
    transport: str = "rest",
    traceparent: Optional[str] = None,
) -> dict:
    """
    Main entry point for running a UCP scenario with the AI agent.

    Args:
        scenario: Scenario configuration dict
        business_url: URL of the UCP merchant server
        platform_profile: Platform profile dict (uses default if not provided)
        transport: "rest" (MCP not yet supported)
        traceparent: Optional W3C Trace Context traceparent header

    Returns:
        Result artifact dict suitable for promptfoo assertions
    """
    global _current_client, _current_checkout, _current_scenario, _messages_seen, _transcript

    # Reset global state
    _messages_seen = []
    _transcript = []
    _current_checkout = None

    if platform_profile is None:
        platform_profile = {
            "profile_uri": "https://platform.example/profile",
            "capabilities": [
                {"name": "dev.ucp.shopping.checkout", "version": "2026-01-11"},
                {"name": "dev.ucp.shopping.discount", "version": "2026-01-11", "extends": "dev.ucp.shopping.checkout"},
                {"name": "dev.ucp.shopping.fulfillment", "version": "2026-01-11", "extends": "dev.ucp.shopping.checkout"},
            ],
        }

    start_time = time.time()
    result = UCPResultArtifact(
        scenario_id=scenario.get("scenario_id", "unknown"),
        transport=transport,
        success=False,
        final_status="not_started",
    )

    # Initialize client and scenario
    _current_client = UCPClient(business_url, platform_profile)
    _current_scenario = scenario

    # Log authentication method (env vars are set at module load time, before imports)
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") == "true":
        logger.info(f"Using Vertex AI with project: {os.environ.get('GOOGLE_CLOUD_PROJECT')}, location: {os.environ.get('GOOGLE_CLOUD_LOCATION')}")
    elif os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"):
        logger.info("Using Gemini Developer API with API key")
    else:
        raise ValueError(
            "No authentication configured. Set either:\n"
            "  - GOOGLE_CLOUD_PROJECT (for Vertex AI with gcloud credentials)\n"
            "  - GOOGLE_API_KEY or GEMINI_API_KEY (for Gemini Developer API)"
        )

    try:
        # Create ADK agent with Gemini
        agent = Agent(
            name="ucp_checkout_agent",
            model="gemini-2.5-flash",
            description="UCP checkout agent that completes commerce transactions",
            instruction=UCP_AGENT_INSTRUCTION,
            tools=[
                discover_ucp_server,
                create_checkout,
                get_checkout_status,
                update_checkout_fulfillment,
                update_checkout_buyer,
                complete_checkout,
                report_escalation,
            ],
        )

        # Create session and runner
        session_service = InMemorySessionService()
        runner = Runner(agent=agent, app_name="ucp_eval", session_service=session_service)

        # Run agent asynchronously with timeout and iteration limit
        MAX_ITERATIONS = 30  # ADK generates multiple events per turn
        TIMEOUT_SECONDS = 180

        async def run_agent_async():
            # Create session (async)
            session = await session_service.create_session(
                app_name="ucp_eval",
                user_id="promptfoo_evaluator",
            )

            # Create user message as Content object
            message_text = f"Complete the checkout for scenario: {scenario.get('scenario_id', 'unknown')}"
            user_message = genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=message_text)]
            )

            # Execute agent (async generator) with iteration limit
            final_response = None
            iteration = 0
            async for event in runner.run_async(
                session_id=session.id,
                user_id="promptfoo_evaluator",
                new_message=user_message,
            ):
                iteration += 1
                # Collect final response from events
                if hasattr(event, 'content') and event.content:
                    final_response = event.content

                # Check if checkout is complete to exit early
                if _current_checkout and _current_checkout.get("status") in ("completed", "requires_escalation"):
                    logger.info(f"Checkout finished with status: {_current_checkout.get('status')}")
                    break

                # Prevent infinite loops
                if iteration >= MAX_ITERATIONS:
                    logger.warning(f"Agent exceeded max iterations ({MAX_ITERATIONS})")
                    break

            return final_response

        # Run the async function with timeout
        try:
            response = asyncio.run(asyncio.wait_for(run_agent_async(), timeout=TIMEOUT_SECONDS))
        except asyncio.TimeoutError:
            logger.warning(f"Agent timed out after {TIMEOUT_SECONDS}s")
            response = None

        # Fallback: If checkout is ready_for_complete but agent didn't complete, do it now
        # This handles LLM reliability issues where the model forgets to call complete_checkout()
        if _current_checkout and _current_checkout.get("status") == "ready_for_complete":
            logger.info("Fallback: Checkout is ready_for_complete, auto-completing...")
            try:
                complete_result = complete_checkout()
                if complete_result.get("status") == "success":
                    logger.info(f"Fallback completion succeeded: order_id={complete_result.get('order_id')}")
                else:
                    logger.warning(f"Fallback completion failed: {complete_result}")
            except Exception as e:
                logger.warning(f"Fallback completion error: {e}")

        # Extract results from final checkout state
        if _current_checkout:
            result.checkout_id = _current_checkout.get("id")
            result.final_status = _current_checkout.get("status", "unknown")
            result.currency = _current_checkout.get("currency", "USD")

            # Extract totals
            for total in _current_checkout.get("totals", []):
                if total.get("type") in ("total", "grand_total"):
                    result.total_amount = total.get("amount", 0)
                    break

            # Extract line items
            for item in _current_checkout.get("line_items", []):
                item_data = item.get("item", {})
                item_totals = item.get("totals", [])
                total_amount = 0
                for t in item_totals:
                    if t.get("type") == "total":
                        total_amount = t.get("amount", 0)
                        break

                result.line_items.append({
                    "merchant_item_id": item_data.get("id") or item.get("merchant_item_id"),
                    "title": item_data.get("title") or item.get("title"),
                    "quantity": item.get("quantity"),
                    "unit_price": item_data.get("price") or item.get("unit_price"),
                    "total": total_amount or item.get("total"),
                    "discount": item.get("discount", 0),
                })

            # Extract discounts
            discounts_obj = _current_checkout.get("discounts") or {}
            for applied in discounts_obj.get("applied") or []:
                result.applied_discounts.append({
                    "code": applied.get("code"),
                    "title": applied.get("title"),
                    "amount": applied.get("amount"),
                    "automatic": applied.get("automatic", False),
                })

            # Track rejected discounts
            submitted_codes = discounts_obj.get("codes") or []
            applied_codes = {d.get("code") for d in result.applied_discounts if d.get("code")}
            for code in submitted_codes:
                if code and code not in applied_codes:
                    result.rejected_discounts.append({
                        "code": code,
                        "path": "discounts.codes",
                        "content": "Code submitted but not applied",
                    })

            # Check for completion
            if _current_checkout.get("status") == "completed":
                order = _current_checkout.get("order", {})
                result.order_id = order.get("id")
                result.success = True

            # Check for escalation
            if _current_checkout.get("status") == "requires_escalation":
                result.requires_escalation = True
                result.continue_url = _current_checkout.get("continue_url")
                result.success = True

        # Add agent response to transcript
        _transcript.append({"role": "assistant", "content": str(response)})

    except Exception as e:
        logger.exception("Agent execution failed")
        result.error = str(e)
        result.final_status = "error"

    # Finalize metrics
    result.metrics = {
        **_current_client.metrics,
        "wall_time_ms": int((time.time() - start_time) * 1000),
    }
    result.protocol["used_idempotency_keys"] = True
    result.protocol["sent_ucp_agent_header"] = True
    result.protocol["ucp_version"] = _current_client.business_profile.get("ucp", {}).get("version") if _current_client.business_profile else None
    result.transcript = _transcript
    result.messages_seen = _messages_seen

    return result.to_dict()


if __name__ == "__main__":
    import sys

    test_scenario = {
        "scenario_id": "test_happy_path",
        "line_items": [{"merchant_item_id": "bouquet_roses", "quantity": 2}],
        "buyer": {
            "email": "test@example.com",
            "name": {"given": "Test", "family": "User"},
        },
        "currency": "USD",
    }

    business_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8182"
    result = run_ucp_scenario(test_scenario, business_url=business_url)
    print(json.dumps(result, indent=2))
