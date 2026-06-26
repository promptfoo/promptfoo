import asyncio
import json
import os
import re
import textwrap
from typing import Any, Dict

from crewai import LLM, Agent, Crew, Task

# ✅ Load the OpenAI API key from the environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> Dict[str, Any]:
    parsed: Dict[str, Any] = {}
    for key, value in pairs:
        if key in parsed:
            raise ValueError(f"Duplicate JSON key: {key}")
        parsed[key] = value
    return parsed


def get_recruitment_agent(model: str = "openai/gpt-4.1") -> Crew:
    """
    Creates a CrewAI recruitment agent setup.
    This agent's goal: find candidates that match the supplied job requirements.
    """
    llm = LLM(model=model, api_key=OPENAI_API_KEY)
    agent = Agent(
        role="Senior Recruiter specializing in technical roles",
        goal="Find the best candidates for a given set of job requirements and return candidates with a short summary in valid JSON format.",
        backstory=textwrap.dedent("""
            You are an expert recruiter with years of experience in sourcing top talent for the tech industry.
            You have a keen eye for detail and are a master at following instructions to the letter, especially when it comes to output formats.
            You never fail to return a valid JSON object as your final answer.
        """).strip(),
        verbose=False,
        llm=llm,
    )

    task = Task(
        description="Find at least 2 candidates based on the following job requirements: {job_requirements}",
        expected_output=textwrap.dedent("""
            A single valid JSON object with "candidates" and "summary" keys.
            The value of the "candidates" key must be an array of JSON objects.
            Each object in the array must have the following keys: "name", "experience", and "skills".
            - "name" must be a string representing the candidate's name.
            - "experience" must be a string summarizing the candidate's relevant experience.
            - "skills" must be an array of strings listing the candidate's skills.
            The top-level "summary" value must be a short string explaining the recommendation.

            Example of a valid output shape (with two candidates):
            {
              "candidates": [
                {
                  "name": "Jane Doe",
                  "experience": "8 years of experience in Ruby on Rails and React, with a strong focus on building scalable web applications.",
                  "skills": ["Ruby on Rails", "React", "JavaScript", "PostgreSQL", "TDD"]
                },
                {
                  "name": "John Smith",
                  "experience": "6 years of experience building Ruby on Rails and React applications.",
                  "skills": ["Ruby on Rails", "React", "TypeScript", "PostgreSQL"]
                }
              ],
              "summary": "Jane Doe and John Smith are strong matches based on their Rails and React experience."
            }
        """).strip(),
        agent=agent,
    )

    # ✅ Combine agent + task into a Crew setup
    crew = Crew(agents=[agent], tasks=[task])
    return crew


async def run_recruitment_agent(prompt, model="openai/gpt-4.1"):
    """
    Runs the recruitment agent with a given job requirements prompt.
    Returns a structured JSON-like dictionary with candidate info.
    """
    # Check if API key is set
    if not OPENAI_API_KEY:
        return {
            "error": "OpenAI API key not found. Set OPENAI_API_KEY in the environment or load it with promptfoo --env-file."
        }

    crew = get_recruitment_agent(model)
    try:
        # ⚡ Trigger the agent to start working
        output_text = crew.kickoff(inputs={"job_requirements": prompt}).raw.strip()

        if not output_text:
            return {"error": "CrewAI agent returned an empty response."}

        # Accept either a JSON object or one complete Markdown JSON fence.
        json_match = re.fullmatch(
            r"```(?:json)?\s*([\s\S]*?)\s*```", output_text, re.IGNORECASE
        )
        if not json_match and not output_text.startswith("{"):
            return {
                "error": "No valid JSON block found in the agent's output.",
                "raw_output": output_text,
            }

        json_string = json_match.group(1) if json_match else output_text

        try:
            return json.loads(json_string, object_pairs_hook=reject_duplicate_json_keys)
        except (json.JSONDecodeError, ValueError) as e:
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
        model = config.get("model", "openai/gpt-4.1")
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
