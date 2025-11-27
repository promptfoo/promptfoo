"""Promptfoo provider for Strands Agents SDK.

This module exposes a call_api function that promptfoo uses to interact
with the Strands agent for evaluation.

The provider follows promptfoo's Python provider interface:
https://promptfoo.dev/docs/providers/python/

Usage in promptfooconfig.yaml:
    providers:
      - id: 'file://agent_provider.py:call_api'
        config:
          model_id: 'gpt-4o-mini'

For more information:
- Strands Agents SDK: https://github.com/strands-agents/sdk-python
- Strands Documentation: https://strandsagents.com/
- promptfoo Python Providers: https://promptfoo.dev/docs/providers/python/
"""

from typing import Any, Dict

from agent import run_agent


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Main entry point for promptfoo to call the Strands agent.

    This function is called by promptfoo for each test case. It receives the
    rendered prompt and returns the agent's response.

    Args:
        prompt: The user's input message (rendered from the prompt template)
        options: Configuration options from the provider config in YAML
        context: Context information from promptfoo (vars, test metadata, etc.)

    Returns:
        Dictionary with 'output' key containing the agent's response.
        On error, includes both 'error' and 'output' keys.
    """
    try:
        # Extract model configuration from provider options
        config = options.get("config", {})
        model_id = config.get("model_id", "gpt-4o-mini")

        # Run the Strands agent and get the response
        result = run_agent(prompt, model_id)

        # Return in promptfoo's expected format
        return {"output": result}
    except Exception as e:
        # Return error in a format promptfoo can display
        return {"error": str(e), "output": f"Error: {str(e)}"}


if __name__ == "__main__":
    import os

    print("Testing Strands agent provider...")
    if os.getenv("OPENAI_API_KEY"):
        result = call_api("What's the weather in New York?", {}, {})
        print(f"Result: {result}")
    else:
        print("Set OPENAI_API_KEY to test.")
