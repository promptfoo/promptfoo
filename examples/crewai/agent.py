import asyncio
import json
import os
import re
import textwrap
from typing import Any, Dict

from crewai import Agent, Crew, Task

# ✅ Load the OpenAI API key from the environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def get_recruitment_agent(model: str = "openai:gpt-4.1") -> Crew:
    """
    Creates a CrewAI recruitment agent setup.
    This agent's goal: find the best Ruby on Rails + React candidates.
    """
    agent = Agent(
        role="Senior Recruiter specializing in technical roles",
        goal="Find the best candidates for a given set of job requirements and return the results in a valid JSON format.",
        backstory=textwrap.dedent("""
            You are an expert recruiter with years of experience in sourcing top talent for the tech industry.
            You have a keen eye for detail and are a master at following instructions to the letter, especially when it comes to output formats.
            You never fail to return a valid JSON object as your final answer.
        """).strip(),
        verbose=False,
        model=model,
        api_key=OPENAI_API_KEY,  # ✅ Make sure to pass the API key
    )

    task = Task(
        description="Find the top 3 candidates based on the following job requirements: {job_requirements}",
        expected_output=textwrap.dedent("""
            A single valid JSON object. The JSON object must have a single key called "candidates".
            The value of the "candidates" key must be an array of JSON objects.
            Each object in the array must have the following keys: "name", "experience", and "skills".
            - "name" must be a string representing the candidate's name.
            - "experience" must be a string summarizing the candidate's relevant experience.
            - "skills" must be an array of strings listing the candidate's skills.

            Example of the expected final output:
            {
              "candidates": [
                {
                  "name": "Jane Doe",
                  "experience": "8 years of experience in Ruby on Rails and React, with a strong focus on building scalable web applications.",
                  "skills": ["Ruby on Rails", "React", "JavaScript", "PostgreSQL", "TDD"]
                }
              ]
            }
        """).strip(),
        agent=agent,
    )

    # ✅ Combine agent + task into a Crew setup
    crew = Crew(agents=[agent], tasks=[task])
    return crew


async def run_recruitment_agent(prompt, model="openai:gpt-4.1"):
    """
    Runs the recruitment agent with a given job requirements prompt.
    Returns a structured JSON-like dictionary with candidate info.
    """
    # Check if API key is set
    if not OPENAI_API_KEY:
        return {
            "error": "OpenAI API key not found. Please set the OPENAI_API_KEY environment variable or create a .env file with your API key."
        }

    crew = get_recruitment_agent(model)
    try:
        # ⚡ Trigger the agent to start working
        crew.kickoff(inputs={"job_requirements": prompt})

        # The result might be a string, or an object with a 'raw' attribute.
        output_text = ""
        if result:
            if hasattr(result, "raw") and result.raw:
                output_text = result.raw
            elif isinstance(result, str):
                output_text = result

        if not output_text:
            return {"error": "CrewAI agent returned an empty response."}

        # Use regex to find the JSON block, even with markdown
        json_match = re.search(r"```json\s*([\s\S]*?)\s*```|({[\s\S]*})", output_text)
        if not json_match:
            return {
                "error": "No valid JSON block found in the agent's output.",
                "raw_output": output_text,
            }

        json_string = json_match.group(1) or json_match.group(2)

        try:
            return json.loads(json_string)
        except json.JSONDecodeError as e:
            return {
                "error": f"Failed to parse JSON from agent output: {str(e)}",
                "raw_output": json_string,
            }

    except Exception as e:
        # 🔥 Catch and report any error as part of the output
        return {"error": f"An unexpected error occurred: {str(e)}"}


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Calls the CrewAI recruitment agent with the provided prompt.
    Wraps the async function in a synchronous call for Promptfoo.
    """
    try:
        # ✅ Run the async recruitment agent synchronously
        config = options.get("config", {})
        model = config.get("model", "openai:gpt-4.1")
        result = asyncio.run(run_recruitment_agent(prompt, model=model))

        if "error" in result:
            return {"error": result["error"], "raw": result.get("raw_output", "")}
        return {"output": result}

    except Exception as e:
        # 🔥 Catch and return any error as part of the output
        return {"error": f"An error occurred in call_api: {str(e)}"}


if __name__ == "__main__":
    # 🧪 Simple test block to check provider behavior standalone
    print("✅ Testing CrewAI provider...")

    # 🔧 Example test prompt
    test_prompt = "We need a Ruby on Rails and React engineer with at least 5 years of experience."

    # ⚡ Call the API function with test inputs
    result = call_api(test_prompt, {}, {})

    # 📦 Print the result to console
    print("Provider result:", json.dumps(result, indent=2))
