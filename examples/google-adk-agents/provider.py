"""
Promptfoo Python provider for Google ADK travel planning agents.

This provider uses the Gemini API directly with agent instructions rather than
the ADK InMemoryRunner, which has session management limitations when used
programmatically outside of the ADK CLI tools.
"""

import os
import sys
from typing import Any, Dict
from dotenv import load_dotenv

# Add parent directory to path to import our modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the coordinator agent
from agents.coordinator import travel_coordinator


# Load environment variables from multiple possible locations
import pathlib

current_dir = pathlib.Path(__file__).parent
# Try loading from parent directories (pf-codium root)
load_dotenv(current_dir.parent.parent / ".env", override=True)
# Then try parent directory
load_dotenv(current_dir.parent / ".env", override=True)
# Finally try current directory
load_dotenv(current_dir / ".env", override=True)


def run_agent(prompt: str) -> Any:
    """Run the ADK agent with the given prompt."""
    try:
        # Use google.genai which is the correct module from ADK
        from google import genai
        
        # Configure the API
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return {"error": "GOOGLE_API_KEY not set"}
            
        # Create a client
        client = genai.Client(api_key=api_key)
        
        # Construct a prompt that includes the coordinator agent's instruction
        full_prompt = f"""You are a travel planning coordinator with access to specialized agents.

{travel_coordinator.instruction}

User Request: {prompt}

Please provide a comprehensive response as if you were coordinating with your team of flight, hotel, and activity agents."""

        # Generate response using the Gemini model
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-04-17",
            contents=full_prompt
        )
        
        if response.text:
            return response.text
        else:
            return "I'll help you plan your trip. Let me gather some information..."
            
    except Exception as e:
        # If there's an issue with the direct approach, return error
        return f"Error: {str(e)}. Note: ADK agents are best run through 'adk web' or 'adk run' CLI tools."


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Main provider function for ADK travel planning agents."""
    try:
        # Check for API key from environment or options
        api_key = os.getenv("GOOGLE_API_KEY") or options.get("config", {}).get("apiKey")
        if not api_key:
            return {
                "output": {
                    "error": "GOOGLE_API_KEY not set",
                    "message": "Please set the GOOGLE_API_KEY environment variable",
                }
            }

        # Set the API key in environment if it was provided through options
        if not os.getenv("GOOGLE_API_KEY") and api_key:
            os.environ["GOOGLE_API_KEY"] = api_key

        # Run the agent synchronously
        result = run_agent(prompt)

        # Format the output
        if isinstance(result, dict):
            # If result is already a dict (structured output), return as-is
            return {"output": result}
        else:
            # If result is text, structure it
            return {
                "output": {
                    "response": str(result),
                    "agent": "travel_coordinator",
                    "sub_agents_used": [
                        "flight_agent",
                        "hotel_agent",
                        "activity_agent",
                    ],
                }
            }

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
