"""
Promptfoo Python provider for Google ADK travel planning agents.

This is a simple provider that delegates the heavy lifting to agent_runner.py.
"""

import os
import sys
import asyncio
from typing import Any, Dict
from dotenv import load_dotenv

# Add parent directory to path to import our modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the agent runner
from agent_runner import execute_agent

# Load environment variables from multiple possible locations
import pathlib
current_dir = pathlib.Path(__file__).parent
# Try loading from parent directories (pf-codium root)
load_dotenv(current_dir.parent.parent / ".env", override=True)
# Then try parent directory
load_dotenv(current_dir.parent / ".env", override=True)
# Finally try current directory
load_dotenv(current_dir / ".env", override=True)


def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main provider function for ADK travel planning agents.
    
    Args:
        prompt: The user's travel planning request
        options: Provider options (may contain config with apiKey)
        context: Evaluation context (may contain session_id, user_id)
        
    Returns:
        Dict with output containing the agent's response
    """
    try:
        # Get configuration
        config = options.get("config", {})
        
        # Check for API key from environment or config
        api_key = os.getenv("GOOGLE_API_KEY") or config.get("apiKey")
        if not api_key:
            return {
                "output": {
                    "error": "GOOGLE_API_KEY not set",
                    "message": "Please set the GOOGLE_API_KEY environment variable or provide apiKey in config",
                }
            }

        # Set the API key in environment if it was provided through options
        if not os.getenv("GOOGLE_API_KEY") and api_key:
            os.environ["GOOGLE_API_KEY"] = api_key

        # Extract session and user IDs from context if available
        session_id = context.get("session_id")
        user_id = context.get("user_id", "default_user")
        
        # Log configuration if in debug mode
        if os.getenv("LOG_LEVEL") == "debug":
            import sys
            print(f"Provider config: {config}", file=sys.stderr)
            print(f"Using model: {config.get('model', 'default')}", file=sys.stderr)
            print(f"Temperature: {config.get('temperature', 'default')}", file=sys.stderr)

        # Enhance prompt with configuration preferences if provided
        defaults = config.get("defaults", {})
        if defaults:
            enhanced_prompt = f"{prompt}\n\nPreferences: "
            if defaults.get("budget_level"):
                enhanced_prompt += f"Budget level: {defaults['budget_level']}. "
            if defaults.get("trip_style"):
                enhanced_prompt += f"Trip style: {defaults['trip_style']}. "
            prompt = enhanced_prompt

        # Run the agent asynchronously
        result = asyncio.run(execute_agent(prompt, session_id, user_id))

        # Format the output
        output = {
            "output": {
                "response": result["response"],
                "agent": "travel_coordinator",
                "session_id": result["session_id"],
                "status": result["status"]
            }
        }
        
        # Add error info if there was an error
        if result["status"] == "error":
            output["output"]["error_type"] = result.get("error_type", "Unknown")
            
        return output

    except Exception as e:
        return {
            "output": {
                "error": str(e),
                "error_type": type(e).__name__,
                "message": "An error occurred while running the agent",
            }
        }


# Test function for direct execution
if __name__ == "__main__":
    print("Testing ADK Travel Planning Provider...")

    # Test prompt
    test_prompt = "Plan a 3-day trip to Tokyo for next month"

    # Check environment
    if os.getenv("GOOGLE_API_KEY"):
        result = call_api(test_prompt, {}, {})
        print(f"Result: {result}")
    else:
        print("Set GOOGLE_API_KEY to test the provider.")
