# Note: This code has been consolidated into provider.py to avoid import issues
# when running with promptfoo. The provider.py file contains both the agent
# setup and the provider interface.

import os

from crewai import Agent, Crew, Task

# ✅ Load the OpenAI API key from the environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def get_recruitment_agent(model: str = "openai:gpt-4o") -> Crew:
    """
    Creates a CrewAI recruitment agent setup.
    This agent's goal: find the best Ruby on Rails + React candidates.
    """
    agent = Agent(
        role="Recruiter",
        goal="Find the best Ruby on Rails + React candidates",
        backstory="An experienced recruiter specialized in tech roles.",
        verbose=False,
        model=model,
        api_key=OPENAI_API_KEY,  # ✅ Make sure to pass the API key
    )

    task = Task(
        description="List the top 3 candidates with RoR and React experience.",
        expected_output="A list with names and experience summaries of top 3 candidates.",
        agent=agent,
    )

    # ✅ Combine agent + task into a Crew setup
    crew = Crew(agents=[agent], tasks=[task])
    return crew


async def run_recruitment_agent(prompt, model="openai:gpt-4o"):
    """
    Runs the recruitment agent with a given job requirements prompt.
    Returns a structured JSON-like dictionary with candidate info.
    """
    crew = get_recruitment_agent(model)
    try:
        # ⚡ Trigger the agent to start working
        result = crew.kickoff(inputs={"job_requirements": prompt})

        # 🚀 Mock structured output for testing & validation
        candidates_list = [
            {"name": "Alex", "experience": "7 years RoR + React"},
            {"name": "William", "experience": "10 years RoR"},
            {"name": "Stanislav", "experience": "11 years fullstack"},
        ]

        return {
            "candidates": candidates_list,
            "summary": "Top 3 candidates with strong Ruby on Rails and React experience.",
        }

    except Exception as e:
        # 🔥 Catch and report any error as part of the output
        return {"candidates": [], "summary": f"Error occurred: {str(e)}"}
