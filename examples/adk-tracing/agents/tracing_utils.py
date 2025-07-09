"""OpenTelemetry tracing utilities for ADK agents."""

import re

from opentelemetry import context, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.semconv.resource import ResourceAttributes

# Global tracer instance
_tracer = None


def setup_tracing():
    """Initialize OpenTelemetry tracing."""
    global _tracer

    # Create resource identifying the service
    resource = Resource.create(
        {
            ResourceAttributes.SERVICE_NAME: "adk-research-assistant",
            ResourceAttributes.SERVICE_VERSION: "1.0.0",
        }
    )

    # Create tracer provider
    provider = TracerProvider(resource=resource)

    # Configure OTLP exporter
    otlp_exporter = OTLPSpanExporter(
        endpoint="http://localhost:4318/v1/traces",
    )

    # Use SimpleSpanProcessor for immediate export (good for testing)
    provider.add_span_processor(SimpleSpanProcessor(otlp_exporter))

    # Set the global tracer provider
    trace.set_tracer_provider(provider)

    # Get a tracer
    _tracer = trace.get_tracer("adk.agents", "1.0.0")

    return _tracer


def get_tracer():
    """Get the global tracer instance."""
    global _tracer
    if _tracer is None:
        _tracer = setup_tracing()
    return _tracer


def extract_trace_context(trace_context_dict):
    """Extract trace context from dictionary containing traceparent."""
    if not trace_context_dict or not trace_context_dict.get("traceparent"):
        return context.get_current()

    traceparent = trace_context_dict["traceparent"]

    # Parse traceparent format: version-trace_id-span_id-trace_flags
    match = re.match(r"^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$", traceparent)
    if not match:
        return context.get_current()

    version, trace_id, span_id, trace_flags = match.groups()

    # Create span context
    span_context = trace.SpanContext(
        trace_id=int(trace_id, 16),
        span_id=int(span_id, 16),
        is_remote=True,
        trace_flags=trace.TraceFlags(int(trace_flags, 16)),
    )

    # Create a new context with the span
    ctx = trace.set_span_context(span_context)
    return ctx


def shutdown_tracing():
    """Shutdown tracing and ensure all spans are exported."""
    provider = trace.get_tracer_provider()
    if hasattr(provider, "shutdown"):
        provider.shutdown()
