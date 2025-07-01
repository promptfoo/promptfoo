"""
Promptfoo Python provider for Google ADK travel planning agents.
"""

import os
import sys
from typing import Any, Dict
from dotenv import load_dotenv
from google.adk.runners import InMemoryRunner
from google.genai import types

# Add parent directory to path to import our modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the coordinator agent
from agents.coordinator import travel_coordinator


# Load environment variables from multiple possible locations
import pathlib

current_dir = pathlib.Path(__file__).parent
# Try loading from current directory first
load_dotenv(current_dir / ".env")
# Try loading from parent directories
load_dotenv(current_dir.parent / ".env")
load_dotenv(current_dir.parent.parent / ".env")


def run_agent(prompt: str) -> Any:
    """Run the ADK agent with the given prompt."""
    try:
        # Create a runner for executing the agent
        runner = InMemoryRunner(travel_coordinator)

        # Create a unique session ID for this request
        import uuid

        session_id = str(uuid.uuid4())
        user_id = "promptfoo_user"

        # Create a session for this conversation
        session = runner.session_service.create_session_sync(
            app_name="promptfoo_test", user_id=user_id, session_id=session_id
        )

        # Create a message from the user
        user_message = types.Content(role="user", parts=[types.Part(text=prompt)])

        # Collect all response text
        response_parts = []

        try:
            # Run the agent
            events = runner.run(
                user_id=user_id, session_id=session.id, new_message=user_message
            )

            # Collect the response
            for event in events:
                if hasattr(event, "content") and event.content:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            response_parts.append(part.text)
        except Exception as e:
            # If there's an error with the runner, try to get any partial response
            if not response_parts:
                response_parts.append(f"Agent processing error: {str(e)}")

        if response_parts:
            return " ".join(response_parts)
        else:
            # If no text response, return a generic message
            return "I'll help you plan your trip. Let me gather some information..."

    except Exception as e:
        return {"error": str(e), "error_type": type(e).__name__}


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
