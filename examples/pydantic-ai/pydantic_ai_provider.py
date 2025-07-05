"""
Promptfoo provider for PydanticAI agent with OpenTelemetry tracing
"""
from pydantic_ai import Agent
from pydantic import BaseModel, Field
import asyncio
import os

# OpenTelemetry imports
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Setup OpenTelemetry
provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
provider.add_span_processor(SimpleSpanProcessor(exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("pydantic_ai.agent")

# Define the expected output structure
class CustomerServiceResponse(BaseModel):
    """Structured response for customer service queries"""
    response: str = Field(description="The response to the customer")
    category: str = Field(description="Category of the query: support, billing, or general")
    needs_escalation: bool = Field(description="Whether this needs human intervention")
    sentiment: str = Field(description="Customer sentiment: positive, neutral, or negative")

# Create the agent with system prompt and structured output
agent = Agent(
    model=os.getenv("PYDANTIC_AI_MODEL", "openai:gpt-4o-mini"),
    result_type=CustomerServiceResponse,
    system_prompt="""You are a helpful customer service assistant. 
    Analyze customer queries and provide appropriate responses.
    Categorize queries and determine if they need escalation."""
)

def call_api(prompt, options, context):
    """
    Promptfoo provider function that runs the PydanticAI agent
    
    Args:
        prompt: The user's input prompt
        options: Additional options from Promptfoo
        context: Context information from Promptfoo
    
    Returns:
        Dict with the agent's response
    """
    # Extract trace context if provided
    if 'traceparent' in context:
        ctx = extract({"traceparent": context["traceparent"]})
        with tracer.start_as_current_span("pydantic_ai.agent.call", context=ctx) as span:
            span.set_attribute("agent.framework", "pydantic_ai")
            span.set_attribute("agent.model", os.getenv("PYDANTIC_AI_MODEL", "openai:gpt-4o-mini"))
            span.set_attribute("prompt.text", prompt)
            span.set_attribute("prompt.length", len(prompt))
            
            try:
                # Run the agent synchronously
                with tracer.start_as_current_span("agent.run_sync") as run_span:
                    result = agent.run_sync(prompt)
                    run_span.set_attribute("agent.run.success", True)
                
                # Access the structured data
                response_data = result.data
                
                span.set_attribute("response.category", response_data.category)
                span.set_attribute("response.needs_escalation", response_data.needs_escalation)
                span.set_attribute("response.sentiment", response_data.sentiment)
                span.set_attribute("response.length", len(response_data.response))
                span.set_attribute("agent.success", True)
                
                # Return the structured response as a formatted string
                return {
                    "output": f"{response_data.response}\n\n[Category: {response_data.category}, Needs Escalation: {response_data.needs_escalation}, Sentiment: {response_data.sentiment}]"
                }
            except Exception as e:
                span.record_exception(e)
                span.set_attribute("agent.success", False)
                return {
                    "output": f"Error running agent: {str(e)}",
                    "error": str(e)
                }
    else:
        # Run without tracing if no trace context
        try:
            result = agent.run_sync(prompt)
            response_data = result.data
            return {
                "output": f"{response_data.response}\n\n[Category: {response_data.category}, Needs Escalation: {response_data.needs_escalation}, Sentiment: {response_data.sentiment}]"
            }
        except Exception as e:
            return {
                "output": f"Error running agent: {str(e)}",
                "error": str(e)
            } 