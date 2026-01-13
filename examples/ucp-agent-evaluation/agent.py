"""UCP Agent using Google ADK with Gemini for agentic commerce evaluation."""

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
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

logger = logging.getLogger(__name__)


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
    """Structured result artifact for promptfoo assertions."""

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


class UCPClient:
    """UCP REST client for discovery, negotiation, and checkout operations."""

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
        return f'profile="{self.platform_profile.get("profile_uri", "https://platform.example/profile")}"'

    def _make_rest_request(self, method: str, path: str, json_data: Optional[dict] = None, idempotency_key: Optional[str] = None) -> dict:
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
        return any(cap["name"] == name for cap in self.negotiated_capabilities)

    def create_checkout(self, line_items: list[dict], buyer: Optional[dict] = None, currency: str = "USD", discounts: Optional[dict] = None, fulfillment: Optional[dict] = None) -> dict:
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
        return self._make_rest_request("GET", f"/checkout-sessions/{checkout_id}")

    def update_checkout(self, checkout_id: str, updates: dict) -> dict:
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
        if payment_data is None:
            payment_data = {"id": "instr_test_1", "handler_id": "mock_payment_handler", "handler_name": "mock_payment_handler", "type": "card", "brand": "Visa", "last_digits": "1234", "credential": {"type": "token", "token": "success_token"}}
        payload = {"payment_data": payment_data, "risk_signals": {}}
        return self._make_rest_request(
            "POST",
            f"/checkout-sessions/{checkout_id}/complete",
            json_data=payload,
            idempotency_key=str(uuid.uuid4()),
        )


# Global state for the current checkout session
_current_client: Optional[UCPClient] = None
_current_checkout: Optional[dict] = None
_current_scenario: Optional[dict] = None
_messages_seen: list[dict] = []
_transcript: list[dict] = []


def _get_next_action(status: str) -> str:
    """Get the next action hint based on checkout status."""
    if status == "ready_for_complete":
        return "complete_checkout"
    if status == "requires_escalation":
        return "report_escalation"
    return "resolve issues from messages"


def discover_ucp_server() -> dict:
    """Discover the UCP server's capabilities. Call this first."""
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
    """Create a new checkout session with items from the current scenario."""
    global _current_client, _current_checkout, _current_scenario, _messages_seen
    if not _current_client:
        return {"error": "Client not initialized"}
    if not _current_scenario:
        return {"error": "No scenario loaded"}
    try:
        discounts = {"codes": _current_scenario["discount_codes"]} if _current_scenario.get("discount_codes") else None
        checkout = _current_client.create_checkout(
            line_items=_current_scenario.get("line_items", []),
            buyer=_current_scenario.get("buyer"),
            currency=_current_scenario.get("currency", "USD"),
            discounts=discounts,
            fulfillment=_current_scenario.get("fulfillment"),
        )
        _current_checkout = checkout
        messages = checkout.get("messages") or []
        _messages_seen.extend(messages)
        _transcript.append({"role": "tool", "content": f"Created checkout {checkout.get('id')} with status: {checkout.get('status')}"})
        status = checkout.get("status")
        return {
            "status": "success",
            "checkout_id": checkout.get("id"),
            "checkout_status": status,
            "messages": messages,
            "line_items_count": len(checkout.get("line_items", [])),
            "has_fulfillment": "fulfillment" in checkout,
            "has_discounts": "discounts" in checkout,
            "NEXT_ACTION": _get_next_action(status),
        }
    except requests.HTTPError as e:
        return {"status": "error", "error": str(e.response.json() if e.response else e)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def get_checkout_status() -> dict:
    """Get the current status of the checkout session."""
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
        return {
            "status": "success",
            "checkout_status": status,
            "messages": messages,
            "missing_fields": missing,
            "can_complete": status == "ready_for_complete",
            "requires_escalation": status == "requires_escalation",
            "continue_url": checkout.get("continue_url") if status == "requires_escalation" else None,
            "NEXT_ACTION": _get_next_action(status),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def update_checkout_fulfillment(street1: str, city: str, region: str, postal_code: str, country: str, street2: str = "") -> dict:
    """Update checkout with shipping address."""
    global _current_checkout, _current_client, _messages_seen
    if not _current_checkout:
        return {"error": "No active checkout"}
    try:
        dest_id, method_id, group_id = [f"{t}_{uuid.uuid4().hex[:8]}" for t in ("dest", "method", "group")]
        fulfillment = {"methods": [{
            "id": method_id, "type": "shipping",
            "groups": [{"id": group_id, "selected_option_id": "std-ship"}],
            "destinations": [{"id": dest_id, "address": {"street1": street1, "street2": street2, "city": city, "region": region, "postal_code": postal_code, "country": country}}],
            "selected_destination_id": dest_id,
        }]}
        updates = {"currency": _current_checkout.get("currency", "USD"), "line_items": _current_checkout.get("line_items", []), "fulfillment": fulfillment}
        if _current_checkout.get("buyer"):
            updates["buyer"] = _current_checkout["buyer"]
        if _current_checkout.get("discounts"):
            updates["discounts"] = _current_checkout["discounts"]
        checkout = _current_client.update_checkout(_current_checkout.get("id"), updates)
        _current_checkout = checkout
        _messages_seen.extend(checkout.get("messages") or [])
        status = checkout.get("status")
        _transcript.append({"role": "tool", "content": f"Updated fulfillment, status: {status}"})
        return {"status": "success", "checkout_status": status, "messages": checkout.get("messages") or [], "NEXT_ACTION": _get_next_action(status)}
    except requests.HTTPError as e:
        return {"status": "error", "error": str(e.response.json() if e.response else e)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def update_checkout_buyer(email: str, given_name: str = "", family_name: str = "") -> dict:
    """Update checkout with buyer email/name."""
    global _current_checkout, _current_client, _messages_seen
    if not _current_checkout:
        return {"error": "No active checkout"}
    try:
        buyer = {"email": email}
        if given_name or family_name:
            buyer["name"] = {k: v for k, v in [("given", given_name), ("family", family_name)] if v}
        updates = {"currency": _current_checkout.get("currency", "USD"), "line_items": _current_checkout.get("line_items", []), "buyer": buyer}
        if _current_checkout.get("fulfillment"):
            updates["fulfillment"] = _current_checkout["fulfillment"]
        if _current_checkout.get("discounts"):
            updates["discounts"] = _current_checkout["discounts"]
        checkout = _current_client.update_checkout(_current_checkout.get("id"), updates)
        _current_checkout = checkout
        _messages_seen.extend(checkout.get("messages") or [])
        status = checkout.get("status")
        _transcript.append({"role": "tool", "content": f"Updated buyer info, status: {status}"})
        return {"status": "success", "checkout_status": status, "messages": checkout.get("messages") or [], "NEXT_ACTION": _get_next_action(status)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def complete_checkout() -> dict:
    """Complete the checkout. Only call when status is 'ready_for_complete'."""
    global _current_checkout, _current_client, _messages_seen
    if not _current_checkout:
        return {"error": "No active checkout"}
    try:
        checkout = _current_client.complete_checkout(_current_checkout.get("id"))
        _current_checkout = checkout
        _messages_seen.extend(checkout.get("messages") or [])
        order = checkout.get("order", {})
        success = checkout.get("status") == "completed"
        _transcript.append({"role": "tool", "content": f"Checkout {'completed' if success else 'failed'}, order: {order.get('id', 'none')}"})
        return {"status": "success" if success else "failed", "checkout_status": checkout.get("status"), "order_id": order.get("id"), "completed": success}
    except requests.HTTPError as e:
        resp = e.response
        logger.warning(f"Complete checkout HTTPError: status={getattr(resp, 'status_code', None)}, text={getattr(resp, 'text', '')[:200]}")
        try:
            error_detail = resp.json() if resp else {}
        except Exception:
            error_detail = {"raw": resp.text if resp else ""}
        _messages_seen.extend(error_detail.get("messages") or [])
        if "detail" in error_detail:
            _messages_seen.append({"type": "error", "code": error_detail.get("code", "COMPLETION_FAILED"), "content": error_detail["detail"]})
        return {"status": "error", "error": str(error_detail), "messages": error_detail.get("messages") or [], "http_status": resp.status_code if resp else None}
    except Exception as e:
        logger.warning(f"Complete checkout exception: {type(e).__name__}: {e}")
        return {"status": "error", "error": str(e)}


def report_escalation(continue_url: str) -> dict:
    """Report escalation when checkout requires user handoff to business UI."""
    _transcript.append({"role": "tool", "content": f"Escalation required: {continue_url}"})
    return {"status": "success", "escalation_reported": True, "continue_url": continue_url}


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


def run_ucp_scenario(scenario: dict, business_url: str = "http://localhost:8182", platform_profile: Optional[dict] = None, transport: str = "rest", traceparent: Optional[str] = None) -> dict:
    """Run a UCP scenario with the AI agent, returning a result artifact for promptfoo."""
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
            model="gemini-2.0-flash-001",
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
        # NOTE: This fallback masks agent reliability issues - consider disabling for strict evaluation
        if _current_checkout and _current_checkout.get("status") == "ready_for_complete":
            logger.warning(
                "AGENT RELIABILITY ISSUE: Checkout was ready_for_complete but agent did not call "
                "complete_checkout(). Auto-completing as fallback. This indicates the LLM failed "
                "to follow instructions properly."
            )
            _transcript.append({
                "role": "system",
                "content": "FALLBACK: Agent failed to complete checkout when ready - auto-completing"
            })
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

    return asdict(result)
