#!/usr/bin/env python3
"""Simple test to demonstrate OpenTelemetry tracing without ADK dependencies."""

import asyncio
import json

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from agents.tracing_utils import setup_tracing, shutdown_tracing


async def main():
    # Setup tracing
    setup_tracing()
    tracer = trace.get_tracer("test-agent", "1.0.0")

    # Create a root span
    with tracer.start_as_current_span("test_workflow") as span:
        span.set_attributes(
            {"test.type": "demo", "test.purpose": "verify tracing works"}
        )

        try:
            # Simulate some work
            with tracer.start_span("step_1") as step1:
                step1.set_attribute("step.name", "initialize")
                await asyncio.sleep(0.1)

            with tracer.start_span("step_2") as step2:
                step2.set_attribute("step.name", "process")
                await asyncio.sleep(0.2)

            span.set_status(Status(StatusCode.OK))
            print(
                json.dumps(
                    {"message": "Test completed successfully", "spans_created": 3}
                )
            )

        except Exception as e:
            span.record_exception(e)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            raise

    # Wait for spans to export
    await asyncio.sleep(0.5)
    shutdown_tracing()


if __name__ == "__main__":
    asyncio.run(main())
