"""
Promptfoo Python provider for PydanticAI agents.

This provider runs PydanticAI agents and returns structured outputs
for evaluation by promptfoo.
"""

import asyncio
import os
from typing import Any, Dict

from agent import run_weather_agent


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Main provider function for PydanticAI weather agent."""
    try:
        config = options.get("config", {})
        model = config.get("model", "openai:gpt-4o-mini")

        result = asyncio.run(run_weather_agent(prompt, model))
        output_dict = result.model_dump() if hasattr(result, "model_dump") else result

        return {"output": output_dict}

    except Exception as e:
        return {
            "output": {
                "location": "Unknown",
                "temperature": "N/A",
                "description": f"Error: {str(e)}",
            }
        }


if __name__ == "__main__":
    print("Testing PydanticAI provider...")
    if os.getenv("OPENAI_API_KEY"):
        result = call_api("Weather in London?", {}, {})
        print(f"Result: {result}")
    else:
        print("Set OPENAI_API_KEY to test.")
