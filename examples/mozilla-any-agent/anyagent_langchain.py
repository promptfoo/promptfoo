"""
Promptfoo provider using Any-Agent with LangChain framework
"""
from any_agent import AnyAgent, AgentConfig
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
tracer = trace.get_tracer("anyagent.langchain")

# Initialize the agent using LangChain framework
agent = AnyAgent.create(
    "langchain",  # Use LangChain framework
    AgentConfig(
        model_id="gpt-4.1",
        instructions="You are a helpful assistant."
    )
)

def call_api(prompt, options, context):
    """
    Promptfoo provider function that runs the agent
    
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
        with tracer.start_as_current_span("anyagent.langchain.call", context=ctx) as span:
            span.set_attribute("agent.framework", "langchain")
            span.set_attribute("agent.model", "gpt-4.1")
            span.set_attribute("prompt.text", prompt)
            span.set_attribute("prompt.length", len(prompt))
            
            try:
                # Run the agent with the prompt
                with tracer.start_as_current_span("agent.run") as run_span:
                    trace_result = agent.run(prompt)
                    run_span.set_attribute("agent.run.success", True)
                
                # Extract the final output from the trace
                response = str(trace_result.final_output) if hasattr(trace_result, 'final_output') else str(trace_result)
                
                span.set_attribute("response.length", len(response))
                span.set_attribute("agent.success", True)
                
                # Return in Promptfoo's expected format
                return {
                    "output": response
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
            trace_result = agent.run(prompt)
            response = str(trace_result.final_output) if hasattr(trace_result, 'final_output') else str(trace_result)
            return {
                "output": response
            }
        except Exception as e:
            return {
                "output": f"Error running agent: {str(e)}",
                "error": str(e)
            } 