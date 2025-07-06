"""
PydanticAI provider with OpenTelemetry tracing
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from pydantic_ai import Agent
from pydantic import BaseModel
from tracing_utils import create_traced_provider

class TaskResponse(BaseModel):
    """Structured response for tasks"""
    response: str
    confidence: float
    steps_taken: list[str]

# Create the agent
agent = Agent(
    model=os.getenv("PYDANTIC_AI_MODEL", "openai:gpt-4o-mini"),
    result_type=TaskResponse,
    system_prompt="You are a helpful assistant. Break down your thinking into steps."
)

def pydantic_provider(prompt, options, context):
    """PydanticAI provider implementation"""
    try:
        result = agent.run_sync(prompt)
        response_data = result.data
        
        # Format the structured output
        output = f"{response_data.response}\n\n"
        output += f"Confidence: {response_data.confidence:.2f}\n"
        output += "Steps taken:\n"
        for i, step in enumerate(response_data.steps_taken, 1):
            output += f"{i}. {step}\n"
        
        return {"output": output}
    except Exception as e:
        return {"error": str(e)}

# Export the traced version
call_api = create_traced_provider(
    pydantic_provider,
    service_name="pydantic-ai-comparison",
    provider_type="pydantic-ai"
) 