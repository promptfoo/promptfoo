#!/usr/bin/env python3
"""
Simple multi-agent provider with OpenTelemetry tracing.
"""

import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, List

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

# Configure OpenTelemetry
provider = TracerProvider()
# Python OTLP exporter only supports protobuf format
otlp_exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
provider.add_span_processor(SimpleSpanProcessor(otlp_exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)


async def process_request(prompt: str, traceparent: str = None) -> str:
    """Main orchestration function."""
    # Extract trace context from W3C traceparent header
    trace_context = None
    if traceparent:
        carrier = {'traceparent': traceparent}
        trace_context = extract(carrier=carrier)
    
    with tracer.start_as_current_span("process_request", context=trace_context) as span:
        span.set_attribute("prompt", prompt[:100])  # Truncate for display
        
        try:
            # Simulate processing
            await asyncio.sleep(0.1)
            
            # Call research agent
            research_result = await research(prompt)
            
            # Call summary agent
            result = await summarize(research_result)
            
            span.set_status(trace.Status(trace.StatusCode.OK))
            return result
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            raise


async def research(topic: str) -> str:
    """Research agent that gathers information."""
    with tracer.start_as_current_span("research") as span:
        span.set_attribute("agent.type", "research")
        span.set_attribute("topic", topic)
        
        # Simulate research work
        await asyncio.sleep(0.05)
        
        return f"Research findings on {topic}"


async def summarize(content: str) -> str:
    """Summary agent that creates executive summary."""
    with tracer.start_as_current_span("summarize") as span:
        span.set_attribute("agent.type", "summary")
        
        # Simulate summarization
        await asyncio.sleep(0.05)
        
        return f"""Executive Summary:

Main Points:
• Research shows promising developments
• Multiple approaches being explored  
• Further investigation recommended

Conclusion: Analysis complete for the requested topic."""


def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for promptfoo provider."""
    # Extract traceparent from context - it's passed directly in the context
    traceparent = context.get('traceparent')
    
    if traceparent:
        print(f"DEBUG: Received traceparent: {traceparent}", file=sys.stderr)
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(process_request(prompt, traceparent))
        
        # Give time for spans to export
        time.sleep(0.1)
        
        return {"output": result}
    finally:
        loop.close()


if __name__ == "__main__":
    # Test locally
    result = call_api("Test prompt", {}, {})
    print(json.dumps(result, indent=2))
