"""
Mozilla Any-Agent provider with OpenTelemetry tracing
Supports switching between different frameworks
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from any_agent import AnyAgent, AgentConfig
from tracing_utils import create_traced_provider, initialize_tracing, StatusCode

# Initialize tracer
tracer = initialize_tracing("any-agent-comparison")

def anyagent_provider(prompt, options, context):
    """Any-Agent provider that can switch frameworks"""
    framework = options.get("config", {}).get("framework", "tinyagent")
    model = options.get("config", {}).get("model", "gpt-4.1")
    
    with tracer.start_as_current_span(f"anyagent.{framework}") as span:
        span.set_attribute("agent.framework", framework)
        span.set_attribute("agent.model", model)
        
        try:
            # Create agent with specified framework
            agent = AnyAgent.create(
                framework,
                AgentConfig(
                    model_id=model,
                    instructions="You are a helpful assistant."
                )
            )
            
            # Run the agent
            with tracer.start_as_current_span("agent.run") as run_span:
                trace_result = agent.run(prompt)
                run_span.set_attribute("agent.run.success", True)
            
            # Extract response
            response = str(trace_result.final_output) if hasattr(trace_result, 'final_output') else str(trace_result)
            
            span.set_attribute("response.length", len(response))
            span.set_status(StatusCode.OK)
            
            return {"output": response}
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(StatusCode.ERROR, str(e))
            return {"error": str(e)}

# Export the traced version
call_api = create_traced_provider(
    anyagent_provider,
    service_name="any-agent-comparison",
    provider_type="any-agent"
) 