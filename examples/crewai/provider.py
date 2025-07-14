import asyncio
from typing import Any, Dict

from agent import run_recruitment_agent


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Calls the CrewAI recruitment agent with the provided prompt.
    Wraps the async function in a synchronous call for Promptfoo.
    """
    try:
        # ✅ Run the async recruitment agent synchronously
        result = asyncio.run(run_recruitment_agent(prompt))
        return {"output": result}

    except Exception as e:
        # 🔥 Catch and return any error as part of the output
        return {"output": {"candidates": [], "summary": f"Error occurred: {str(e)}"}}


if __name__ == "__main__":
    # 🧪 Simple test block to check provider behavior standalone
    print("✅ Testing CrewAI provider...")

    # 🔧 Example test prompt
    test_prompt = "We need a Ruby on Rails and React engineer."

    # ⚡ Call the API function with test inputs
    result = call_api(test_prompt, {}, {})

    # 📦 Print the result to console
    print("Provider result:", result)
