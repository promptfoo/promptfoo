import asyncio
import json
import math
import os
import textwrap
from typing import Any, Dict, NoReturn

from crewai import LLM, Agent, Crew, Task

# ✅ Load the OpenAI API key from the environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MAX_SAFE_JSON_INTEGER = (1 << 53) - 1


class RecruitmentAgentError(Exception):
    def __init__(self, message: str, raw_output: str = ""):
        super().__init__(message)
        self.raw_output = raw_output


def reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> Dict[str, Any]:
    parsed: Dict[str, Any] = {}
    for key, value in pairs:
        if key in parsed:
            raise ValueError(f"Duplicate JSON key: {key}")
        parsed[key] = value
    return parsed


def reject_invalid_json_constant(value: str) -> NoReturn:
    raise ValueError(f"Invalid JSON constant: {value}")


def parse_safe_json_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError(f"JSON number is outside the finite range: {value}")
    if abs(parsed) > MAX_SAFE_JSON_INTEGER:
        raise ValueError(f"JSON number is outside JavaScript's safe range: {value}")
    return parsed


def parse_safe_json_int(value: str) -> int | float:
    if value == "-0":
        return -0.0
    parsed = int(value)
    if abs(parsed) > MAX_SAFE_JSON_INTEGER:
        raise ValueError(f"JSON integer is outside JavaScript's safe range: {value}")
    return parsed


def unwrap_json_fence(output_text: str) -> str | None:
    if not output_text.startswith("```") or not output_text.endswith("```"):
        return None

    content = output_text[3:-3].lstrip(" \t")
    if content[:4].lower() == "json" and (
        len(content) == 4 or content[4].isspace() or content[4] in "{["
    ):
        content = content[4:]
    return content.strip()


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
            You are a technical recruiter who evaluates candidates against supplied role requirements.
            Return a single valid JSON object as your final answer.
        """).strip(),
        verbose=False,
        llm=llm,
    )

    task = Task(
        description="Return at least 2 candidate entries based on the following job requirements: {job_requirements}",
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
    Raises RecruitmentAgentError when the provider cannot return valid output.
    """
    # Check if API key is set
    if not OPENAI_API_KEY:
        raise RecruitmentAgentError(
            "OpenAI API key not found. Set OPENAI_API_KEY in the environment or load it with promptfoo --env-file."
        )

    try:
        crew = get_recruitment_agent(model)

        # ⚡ Trigger the agent to start working
        output_text = crew.kickoff(inputs={"job_requirements": prompt}).raw.strip()

        if not output_text:
            raise RecruitmentAgentError("CrewAI agent returned an empty response.")

        # Accept either a JSON object or one complete Markdown JSON fence.
        fenced_json = unwrap_json_fence(output_text)
        if fenced_json is None and not output_text.startswith("{"):
            raise RecruitmentAgentError(
                "No valid JSON block found in the agent's output.", output_text
            )

        json_string = fenced_json if fenced_json is not None else output_text

        try:
            return json.loads(
                json_string,
                object_pairs_hook=reject_duplicate_json_keys,
                parse_constant=reject_invalid_json_constant,
                parse_float=parse_safe_json_float,
                parse_int=parse_safe_json_int,
            )
        except (json.JSONDecodeError, ValueError) as e:
            raise RecruitmentAgentError(
                f"Failed to parse JSON from agent output: {str(e)}", json_string
            ) from e

    except RecruitmentAgentError:
        raise
    except Exception as e:
        raise RecruitmentAgentError(f"An unexpected error occurred: {str(e)}") from e


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
        return {"output": result}

    except RecruitmentAgentError as e:
        return {"error": str(e), "raw": e.raw_output}
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
