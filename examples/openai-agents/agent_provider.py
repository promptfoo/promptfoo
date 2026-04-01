"""Promptfoo provider that evaluates a long-horizon OpenAI Agents workflow.

This example uses the official `openai-agents` Python SDK with:

- multi-turn execution over a persistent `SQLiteSession`
- agent handoffs between specialists
- tool usage that Promptfoo can assert on via OTLP traces
- a custom tracing bridge that forwards SDK spans into Promptfoo's OTLP receiver
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

from agents import (
    Agent,
    ItemHelpers,
    ModelSettings,
    RunContextWrapper,
    Runner,
    SQLiteSession,
    function_tool,
    handoff,
    trace,
)
from agents.items import HandoffOutputItem, MessageOutputItem, ToolCallOutputItem
from promptfoo_tracing import configure_promptfoo_tracing

DEFAULT_MODEL = os.getenv("OPENAI_AGENT_MODEL", "gpt-5.4-mini")
SESSION_DB_PATH = Path(__file__).with_name(".promptfoo-openai-agents.sqlite3")

RESERVATIONS: dict[str, dict[str, str]] = {
    "ABC123": {
        "passenger_name": "Ada Lovelace",
        "flight_number": "PF-101",
        "seat_number": "12A",
    },
    "XYZ789": {
        "passenger_name": "Grace Hopper",
        "flight_number": "PF-404",
        "seat_number": "4C",
    },
}

FAQ_ANSWERS = {
    "baggage": (
        "Each passenger may bring one carry-on bag and one personal item. "
        "Checked bags must be under 50 pounds and 62 linear inches."
    ),
    "wifi": "Wifi is free on flights over 90 minutes. Connect to Promptfoo-Air.",
    "food": (
        "We serve complimentary snacks and drinks on all flights. "
        "Meals are available on flights longer than 3 hours."
    ),
}

CONFIRMATION_NUMBER_RE = re.compile(
    r"\bconfirmation number(?: is|:)?\s+([A-Z0-9]{3,})\b", re.IGNORECASE
)
PASSENGER_NAME_RE = re.compile(
    r"\bmy name is\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)", re.IGNORECASE
)
SEAT_NUMBER_RE = re.compile(r"\bseat\s+([0-9]{1,2}[A-Z])\b", re.IGNORECASE)


class AirlineContext:
    def __init__(
        self,
        passenger_name: str | None = None,
        confirmation_number: str | None = None,
        seat_number: str | None = None,
        requested_seat_number: str | None = None,
        flight_number: str | None = None,
    ) -> None:
        self.passenger_name = passenger_name
        self.confirmation_number = confirmation_number
        self.seat_number = seat_number
        self.requested_seat_number = requested_seat_number
        self.flight_number = flight_number

    def to_dict(self) -> dict[str, str | None]:
        return {
            "passenger_name": self.passenger_name,
            "confirmation_number": self.confirmation_number,
            "seat_number": self.seat_number,
            "flight_number": self.flight_number,
        }


def _topic_for_question(question: str) -> str:
    lowered = question.lower()
    if "bag" in lowered or "luggage" in lowered:
        return "baggage"
    if "wifi" in lowered or "internet" in lowered:
        return "wifi"
    if "food" in lowered or "meal" in lowered or "drink" in lowered:
        return "food"
    return "baggage"


def _serialize(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


def _normalize_confirmation_number(confirmation_number: str) -> str:
    return confirmation_number.strip().upper()


def _reservation_view(
    airline_context: "AirlineContext | None", confirmation_number: str
) -> tuple[str, dict[str, str] | None]:
    normalized = _normalize_confirmation_number(confirmation_number)
    reservation = RESERVATIONS.get(normalized)
    if reservation is None:
        return normalized, None

    seat_number = reservation["seat_number"]
    if (
        airline_context is not None
        and airline_context.confirmation_number == normalized
        and airline_context.seat_number
    ):
        seat_number = airline_context.seat_number

    return (
        normalized,
        {
            "passenger_name": reservation["passenger_name"],
            "flight_number": reservation["flight_number"],
            "seat_number": seat_number,
        },
    )


def _extract_token_usage(raw_responses: Iterable[Any]) -> dict[str, int]:
    usage = {"total": 0, "prompt": 0, "completion": 0}
    for response in raw_responses:
        response_usage = getattr(response, "usage", None)
        if response_usage is None:
            continue

        usage["total"] += int(getattr(response_usage, "total_tokens", 0) or 0)
        usage["prompt"] += int(
            getattr(response_usage, "input_tokens", None)
            or getattr(response_usage, "prompt_tokens", 0)
            or 0
        )
        usage["completion"] += int(
            getattr(response_usage, "output_tokens", None)
            or getattr(response_usage, "completion_tokens", 0)
            or 0
        )

    return usage


def _format_transcript(step_index: int, step_prompt: str, result: Any) -> list[str]:
    lines = [f"User {step_index}: {step_prompt}"]

    for item in result.new_items:
        if isinstance(item, MessageOutputItem):
            lines.append(f"{item.agent.name}: {ItemHelpers.text_message_output(item)}")
        elif isinstance(item, HandoffOutputItem):
            lines.append(
                f"Handoff: {item.source_agent.name} -> {item.target_agent.name}"
            )
        elif isinstance(item, ToolCallOutputItem):
            lines.append(f"Tool output ({item.agent.name}): {_serialize(item.output)}")

    return lines


@function_tool(name_override="faq_lookup")
def faq_lookup(question: str) -> str:
    """Return an airline policy answer for the requested topic."""

    return FAQ_ANSWERS[_topic_for_question(question)]


@function_tool(name_override="lookup_reservation")
def lookup_reservation(
    context: RunContextWrapper[AirlineContext], confirmation_number: str
) -> dict[str, str]:
    """Look up a reservation and hydrate the shared agent context."""

    normalized_confirmation_number, reservation = _reservation_view(
        context.context, confirmation_number
    )
    if reservation is None:
        return {
            "error": f"Unknown confirmation number: {normalized_confirmation_number}",
        }

    context.context.confirmation_number = normalized_confirmation_number
    context.context.passenger_name = reservation["passenger_name"]
    context.context.flight_number = reservation["flight_number"]
    context.context.seat_number = reservation["seat_number"]

    return {
        "passenger_name": reservation["passenger_name"],
        "flight_number": reservation["flight_number"],
        "seat_number": reservation["seat_number"],
    }


@function_tool(name_override="update_seat")
def update_seat(
    context: RunContextWrapper[AirlineContext], confirmation_number: str, new_seat: str
) -> str:
    """Update a passenger seat assignment after the booking has been located."""

    normalized_confirmation_number, reservation = _reservation_view(
        context.context, confirmation_number
    )
    normalized_seat = new_seat.strip().upper()
    if reservation is None:
        return (
            f"Unable to update seat because {normalized_confirmation_number} "
            "was not found."
        )

    context.context.confirmation_number = normalized_confirmation_number
    context.context.passenger_name = reservation["passenger_name"]
    context.context.flight_number = reservation["flight_number"]
    context.context.seat_number = normalized_seat
    context.context.requested_seat_number = None

    return (
        f"Seat updated to {normalized_seat} for {reservation['passenger_name']} on "
        f"flight {reservation['flight_number']}."
    )


def _build_agents(model: str) -> Agent[AirlineContext]:
    faq_agent = Agent[AirlineContext](
        name="FAQ Agent",
        model=model,
        model_settings=ModelSettings(include_usage=True, temperature=0),
        instructions=(
            "You answer airline policy questions. "
            "Always call faq_lookup instead of using prior knowledge. "
            "If the user asks about bookings or seat changes, hand off back to triage."
        ),
        tools=[faq_lookup],
    )

    seat_agent = Agent[AirlineContext](
        name="Seat Booking Agent",
        model=model,
        model_settings=ModelSettings(include_usage=True, temperature=0),
        instructions=(
            "You handle booking lookups and seat changes. "
            "If the conversation or shared context already includes a confirmation number, "
            "use it instead of asking again. "
            "Before updating a seat, call lookup_reservation to confirm the booking. "
            "For any seat-change request, call lookup_reservation first, then update_seat, "
            "then confirm the new seat assignment. "
            "When the user provides a new seat number, call update_seat with it before "
            "you claim the seat has changed. "
            "If the user asks an airline policy question after a booking task, hand off "
            "back to triage immediately. "
            "If the user asks about airline policy, hand off back to triage."
        ),
        tools=[lookup_reservation, update_seat],
    )

    triage_agent = Agent[AirlineContext](
        name="Triage Agent",
        model=model,
        model_settings=ModelSettings(include_usage=True, temperature=0),
        instructions=(
            "You route each request to the best specialist. "
            "Use the FAQ Agent for airline policies and the Seat Booking Agent for "
            "booking lookups or seat changes. If the user has already provided a "
            "confirmation number or asks to change a seat, hand off to the Seat "
            "Booking Agent immediately instead of asking follow-up questions. "
            "Never answer airline policy questions yourself. "
            "For any policy question, immediately hand off to the FAQ Agent without "
            "asking permission or offering to hand off later. "
            "If the active specialist is already appropriate, let it continue."
        ),
        handoffs=[
            handoff(
                faq_agent,
                tool_name_override="transfer_to_faq_agent",
                tool_description_override=(
                    "Route policy or airline information questions to FAQ."
                ),
            ),
            handoff(
                seat_agent,
                tool_name_override="transfer_to_seat_booking_agent",
                tool_description_override=(
                    "Route reservation lookups and seat changes to booking."
                ),
            ),
        ],
    )

    faq_agent.handoffs.append(
        handoff(
            triage_agent,
            tool_name_override="return_to_triage",
            tool_description_override=(
                "Return to triage when the question is not about policy."
            ),
        )
    )

    seat_agent.handoffs.append(
        handoff(
            triage_agent,
            tool_name_override="return_to_triage",
            tool_description_override=(
                "Return to triage when the task is not about booking changes."
            ),
        )
    )

    return triage_agent


def _build_context(vars_dict: dict[str, Any]) -> AirlineContext:
    return AirlineContext(
        passenger_name=vars_dict.get("passenger_name"),
        confirmation_number=vars_dict.get("confirmation_number"),
        seat_number=vars_dict.get("seat_number"),
        requested_seat_number=vars_dict.get("requested_seat_number"),
        flight_number=vars_dict.get("flight_number"),
    )


def _build_steps(prompt: str, vars_dict: dict[str, Any]) -> list[str]:
    configured_steps = vars_dict.get("steps") or vars_dict.get("task_steps")
    if isinstance(configured_steps, list) and configured_steps:
        return [str(step) for step in configured_steps]

    configured_steps_json = vars_dict.get("steps_json") or vars_dict.get(
        "task_steps_json"
    )
    if isinstance(configured_steps_json, str) and configured_steps_json.strip():
        try:
            parsed_steps = json.loads(configured_steps_json)
        except json.JSONDecodeError:
            parsed_steps = None

        if isinstance(parsed_steps, list) and parsed_steps:
            return [str(step) for step in parsed_steps]

    return [prompt]


def _hydrate_context_from_step(step: str, airline_context: AirlineContext) -> None:
    confirmation_match = CONFIRMATION_NUMBER_RE.search(step)
    if confirmation_match:
        airline_context.confirmation_number = confirmation_match.group(1).upper()
        reservation = RESERVATIONS.get(airline_context.confirmation_number)
        if reservation is not None:
            airline_context.passenger_name = reservation["passenger_name"]
            airline_context.flight_number = reservation["flight_number"]
            airline_context.seat_number = reservation["seat_number"]

    passenger_match = PASSENGER_NAME_RE.search(step)
    if passenger_match and not airline_context.passenger_name:
        airline_context.passenger_name = passenger_match.group(1).strip()

    seat_match = SEAT_NUMBER_RE.search(step)
    if seat_match and (
        "move me to seat" in step.lower() or "change my seat" in step.lower()
    ):
        airline_context.requested_seat_number = seat_match.group(1).upper()


def _step_input(task: str, step: str, airline_context: AirlineContext) -> str:
    context_lines = []
    if airline_context.passenger_name:
        context_lines.append(f"Passenger name: {airline_context.passenger_name}")
    if airline_context.confirmation_number:
        context_lines.append(
            f"Confirmation number: {airline_context.confirmation_number}"
        )
    if airline_context.flight_number:
        context_lines.append(f"Flight number: {airline_context.flight_number}")
    if airline_context.seat_number:
        context_lines.append(f"Current seat: {airline_context.seat_number}")
    if airline_context.requested_seat_number:
        context_lines.append(
            f"Requested seat change: {airline_context.requested_seat_number}"
        )

    parts = [f"Overall task: {task}"]
    if context_lines:
        parts.append("Known context:\n" + "\n".join(context_lines))
    parts.append(f"Latest user message: {step}")
    return "\n\n".join(parts)


def _session_id(context: dict[str, Any], vars_dict: dict[str, Any]) -> str:
    explicit = vars_dict.get("session_id")
    if explicit:
        return str(explicit)

    evaluation_id = context.get("evaluationId", "local-eval")
    test_case_id = context.get("testCaseId", "default-test")
    return f"promptfoo-openai-agents-{evaluation_id}-{test_case_id}"


def call_api(
    prompt: str, options: dict[str, Any], context: dict[str, Any]
) -> dict[str, Any]:
    """Run the OpenAI Agents workflow as a Promptfoo Python provider."""

    options.setdefault("config", {})
    config = options["config"]
    vars_dict = context.get("vars", {})

    steps = _build_steps(prompt, vars_dict)
    airline_context = _build_context(vars_dict)
    session_id = _session_id(context, vars_dict)
    session = SQLiteSession(session_id=session_id, db_path=SESSION_DB_PATH)
    tracing_context = configure_promptfoo_tracing(
        context=context,
        otlp_endpoint=config.get("otlp_endpoint", "http://localhost:4318"),
    )

    current_agent: Agent[AirlineContext] = _build_agents(
        str(config.get("model") or DEFAULT_MODEL)
    )
    transcript: list[str] = [f"Task: {prompt}"]
    all_raw_responses: list[Any] = []
    max_turns = int(config.get("max_turns", 10))

    try:
        trace_kwargs: dict[str, Any] = {
            "workflow_name": "Promptfoo OpenAI Agents Python Example",
            "group_id": session_id,
            "metadata": {
                "conversation_id": session_id,
                "step_count": len(steps),
            },
        }
        if tracing_context is not None:
            trace_kwargs["trace_id"] = tracing_context.sdk_trace_id
            trace_kwargs["metadata"]["evaluation.id"] = tracing_context.evaluation_id
            trace_kwargs["metadata"]["test.case.id"] = tracing_context.test_case_id

        with trace(**trace_kwargs):
            last_result = None
            for index, step in enumerate(steps, start=1):
                _hydrate_context_from_step(step, airline_context)
                last_result = Runner.run_sync(
                    current_agent,
                    _step_input(prompt, step, airline_context),
                    context=airline_context,
                    max_turns=max_turns,
                    session=session,
                )
                current_agent = last_result.last_agent
                all_raw_responses.extend(last_result.raw_responses)
                transcript.extend(_format_transcript(index, step, last_result))

        final_output = _serialize(
            last_result.final_output if last_result is not None else ""
        )
        transcript.append(f"Final agent: {current_agent.name}")
        transcript.append(f"Final output: {final_output}")
        transcript.append(f"Shared context: {_serialize(airline_context.to_dict())}")

        return {
            "output": "\n".join(transcript),
            "tokenUsage": _extract_token_usage(all_raw_responses),
        }
    except Exception as exc:
        return {
            "error": str(exc),
            "output": f"Error: {exc}",
        }
