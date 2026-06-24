"""Google ADK agents used by the Promptfoo integration example."""

from __future__ import annotations

from typing import Any

from google.adk.agents import Agent, SequentialAgent
from google.adk.apps import App
from google.adk.plugins import BasePlugin
from google.adk.tools import ToolContext
from google.genai import types

APP_NAME = "promptfoo_adk_demo"

WEATHER_REPORTS = {
    "london": "London is cloudy with light drizzle and 14 C temperatures.",
    "new york": "New York is sunny with a light breeze and 22 C temperatures.",
    "tokyo": "Tokyo is clear with mild humidity and 24 C temperatures.",
}


def _normalize_city(city: str) -> str:
    return city.strip().casefold()


def before_agent_callback(callback_context) -> None:
    """Track how often ADK enters the main conversational agent."""

    callback_context.state["callback_invocations"] = (
        int(callback_context.state.get("callback_invocations", 0)) + 1
    )


def get_weather(city: str, tool_context: ToolContext) -> dict[str, Any]:
    """Return sample weather data and remember the most recent city."""

    normalized_city = _normalize_city(city)
    report = WEATHER_REPORTS.get(
        normalized_city,
        f"No sample weather is stored for {city}.",
    )
    tool_context.state["last_city"] = city
    return {
        "city": city,
        "status": "success" if normalized_city in WEATHER_REPORTS else "not_found",
        "report": report,
    }


async def save_trip_note(
    city: str,
    summary: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Save a short trip note as an ADK artifact."""

    filename = f"{_normalize_city(city).replace(' ', '-')}-trip-note.md"
    artifact = types.Part.from_bytes(
        data=f"# Trip note for {city}\n\n{summary}\n".encode("utf-8"),
        mime_type="text/markdown",
    )
    version = await tool_context.save_artifact(filename=filename, artifact=artifact)
    tool_context.state["last_saved_artifact"] = filename
    return {
        "city": city,
        "filename": filename,
        "version": version,
    }


class AuditPlugin(BasePlugin):
    """Record runner lifecycle callbacks so the provider can expose them."""

    def __init__(self) -> None:
        super().__init__(name="audit_plugin")
        self.events: list[str] = []

    async def before_run_callback(self, *, invocation_context) -> None:
        self.events.append(f"before_run:{invocation_context.session.id}")

    async def after_run_callback(self, *, invocation_context) -> None:
        self.events.append(f"after_run:{invocation_context.session.id}")


def build_conversational_app(model: str) -> tuple[App, AuditPlugin]:
    """Build the conversational ADK app used by the main eval."""

    audit_plugin = AuditPlugin()
    root_agent = Agent(
        name="weather_agent",
        model=model,
        description="Answers weather questions and saves trip notes.",
        instruction=(
            "You are a concise travel weather assistant. "
            "When the user asks about weather, call get_weather. "
            "When the user asks to save a note, call save_trip_note using the "
            "city already discussed and a brief summary of the weather. "
            "When the user asks what city was discussed earlier, answer from the "
            "conversation and current session state."
        ),
        tools=[get_weather, save_trip_note],
        before_agent_callback=before_agent_callback,
    )
    return (
        App(name=APP_NAME, root_agent=root_agent, plugins=[audit_plugin]),
        audit_plugin,
    )


def build_workflow_app(model: str) -> App:
    """Build a small SequentialAgent workflow for the workflow eval."""

    weather_lookup_agent = Agent(
        name="weather_lookup_agent",
        model=model,
        description="Looks up weather for the requested city.",
        instruction=(
            "Call get_weather for the city in the user's request, then return a "
            "single-sentence weather summary."
        ),
        tools=[get_weather],
        output_key="weather_snapshot",
    )
    briefing_agent = Agent(
        name="briefing_agent",
        model=model,
        description="Turns the weather snapshot into a compact travel brief.",
        instruction=(
            "Use the weather snapshot from state to write a one-sentence trip "
            "brief that includes the city name and a packing suggestion."
        ),
    )
    workflow = SequentialAgent(
        name="trip_planning_workflow",
        description="Looks up weather, then writes a travel brief.",
        sub_agents=[weather_lookup_agent, briefing_agent],
    )
    return App(name=APP_NAME, root_agent=workflow)
