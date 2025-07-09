#!/usr/bin/env python3
"""
Simple multi-agent system with OpenTelemetry tracing for promptfoo.
"""

import json
import asyncio
import time
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.trace import Status, StatusCode

# Configure OpenTelemetry
provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
provider.add_span_processor(SimpleSpanProcessor(exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("python-agent", "1.0.0")


async def process_request(prompt: str, parent_context):
    """Process the request through multiple agents."""
    with tracer.start_as_current_span("process_request", context=parent_context) as span:
        span.set_attribute("prompt", prompt[:100])  # Truncate for attribute
        
        # Simulate agent processing
        await asyncio.sleep(0.1)
        
        # Research phase
        with tracer.start_span("research") as research_span:
            research_span.set_attribute("agent.type", "research")
            await asyncio.sleep(0.05)
            research_data = "Research findings on the topic"
        
        # Summary phase
        with tracer.start_span("summarize") as summary_span:
            summary_span.set_attribute("agent.type", "summary")
            await asyncio.sleep(0.05)
            result = f"""Executive Summary:

Main Points:
• Research shows promising developments
• Multiple approaches being explored
• Further investigation recommended

Conclusion: Analysis complete for: {prompt}"""
        
        span.set_status(Status(StatusCode.OK))
        return result


def call_api(prompt, options, context):
    """
    Main entry point for promptfoo provider.
    
    Args:
        prompt: The input prompt string
        options: Provider options
        context: Contains traceparent and other metadata
    
    Returns:
        dict: Response with 'output' key
    """
    # Extract trace context from promptfoo
    trace_context = None
    if context and 'vars' in context and 'traceparent' in context['vars']:
        trace_context = extract({"traceparent": context['vars']['traceparent']})
    
    # Run the async process
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(process_request(prompt, trace_context))
    finally:
        loop.close()
    
    # Give time for spans to export
    time.sleep(0.1)
    
    return {"output": result}


if __name__ == "__main__":
    # Test locally
    result = call_api("Test prompt", {}, {})
    print(json.dumps(result, indent=2))
