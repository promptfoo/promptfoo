export const AGENT_FRAMEWORKS = [
  'langchain',
  'autogen',
  'crewai',
  'llamaindex',
  'langgraph',
  'openai-agents-sdk',
  'pydantic-ai',
  'google-adk',
  'generic-agent',
];

export const AGENT_TEMPLATE = `import os

"""
GENERIC AGENT TEMPLATE FOR PROMPTFOO
This template works with any Python-based agent framework. Simply implement 
the call_api function below to connect your agent to promptfoo's evaluation system.
"""

# TODO: Import your agent framework libraries here
# Examples:
# - from your_framework import Agent
# - from company_internal.agents import CustomAgent  
# - import proprietary_agent_sdk

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    This is the only function you need to implement. Promptfoo will call this
    function with test prompts and evaluate the responses.
    
    Args:
        prompt (str): The input prompt/query from promptfoo
        options (dict): Additional options from promptfoo config
        context (dict): Evaluation context including test variables
    
    Returns:
        dict: Must contain an 'output' key with your agent's response
              Can optionally include 'error' for error handling
              Can optionally include 'tokenUsage' for token tracking
    
    Example return values:
        {"output": "Agent response text"}
        {"output": "Response", "tokenUsage": {"total": 150, "prompt": 50, "completion": 100}}
        {"error": "Error message"} 
    """
    
    # TODO: Initialize your agent
    # Example:
    # agent = YourAgent(
    #     model="gpt-4",
    #     temperature=0.7,
    #     # ... your agent configuration
    # )
    
    # TODO: Process the prompt with your agent
    # Example:
    # response = agent.process(prompt)
    # 
    # Or for stateful agents:
    # agent.add_message({"role": "user", "content": prompt})
    # response = agent.get_response()
    
    # TODO: Extract and return the response
    # Make sure to return a dict with 'output' key
    
    # Placeholder implementation - replace with your actual agent code
    response = f"[Your agent response to: {prompt}]"
    
    return {
        "output": response,
        # Optional: Include token usage if your agent tracks it
        # "tokenUsage": {
        #     "total": 100,
        #     "prompt": 30,
        #     "completion": 70
        # }
    }
`;
