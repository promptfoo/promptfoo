"""
OpenTelemetry-traced Python provider for Promptfoo.

This provider demonstrates how to instrument a Python application with
OpenTelemetry and send traces to Promptfoo's OTLP receiver using the
protobuf format (application/x-protobuf).

The Python OpenTelemetry SDK uses protobuf by default when using the
`opentelemetry-exporter-otlp-proto-http` package, making it ideal for
testing protobuf support in Promptfoo.
"""

import re
import time
from typing import Any

from opentelemetry import context, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.trace import SpanContext, SpanKind, Status, StatusCode, TraceFlags

# Initialize OpenTelemetry with OTLP HTTP exporter (uses protobuf by default)
resource = Resource.create(
    {
        "service.name": "python-rag-provider",
        "service.version": "1.0.0",
        "deployment.environment": "development",
    }
)

# Create OTLP exporter pointing to Promptfoo's receiver
# This uses application/x-protobuf content type by default
exporter = OTLPSpanExporter(
    endpoint="http://localhost:4318/v1/traces",
)

# Use SimpleSpanProcessor for immediate export (synchronous)
# This ensures spans are exported before the provider returns
# For production use, consider BatchSpanProcessor for better performance
provider = TracerProvider(resource=resource)
processor = SimpleSpanProcessor(exporter)
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("python-rag-provider", "1.0.0")


def parse_traceparent(traceparent: str) -> SpanContext | None:
    """Parse W3C Trace Context traceparent header."""
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


def simulate_document_retrieval(doc_name: str, delay: float = 0.05) -> dict:
    """Simulate retrieving a document from a knowledge base."""
    time.sleep(delay)
    return {
        "name": doc_name,
        "content": f"This is the content of {doc_name}",
        "relevance": 0.95,
    }


def simulate_reasoning_step(step_name: str, delay: float = 0.03) -> str:
    """Simulate a reasoning step in the RAG pipeline."""
    time.sleep(delay)
    return f"Completed reasoning: {step_name}"


def simulate_llm_call(prompt: str, delay: float = 0.1) -> str:
    """Simulate calling an LLM for generation."""
    time.sleep(delay)
    return f"Generated response for: {prompt[:50]}..."


def call_api(prompt: str, options: dict, promptfoo_context: dict) -> dict:
    """
    Main provider entry point called by Promptfoo.

    Args:
        prompt: The rendered prompt to process
        options: Provider options from config
        promptfoo_context: Context including traceparent for distributed tracing

    Returns:
        dict with 'output' key containing the response
    """
    traceparent = promptfoo_context.get("traceparent")

    # If no trace context, run without tracing
    if not traceparent:
        return {"output": simulate_llm_call(prompt)}

    # Parse the trace context from Promptfoo
    span_context = parse_traceparent(traceparent)
    if not span_context:
        return {"output": simulate_llm_call(prompt)}

    # Create a context with the parent span
    ctx = trace.set_span_in_context(trace.NonRecordingSpan(span_context))

    # Run the RAG pipeline within the trace context
    with tracer.start_as_current_span(
        "rag_agent_workflow",
        context=ctx,
        kind=SpanKind.SERVER,
        attributes={
            "rag.prompt_length": len(prompt),
            "rag.model": "simulated-model",
        },
    ) as workflow_span:
        try:
            # Phase 1: Document Retrieval
            documents = []
            for i in range(3):
                doc_name = f"document_{i + 1}"
                with tracer.start_as_current_span(
                    f"retrieve_document_{i + 1}",
                    kind=SpanKind.CLIENT,
                    attributes={
                        "retrieval.document_name": doc_name,
                        "retrieval.source": "knowledge_base",
                    },
                ) as retrieval_span:
                    doc = simulate_document_retrieval(doc_name)
                    documents.append(doc)
                    retrieval_span.set_attribute(
                        "retrieval.relevance", doc["relevance"]
                    )

            workflow_span.set_attribute("rag.documents_retrieved", len(documents))

            # Phase 2: Reasoning Steps
            reasoning_results = []
            for i, step in enumerate(
                ["analyze_query", "rank_documents", "synthesize_context"]
            ):
                with tracer.start_as_current_span(
                    f"reasoning_{step}",
                    kind=SpanKind.INTERNAL,
                    attributes={
                        "reasoning.step_number": i + 1,
                        "reasoning.step_name": step,
                    },
                ) as reasoning_span:
                    result = simulate_reasoning_step(step)
                    reasoning_results.append(result)
                    reasoning_span.set_attribute("reasoning.completed", True)

            # Phase 3: LLM Generation
            with tracer.start_as_current_span(
                "llm_generation",
                kind=SpanKind.CLIENT,
                attributes={
                    "llm.model": "simulated-model",
                    "llm.prompt_tokens": len(prompt.split()),
                },
            ) as generation_span:
                output = simulate_llm_call(prompt)
                generation_span.set_attribute(
                    "llm.completion_tokens", len(output.split())
                )

            workflow_span.set_status(Status(StatusCode.OK))

            return {"output": output}

        except Exception as e:
            workflow_span.set_status(Status(StatusCode.ERROR, str(e)))
            workflow_span.record_exception(e)
            raise


# Export the function for Promptfoo
__all__ = ["call_api"]
