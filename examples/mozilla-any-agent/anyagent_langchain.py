"""
Promptfoo provider using Any-Agent with LangChain framework
"""
from any_agent import AnyAgent, AgentConfig
import os

# Initialize the agent using LangChain framework
agent = AnyAgent.create(
    "langchain",  # Use LangChain framework
    AgentConfig(
        model_id="gpt-4o-mini",
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
    try:
        # Run the agent with the prompt
        trace = agent.run(prompt)
        
        # Extract the final output from the trace
        response = str(trace.final_output) if hasattr(trace, 'final_output') else str(trace)
        
        # Return in Promptfoo's expected format
        return {
            "output": response
        }
    except Exception as e:
        return {
            "output": f"Error running agent: {str(e)}",
            "error": str(e)
        } 