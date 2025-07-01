"""
Promptfoo Python provider for Google ADK travel planning agents.
"""

import asyncio
import os
import sys
from typing import Any, Dict
from dotenv import load_dotenv

# Add parent directory to path to import our modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the coordinator agent
from agents.coordinator import travel_coordinator


# Load environment variables
load_dotenv()


async def run_agent(prompt: str) -> Any:
    """Run the ADK agent with the given prompt."""
    try:
        # Run the agent
        result = await travel_coordinator.run(prompt)
        
        # Extract the response
        if hasattr(result, 'output'):
            return result.output
        elif hasattr(result, 'text'):
            return result.text
        elif hasattr(result, 'messages'):
            # For structured responses, return the last message
            return result.messages[-1].text if result.messages else "No response"
        else:
            # Return the result as-is if it's already a dict or string
            return result
            
    except Exception as e:
        return {
            "error": str(e),
            "error_type": type(e).__name__
        }


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Main provider function for ADK travel planning agents."""
    try:
        # Check for API key
        if not os.getenv("GOOGLE_API_KEY"):
            return {
                "output": {
                    "error": "GOOGLE_API_KEY not set",
                    "message": "Please set the GOOGLE_API_KEY environment variable"
                }
            }
        
        # Get any config options
        config = options.get("config", {})
        
        # Run the agent asynchronously
        result = asyncio.run(run_agent(prompt))
        
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
                    "sub_agents_used": ["flight_agent", "hotel_agent", "activity_agent"]
                }
            }
            
    except Exception as e:
        return {
            "output": {
                "error": str(e),
                "error_type": type(e).__name__,
                "message": "An error occurred while running the agent"
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