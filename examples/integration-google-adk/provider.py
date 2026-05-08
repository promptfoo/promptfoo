"""Promptfoo Python providers for the Google ADK integration example."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from google.adk.artifacts import InMemoryArtifactService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.propagate import extract
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

EXAMPLE_DIR = Path(__file__).resolve().parent
if str(EXAMPLE_DIR) not in sys.path:
    sys.path.insert(0, str(EXAMPLE_DIR))

from agent import APP_NAME, build_conversational_app, build_workflow_app

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_USER_ID = "promptfoo-user"
DEFAULT_OTLP_ENDPOINT = "http://localhost:4318"

_logger = logging.getLogger(__name__)
_configured_tracer_provider: TracerProvider | None = None
_configured_otlp_endpoint: str | None = None


def _build_steps(prompt: str, vars_dict: dict[str, Any]) -> list[str]:
    raw_steps = vars_dict.get("steps_json")
    if not raw_steps:
        return [prompt]

    try:
        steps = json.loads(raw_steps)
    except json.JSONDecodeError as exc:
        raise ValueError("steps_json must be a JSON array of strings") from exc
    if not isinstance(steps, list) or not all(isinstance(step, str) for step in steps):
        raise ValueError("steps_json must be a JSON array of strings")
    return steps


def _session_id(context: dict[str, Any], vars_dict: dict[str, Any]) -> str:
    if explicit := vars_dict.get("session_id"):
        return str(explicit)

    evaluation_id = context.get("evaluationId", "local-eval")
    test_case_id = context.get("testCaseId", "default-test")
    repeat_index = context.get("repeatIndex")
    if repeat_index is None:
        return f"promptfoo-adk-{evaluation_id}-{test_case_id}"
    return f"promptfoo-adk-{evaluation_id}-{test_case_id}-repeat-{repeat_index}"


def _model(options: dict[str, Any]) -> str:
    config = options.get("config", {})
    return str(config.get("model") or os.getenv("ADK_MODEL") or DEFAULT_MODEL)


def _otlp_endpoint(options: dict[str, Any]) -> str:
    config = options.get("config", {})
    return str(config.get("otlp_endpoint") or DEFAULT_OTLP_ENDPOINT)


def _ensure_tracer_provider(otlp_endpoint: str) -> TracerProvider:
    """Install a TracerProvider that exports to ``otlp_endpoint`` exactly once.

    OpenTelemetry's global ``set_tracer_provider`` is set-once: a subsequent
    call is silently rejected with an "Overriding of current TracerProvider is
    not allowed" warning. We mirror that by installing on the first call and
    refusing to swap endpoints later, which avoids stacking a second
    SimpleSpanProcessor onto the same provider (which would cause every span
    to be exported twice).
    """

    global _configured_tracer_provider, _configured_otlp_endpoint

    if _configured_tracer_provider is not None:
        if _configured_otlp_endpoint != otlp_endpoint:
            _logger.warning(
                "TracerProvider already configured for %s; ignoring request to switch to %s",
                _configured_otlp_endpoint,
                otlp_endpoint,
            )
        return _configured_tracer_provider

    exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint.rstrip('/')}/v1/traces")
    provider = TracerProvider(
        resource=Resource.create({"service.name": "promptfoo-google-adk-example"})
    )
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    _configured_tracer_provider = provider
    _configured_otlp_endpoint = otlp_endpoint
    return provider


@contextmanager
def _provider_span(context: dict[str, Any], otlp_endpoint: str) -> Iterator[None]:
    provider = _ensure_tracer_provider(otlp_endpoint)
    tracer = trace.get_tracer("promptfoo.google-adk.example", "1.0.0")
    parent_context = extract({"traceparent": context.get("traceparent", "")})
    token = otel_context.attach(parent_context)
    try:
        with tracer.start_as_current_span(
            "promptfoo_google_adk_provider",
            attributes={
                "promptfoo.eval.id": str(context.get("evaluationId") or ""),
                "promptfoo.test.id": str(context.get("testCaseId") or ""),
            },
        ):
            yield
    finally:
        otel_context.detach(token)
        provider.force_flush()


def _final_text_from_events(events: list[Any]) -> str:
    for event in reversed(events):
        if (
            not event.is_final_response()
            or not event.content
            or not event.content.parts
        ):
            continue
        text = "".join(part.text or "" for part in event.content.parts)
        if text.strip():
            return text.strip()
    return ""


async def _artifact_payloads(
    artifact_service: InMemoryArtifactService,
    session_id: str,
) -> dict[str, str]:
    payloads: dict[str, str] = {}
    artifact_names = await artifact_service.list_artifact_keys(
        app_name=APP_NAME,
        user_id=DEFAULT_USER_ID,
        session_id=session_id,
    )
    for artifact_name in artifact_names:
        artifact = await artifact_service.load_artifact(
            app_name=APP_NAME,
            user_id=DEFAULT_USER_ID,
            session_id=session_id,
            filename=artifact_name,
        )
        if artifact is None:
            continue
        if artifact.text:
            payloads[artifact_name] = artifact.text
        elif artifact.inline_data and artifact.inline_data.data:
            payloads[artifact_name] = artifact.inline_data.data.decode("utf-8")
    return payloads


async def _run_conversational_provider(
    prompt: str,
    options: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    vars_dict = context.get("vars", {})
    steps = _build_steps(prompt, vars_dict)
    session_id = _session_id(context, vars_dict)
    session_service = InMemorySessionService()
    artifact_service = InMemoryArtifactService()
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=DEFAULT_USER_ID,
        session_id=session_id,
        state={},
    )

    app, audit_plugin = build_conversational_app(_model(options))
    async with Runner(
        app=app,
        session_service=session_service,
        artifact_service=artifact_service,
    ) as runner:
        for step in steps:
            async for _ in runner.run_async(
                user_id=DEFAULT_USER_ID,
                session_id=session_id,
                new_message=types.Content(role="user", parts=[types.Part(text=step)]),
            ):
                pass

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=DEFAULT_USER_ID,
        session_id=session_id,
    )
    if session is None:
        raise RuntimeError(f"Session {session_id} was not found after the run")

    artifacts = await _artifact_payloads(artifact_service, session_id)
    summary = {
        "final_answer": _final_text_from_events(session.events),
        "session_state": session.state,
        "artifact_names": sorted(artifacts),
        "artifacts": artifacts,
        "plugin_events": audit_plugin.events,
        "event_count": len(session.events),
    }
    return {"output": json.dumps(summary, ensure_ascii=False, sort_keys=True)}


async def _run_workflow_provider(
    prompt: str,
    options: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    vars_dict = context.get("vars", {})
    session_id = _session_id(context, vars_dict)
    session_service = InMemorySessionService()
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=DEFAULT_USER_ID,
        session_id=session_id,
        state={},
    )

    async with Runner(
        app=build_workflow_app(_model(options)),
        session_service=session_service,
    ) as runner:
        async for _ in runner.run_async(
            user_id=DEFAULT_USER_ID,
            session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
        ):
            pass

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=DEFAULT_USER_ID,
        session_id=session_id,
    )
    if session is None:
        raise RuntimeError(f"Session {session_id} was not found after the run")

    summary = {
        "final_answer": _final_text_from_events(session.events),
        "session_state": session.state,
        "event_count": len(session.events),
    }
    return {"output": json.dumps(summary, ensure_ascii=False, sort_keys=True)}


def call_api(
    prompt: str, options: dict[str, Any], context: dict[str, Any]
) -> dict[str, Any]:
    """Run the conversational Google ADK example."""

    try:
        with _provider_span(context, _otlp_endpoint(options)):
            return asyncio.run(_run_conversational_provider(prompt, options, context))
    except Exception as exc:
        return {"error": str(exc), "output": f"Error: {exc}"}


def call_workflow_api(
    prompt: str,
    options: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Run the SequentialAgent workflow example."""

    try:
        with _provider_span(context, _otlp_endpoint(options)):
            return asyncio.run(_run_workflow_provider(prompt, options, context))
    except Exception as exc:
        return {"error": str(exc), "output": f"Error: {exc}"}
