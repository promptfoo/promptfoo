"""Bridge OpenAI Agents SDK tracing into Promptfoo's OTLP receiver."""

from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import agents
from agents import set_trace_processors, set_tracing_disabled
from agents.tracing.processor_interface import TracingExporter, TracingProcessor
from agents.tracing.spans import Span
from agents.tracing.traces import Trace

TRACEPARENT_RE = re.compile(r"^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$")
_CURRENT_PROCESSOR: "PromptfooTracingProcessor | None" = None


@dataclass(frozen=True)
class PromptfooTraceContext:
    trace_id: str
    parent_span_id: str
    evaluation_id: str
    test_case_id: str

    @property
    def sdk_trace_id(self) -> str:
        return f"trace_{self.trace_id}"


def _iso_to_unix_nanos(timestamp: str | None) -> str:
    if not timestamp:
        return "0"
    normalized = timestamp.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return str(int(dt.timestamp() * 1_000_000_000))


def _normalize_hex_id(raw_id: str | None, target_length: int) -> str:
    if not raw_id:
        return ""

    stripped = re.sub(r"^(trace_|span_|group_)", "", raw_id)
    cleaned = "".join(ch for ch in stripped.lower() if ch in "0123456789abcdef")

    if len(cleaned) >= target_length:
        return cleaned[:target_length]
    return cleaned.ljust(target_length, "0")


def _value_to_otlp(value: Any) -> dict[str, Any]:
    if value is None:
        return {"stringValue": ""}
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [_value_to_otlp(item) for item in value]}}
    return {"stringValue": json.dumps(value, ensure_ascii=False, sort_keys=True)}


def _attributes_to_otlp(attributes: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"key": key, "value": _value_to_otlp(value)}
        for key, value in attributes.items()
    ]


class PromptfooOTLPExporter(TracingExporter):
    """Convert SDK traces into OTLP JSON that Promptfoo can ingest."""

    def __init__(
        self,
        otlp_endpoint: str,
        evaluation_id: str,
        test_case_id: str,
        parent_span_id: str,
    ) -> None:
        self._endpoint = otlp_endpoint.rstrip("/")
        self._evaluation_id = evaluation_id
        self._test_case_id = test_case_id
        self._parent_span_id = parent_span_id

    def export(self, items: list[Trace | Span[Any]]) -> None:
        spans = [item for item in items if isinstance(item, Span)]
        if not spans:
            return

        payload = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": _attributes_to_otlp(
                            {
                                "service.name": "promptfoo-openai-agents-python-example",
                                "service.version": getattr(
                                    agents, "__version__", "unknown"
                                ),
                                "evaluation.id": self._evaluation_id,
                                "test.case.id": self._test_case_id,
                            }
                        )
                    },
                    "scopeSpans": [
                        {
                            "scope": {
                                "name": "openai-agents-python",
                                "version": getattr(agents, "__version__", "unknown"),
                            },
                            "spans": [self._span_to_otlp(span) for span in spans],
                        }
                    ],
                }
            ]
        }

        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url=f"{self._endpoint}/v1/traces",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                response.read()
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Failed to export Promptfoo OTLP traces: {exc}"
            ) from exc

    def _span_to_otlp(self, span: Span[Any]) -> dict[str, Any]:
        span_data = span.span_data.export()
        span_type = span_data.get("type", "span")
        attributes: dict[str, Any] = {
            "openai.agents.span_type": span_type,
        }

        name = span_type
        if span_type == "function":
            tool_name = span_data.get("name") or "function"
            name = f"tool {tool_name}"
            attributes["tool.name"] = tool_name
            if span_data.get("input") is not None:
                attributes["tool.arguments"] = span_data["input"]
            if span_data.get("output") is not None:
                attributes["tool.output"] = span_data["output"]
        elif span_type == "handoff":
            from_agent = span_data.get("from_agent") or "unknown"
            to_agent = span_data.get("to_agent") or "unknown"
            name = f"handoff {from_agent} -> {to_agent}"
            attributes["handoff.from_agent"] = from_agent
            attributes["handoff.to_agent"] = to_agent
        elif span_type == "agent":
            agent_name = span_data.get("name") or "agent"
            name = f"agent {agent_name}"
            attributes["agent.name"] = agent_name
            if span_data.get("tools") is not None:
                attributes["agent.tools"] = span_data["tools"]
            if span_data.get("handoffs") is not None:
                attributes["agent.handoffs"] = span_data["handoffs"]
        elif span_type == "generation":
            model = span_data.get("model") or "unknown-model"
            name = f"generation {model}"
            attributes["gen_ai.request.model"] = model
            usage = span_data.get("usage") or {}
            if usage:
                if usage.get("input_tokens") is not None:
                    attributes["gen_ai.usage.input_tokens"] = usage["input_tokens"]
                if usage.get("output_tokens") is not None:
                    attributes["gen_ai.usage.output_tokens"] = usage["output_tokens"]
                if usage.get("total_tokens") is not None:
                    attributes["gen_ai.usage.total_tokens"] = usage["total_tokens"]
        elif span_type == "response":
            response_id = span_data.get("response_id") or "response"
            name = f"response {response_id}"
            attributes["openai.response_id"] = response_id

        if span.trace_metadata:
            for key, value in span.trace_metadata.items():
                attributes[f"trace.metadata.{key}"] = value

        otlp_span: dict[str, Any] = {
            "traceId": _normalize_hex_id(span.trace_id, 32),
            "spanId": _normalize_hex_id(span.span_id, 16),
            "name": name,
            "kind": 1,
            "startTimeUnixNano": _iso_to_unix_nanos(span.started_at),
            "endTimeUnixNano": _iso_to_unix_nanos(span.ended_at),
            "attributes": _attributes_to_otlp(attributes),
            "status": {
                "code": 2 if span.error else 0,
                "message": str(span.error.get("message", "")) if span.error else "",
            },
        }

        parent_id = span.parent_id
        if parent_id:
            otlp_span["parentSpanId"] = _normalize_hex_id(parent_id, 16)
        elif self._parent_span_id:
            otlp_span["parentSpanId"] = _normalize_hex_id(self._parent_span_id, 16)

        return otlp_span


class PromptfooTracingProcessor(TracingProcessor):
    """Buffer spans per trace and export them once the workflow finishes."""

    def __init__(self, exporter: PromptfooOTLPExporter) -> None:
        self._exporter = exporter
        self._lock = threading.Lock()
        self._traces: dict[str, Trace] = {}
        self._spans_by_trace: dict[str, list[Span[Any]]] = {}

    def on_trace_start(self, trace: Trace) -> None:
        with self._lock:
            self._traces[trace.trace_id] = trace

    def on_trace_end(self, trace: Trace) -> None:
        with self._lock:
            spans = list(self._spans_by_trace.pop(trace.trace_id, []))
            self._traces.pop(trace.trace_id, None)

        self._exporter.export([trace, *spans])

    def on_span_start(self, span: Span[Any]) -> None:
        return None

    def on_span_end(self, span: Span[Any]) -> None:
        with self._lock:
            self._spans_by_trace.setdefault(span.trace_id, []).append(span)

    def shutdown(self) -> None:
        self.force_flush()

    def force_flush(self) -> None:
        with self._lock:
            pending_trace_ids = set(self._traces) | set(self._spans_by_trace)
            pending_batches = []
            for trace_id in pending_trace_ids:
                trace = self._traces.pop(trace_id, None)
                spans = list(self._spans_by_trace.pop(trace_id, []))
                pending_batches.append((trace, spans))

        for trace, spans in pending_batches:
            if trace is not None or spans:
                items: list[Trace | Span[Any]] = [*spans]
                if trace is not None:
                    items.insert(0, trace)
                self._exporter.export(items)


def _parse_traceparent(traceparent: str | None) -> tuple[str, str] | None:
    if not traceparent:
        return None
    match = TRACEPARENT_RE.match(traceparent.lower())
    if not match:
        return None
    return match.group(1), match.group(2)


def _active_otel_parent() -> tuple[str, str] | None:
    try:
        from opentelemetry import trace as otel_trace
    except ImportError:
        return None

    span = otel_trace.get_current_span()
    if span is None:
        return None

    span_context = span.get_span_context()
    if not span_context or not span_context.is_valid:
        return None

    return (f"{span_context.trace_id:032x}", f"{span_context.span_id:016x}")


def configure_promptfoo_tracing(
    context: dict[str, Any], otlp_endpoint: str
) -> PromptfooTraceContext | None:
    """Configure the SDK to emit spans into Promptfoo for the current eval case."""

    global _CURRENT_PROCESSOR

    if _CURRENT_PROCESSOR is not None:
        _CURRENT_PROCESSOR.shutdown()
        _CURRENT_PROCESSOR = None

    parsed = _active_otel_parent() or _parse_traceparent(context.get("traceparent"))
    if parsed is None:
        set_trace_processors([])
        set_tracing_disabled(True)
        return None

    trace_id, parent_span_id = parsed
    evaluation_id = str(context.get("evaluationId") or "")
    test_case_id = str(context.get("testCaseId") or "")

    processor = PromptfooTracingProcessor(
        PromptfooOTLPExporter(
            otlp_endpoint=otlp_endpoint,
            evaluation_id=evaluation_id,
            test_case_id=test_case_id,
            parent_span_id=parent_span_id,
        )
    )
    set_trace_processors([processor])
    set_tracing_disabled(False)
    _CURRENT_PROCESSOR = processor

    return PromptfooTraceContext(
        trace_id=trace_id,
        parent_span_id=parent_span_id,
        evaluation_id=evaluation_id,
        test_case_id=test_case_id,
    )
