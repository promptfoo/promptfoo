#!/usr/bin/env python3
"""
Multi-agent provider with OpenTelemetry tracing and real LLM calls.
"""

import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI
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

# Global client variable (initialized on first use)
_client: Optional[AsyncOpenAI] = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create OpenAI client."""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


async def process_request(prompt: str, traceparent: str = None) -> str:
    """Main orchestration function."""
    # Extract trace context from W3C traceparent header
    trace_context = None
    if traceparent:
        carrier = {'traceparent': traceparent}
        trace_context = extract(carrier=carrier)
    
    with tracer.start_as_current_span("process_request", context=trace_context) as span:
        span.set_attribute("prompt", prompt[:100])  # Truncate for display
        span.set_attribute("agent.type", "coordinator")
        
        try:
            # Call research agent for detailed findings
            research_result = await research(prompt)
            span.add_event("research_completed", {"findings_length": len(research_result)})
            
            # Call summary agent to create executive summary
            result = await summarize(prompt, research_result)
            span.add_event("summary_completed", {"summary_length": len(result)})
            
            span.set_status(trace.Status(trace.StatusCode.OK))
            return result
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            raise


async def research(topic: str) -> str:
    """Research agent that gathers information using LLM."""
    with tracer.start_as_current_span("research") as span:
        span.set_attribute("agent.type", "research")
        span.set_attribute("topic", topic)
        span.set_attribute("llm.model", "gpt-4o-mini")
        
        try:
            client = get_openai_client()
            
            # Make real LLM call for research
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a research agent. Provide detailed, factual information about the given topic. Focus on recent developments, key concepts, and important considerations."
                    },
                    {
                        "role": "user",
                        "content": f"Research and provide detailed information about: {topic}"
                    }
                ],
                temperature=0.7,
                max_tokens=500
            )
            
            result = response.choices[0].message.content
            
            # Add LLM metrics to span
            span.set_attribute("llm.usage.prompt_tokens", response.usage.prompt_tokens)
            span.set_attribute("llm.usage.completion_tokens", response.usage.completion_tokens)
            span.set_attribute("llm.usage.total_tokens", response.usage.total_tokens)
            span.set_attribute("llm.response_length", len(result))
            
            return result
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            raise


async def summarize(topic: str, research_findings: str) -> str:
    """Summary agent that creates executive summary using LLM."""
    with tracer.start_as_current_span("summarize") as span:
        span.set_attribute("agent.type", "summary")
        span.set_attribute("llm.model", "gpt-4o-mini")
        span.set_attribute("research_length", len(research_findings))
        
        try:
            client = get_openai_client()
            
            # Make real LLM call for summarization
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an executive summary agent. Create concise, well-structured summaries with clear main points and actionable conclusions."
                    },
                    {
                        "role": "user",
                        "content": f"""Create an executive summary for the topic: {topic}

Based on the following research findings:
{research_findings}

Format the summary with:
- Executive Summary header
- Main Points (3-5 bullet points)
- Conclusion with actionable insights"""
                    }
                ],
                temperature=0.5,
                max_tokens=300
            )
            
            result = response.choices[0].message.content
            
            # Add LLM metrics to span
            span.set_attribute("llm.usage.prompt_tokens", response.usage.prompt_tokens)
            span.set_attribute("llm.usage.completion_tokens", response.usage.completion_tokens)
            span.set_attribute("llm.usage.total_tokens", response.usage.total_tokens)
            span.set_attribute("llm.response_length", len(result))
            
            return result
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            raise


def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for promptfoo provider."""
    # Extract traceparent from context - it's passed directly in the context
    traceparent = context.get('traceparent')
    
    if traceparent:
        print(f"DEBUG: Received traceparent: {traceparent}", file=sys.stderr)
    
    # Check for API key
    if not os.getenv("OPENAI_API_KEY"):
        return {"error": "OPENAI_API_KEY environment variable not set"}
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(process_request(prompt, traceparent))
        
        # Give time for spans to export
        time.sleep(0.2)
        
        return {"output": result}
    except Exception as e:
        return {"error": f"Error processing request: {str(e)}"}
    finally:
        loop.close()


if __name__ == "__main__":
    # Test locally
    result = call_api("Test prompt", {}, {})
    print(json.dumps(result, indent=2))
