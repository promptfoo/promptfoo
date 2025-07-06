"""
OpenAI Agents SDK provider with OpenTelemetry tracing
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from swarm import Swarm, Agent
from tracing_utils import create_traced_provider, initialize_tracing, StatusCode

# Initialize tracer
tracer = initialize_tracing("openai-agents-comparison")

# Define a simple agent
main_agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant. Think step by step to solve problems.",
    functions=[]
)

# Initialize Swarm client
client = Swarm()

def openai_agents_provider(prompt, options, context):
    """OpenAI Agents provider implementation"""
    with tracer.start_as_current_span("openai_agents.run") as span:
        span.set_attribute("agent.name", main_agent.name)
        
        try:
            # Run the agent
            messages = [{"role": "user", "content": prompt}]
            
            with tracer.start_as_current_span("swarm.run") as run_span:
                response = client.run(
                    agent=main_agent,
                    messages=messages
                )
                run_span.set_attribute("messages.count", len(response.messages))
            
            # Extract response
            last_message = response.messages[-1]
            output = last_message["content"]
            
            span.set_attribute("response.length", len(output))
            span.set_attribute("final_agent", response.agent.name)
            span.set_status(StatusCode.OK)
            
            return {
                "output": output,
                "metadata": {
                    "agent": response.agent.name,
                    "message_count": len(response.messages)
                }
            }
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(StatusCode.ERROR, str(e))
            return {"error": str(e)}

# Export the traced version
call_api = create_traced_provider(
    openai_agents_provider,
    service_name="openai-agents-comparison",
    provider_type="openai-agents"
) 