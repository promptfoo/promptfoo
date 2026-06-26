---
sidebar_label: Red Teaming a CrewAI Agent
description: Connect a CrewAI recruitment agent to Promptfoo, validate structured candidate responses with assertions, and run targeted red team checks against the provider.
---

# Red Teaming a CrewAI Agent

[CrewAI](https://github.com/crewAIInc/crewAI) is a framework for coordinating agents in multi-step workflows.

This guide connects a CrewAI recruitment agent to **promptfoo** through a custom Python provider, then runs functional and red team checks against that provider.

You will create the provider, define output checks, run an evaluation, and review the configured red team results.

---

## Highlights

- Setting up the project directory
- Installing promptfoo and dependencies
- Writing provider and agent files
- Configuring test cases in YAML
- Running evaluations and viewing reports
- (Optional) Running advanced red team scans for robustness

## Quick start: scaffold the example

As an alternative to the manual setup in Steps 2–5, scaffold the checked-in example:

```bash
npx promptfoo@latest init --example integration-crewai
cd integration-crewai
pip install -r requirements.txt
```

After setting `OPENAI_API_KEY`, continue at Step 6. The remaining commands use a global `promptfoo` installation; if you skipped the manual install, replace `promptfoo` with `npx promptfoo@latest` in those commands.

## Requirements

Before starting, make sure you have:

- Python 3.10 through 3.13
- Node.js `^20.20.0` or `>=22.22.0`
- OpenAI API access for the configured model
- An OpenAI API key

## Step 1: Initial Setup

Before we dive into building or testing anything, let’s make sure your system has all the basics installed and working.

Here’s what to check:

**Python installed**

Run this in your terminal:

```
python3 --version
```

CrewAI currently requires Python `>=3.10,<3.14`.

**Node.js and npm installed**

Check your Node.js version:

```
node -v
```

And check npm (Node package manager):

```
npm -v
```

Promptfoo requires Node.js `^20.20.0` or `>=22.22.0`.

**Why do we need these?**

- Python helps run local scripts and agents.
- Node.js + npm are needed for Promptfoo CLI and managing related tools.

If you’re missing any of these, install them first before moving on.

## Step 2: Create Your Project Folder

Run these commands in your terminal:

```
mkdir crewai-promptfoo
cd crewai-promptfoo
```

What’s happening here?

- `mkdir crewai-promptfoo` → Makes a fresh directory called `crewai-promptfoo`.
- `cd crewai-promptfoo` → Moves you into that directory.
- `ls` → (Optional) Just checks that it’s empty and ready to start.

## Step 3: Install the Required Libraries

Now it’s time to set up the key Python packages and the Promptfoo CLI.

In your project folder, run:

```
pip install 'crewai>=0.203.0'
npm install -g promptfoo
```

Here’s what’s happening:

- **`pip install 'crewai>=0.203.0'`** →
  Installs a CrewAI version that supports the `LLM` configuration used below. CrewAI installs its required dependencies, including OpenAI, Pydantic, and python-dotenv; LangChain is not required by this example.
- **`npm install -g promptfoo`** →
  Installs Promptfoo globally using Node.js, so you can run its CLI commands anywhere.

**Verify the installation worked**

Run these two quick checks:

```bash
python3 -c "from crewai import LLM; print('✅ CrewAI ready')"
promptfoo --version
```

If everything’s installed correctly, you should see:

```text
✅ CrewAI ready
```

And a version number from the promptfoo command.

With this, you've got a working Python + Node.js environment ready to run CrewAI agents and evaluate them with Promptfoo.

## Step 4: Initialize the Promptfoo Project

Now that your tools are installed and verified, it’s time to set up Promptfoo inside your project folder.

```
promptfoo init
```

This will launch an interactive setup where Promptfoo asks you:

**What would you like to do?**

Select `Not sure yet` to generate the base config files.

**Which model provider would you like to use?**

Select OpenAI for the model used in this guide.

Once done, Promptfoo will create two important files:

```
README.md
promptfooconfig.yaml
```

These files are your project’s backbone:

- `README.md` → a short description of your project.
- `promptfooconfig.yaml` → the main configuration file where you define models, prompts, tests, and evaluation logic.

At the end, the CLI prints the commands for running the evaluation and opening its results.

## Step 5: Write `agent.py` and Edit `promptfooconfig.yaml`

In this step, we’ll define how our CrewAI recruitment agent works, connect it to Promptfoo, and set up the YAML config for evaluation.

### Create `agent.py`

Inside your project folder, create a file called `agent.py` that contains the CrewAI agent setup and promptfoo provider interface:

````python
import asyncio
import json
import os
import textwrap
from decimal import Decimal
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
    parsed = Decimal(value)
    if abs(parsed) > MAX_SAFE_JSON_INTEGER:
        raise ValueError(f"JSON number is outside JavaScript's safe range: {value}")
    return float(parsed)


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
    This agent’s goal: find candidates that match the supplied job requirements.
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


````

Next, add the provider interface to handle Promptfoo's evaluation calls:

```python
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
```

### Edit `promptfooconfig.yaml`

Open the generated `promptfooconfig.yaml` and update it like this:

```yaml title="promptfooconfig.yaml"
description: 'CrewAI Recruitment Agent Evaluation'

# 📝 Define the input prompts (using variable placeholder)
prompts:
  - '{{job_requirements}}'

# ⚙️ Define the provider — here we point to our local agent.py
providers:
  - id: file://./agent.py # Local file provider (make sure path is correct!)
    label: CrewAI Recruitment Agent
    config:
      model: openai/gpt-4.1

# ✅ Define default tests to check the agent output shape and content
defaultTest:
  assert:
    - type: is-json # Ensure output is valid JSON
      value:
        type: object
        properties:
          candidates:
            type: array
            minItems: 2
            uniqueItems: true
            items:
              type: object
              properties:
                name:
                  type: string
                  pattern: '[^\s\p{C}\p{M}\u115F\u1160\u2800\u3164\uFFA0]'
                experience:
                  type: string
                  pattern: '[^\s\p{C}\p{M}\u115F\u1160\u2800\u3164\uFFA0]'
                skills:
                  type: array
                  minItems: 1
                  items:
                    type: string
                    pattern: '[^\s\p{C}\p{M}\u115F\u1160\u2800\u3164\uFFA0]'
              required: ['name', 'experience', 'skills']
          summary:
            type: string
            pattern: '[^\s\p{C}\p{M}\u115F\u1160\u2800\u3164\uFFA0]'
        required: ['candidates', 'summary'] # Both fields must be present

# 🧪 Specific test case to validate role-specific skills
tests:
  - description: 'Basic test for RoR and React candidates'
    vars:
      job_requirements: 'List top candidates with RoR and React'
    assert:
      - type: python # Require both skills without substring matches
        value: |
          import re
          import unicodedata

          def is_token_character(character):
              if not character:
                  return False
              category = unicodedata.category(character)
              return character.isalnum() or category[0] in {'M', 'C'} or category == 'Pc'

          def has_skill(candidate, required_skill):
              needle = required_skill.casefold()
              for candidate_skill in candidate.get('skills', []):
                  skill = candidate_skill.casefold()
                  for match in re.finditer(re.escape(needle), skill):
                      before = skill[match.start() - 1:match.start()]
                      after = skill[match.end():match.end() + 1]
                      if not is_token_character(before) and not is_token_character(after):
                          return True
              return False

          rails_skills = ['ror', 'ruby on rails']
          return all(
              any(has_skill(candidate, skill) for skill in rails_skills)
              and has_skill(candidate, 'react')
              for candidate in output.get('candidates', [])
          )
```

**What did we just do?**

- Set up the CrewAI recruitment agent to return structured candidate data.
- Created a provider that Promptfoo can call.
- Defined clear YAML tests to check the output is valid.

## Step 6: Run Your First Evaluation

Now that everything is set up, it’s time to run your first real evaluation!

In your terminal, first **export your OpenAI API key** so CrewAI can authenticate with OpenAI:

```
export OPENAI_API_KEY="sk-xxx-your-api-key-here"
```

Then run:

```
promptfoo eval
```

What happens here:

Promptfoo kicks off the evaluation job you set up.

- It uses the promptfooconfig.yaml to call your custom CrewAI provider (from agent.py).
- It feeds in the role or job-requirements prompt and collects the structured output.
- It checks the results against your Python and YAML assertions (like checking for a `candidates` list and a summary).
- It shows a clear table: did the agent PASS or FAIL?

The results table shows the candidates and summary returned by that run. A row passes only when the output satisfies the configured schema and role-specific assertions; model output and pass rates can vary between runs.

Once done, you can even open the local web viewer to explore the full results:

```
promptfoo view
```

You just ran a full Promptfoo evaluation on a custom CrewAI agent.

## Step 7: Explore Results in the Web Viewer

Now that you’ve run your evaluation, let’s **visualize and explore the results**!

In your terminal, you launched:

```
promptfoo view
```

This started a local server (in the example, at http://localhost:15500) and prompted:

```
Open URL in browser? (y/N):
```

After you answer `y`, the browser opens the Promptfoo dashboard.

### What you see in the Promptfoo Web Viewer:

- **Top bar** → The evaluation name and ID, author, date, provider and test counts, and duration.
- **Test cases table** →
  - The role or job-requirements input.
  - The CrewAI Recruitment Agent’s response.
  - Pass/fail status based on your assertions.
- **Outputs** →
  - A formatted JSON display with each candidate’s name, experience, and skills.
  - Summary text.

- **Stats** → Pass rate for the run, latency, and the number of assertions checked.

## **Step 8: Set Up Red Team Target (Custom CrewAI Provider)**

Now that your CrewAI agent is running and visible in the Promptfoo web dashboard, let’s **prepare it for red teaming**.

Red teaming will stress-test your CrewAI setup, checking for vulnerabilities, biases, or unsafe behaviors under tricky, adversarial prompts.

From the project directory, open the current red-team setup UI:

```bash
promptfoo redteam setup
```

### **What to do here:**

Under **Select Target Type**, select:

```
Custom Target
```

Under Target Name, enter something meaningful like:

```
crewAI-recruitment
```

Under Target ID, set the file reference to match your local provider:

```
file://./agent.py
```

In **Configuration (JSON)**, set the CrewAI model:

```
{
  "model": "openai/gpt-4.1"
}
```

### **Why this matters**

This setup tells Promptfoo:

“Attack and evaluate the CrewAI recruitment agent I’ve defined locally.”

Promptfoo invokes your local `agent.py` provider, which sends each test prompt to the configured OpenAI model through CrewAI.

The configured red team scan can help identify:

- Bias or unfair recommendations.
- Content filter bypasses.
- Unexpected hallucinations or failures.
- Non-compliance with business rules.

### **Target and run options**

In the target configuration, leave **Extension Hook** empty unless your evaluation needs a custom lifecycle hook. Use `{{ prompt }}` where Promptfoo should insert each generated probe. For example:

```text
Recruitment request: {{ prompt }}
```

## **Step 9: Fill in Red Team Usage and Application Details**

In this step, you define what your CrewAI application does, so the red teaming tool knows what to target and what **not** to touch.

Use the application details fields to describe the following:

**Main purpose of the application:**

We describe that it’s an **AI recruitment assistant** built using CrewAI that:

- Generates example candidate recommendations from supplied technical role requirements.
- Evaluates the configured role prompts with schema and skill checks.
- Returns structured candidate lists with names, experience, skills, and a summary.

**Key features provided:**

We list the behaviors exercised by this example:

- Job-requirements prompting.
- Structured example candidate and summary generation.
- Schema checks for the required output fields.
- Skill-focused assertions for the configured role tests.

**Industry or domain:**

We mention relevant sectors like:

- Human Resources, Recruitment, Talent Acquisition, Software Development Hiring, IT Consulting.

**System restrictions or rules to test:**

We specify the intended behavior:

- The system should only respond to recruitment-related queries.
- It should reject non-recruitment prompts and avoid generating personal, sensitive, or confidential data.
- This example has no applicant-data source, so it should not claim access to real user data.

**Why this matters:**

Promptfoo uses this context to scope generated tests to the application and its intended rules.

## **Step 10: Finalize Plugin & Strategy Setup (summary)**

In this step, you:

- Select plugins that match the risks you want to test.
- Review the recommended **Meta Agent** and **Hydra Multi-Turn** strategies, or expand **Show Advanced Strategies** to choose others.
- Review the **Application Details** and **Example Data Identifiers and Formats** fields for the mock recruitment workflow.

Meta Agent and Hydra require remote generation. Use `--remote`, set `PROMPTFOO_REMOTE_GENERATION_URL` to a self-hosted endpoint, or sign in with `promptfoo auth login` before running either strategy.

## **Step 11: Run and Check Final Red Team Results**

Now choose how you want to launch the red teaming:

**Option 1:** Save the YAML and run from the terminal.

Move the downloaded configuration into the project directory beside `agent.py`. To preserve the functional config, rename it to `promptfooconfig.redteam.yaml`, then run:

```bash
promptfoo redteam run -c promptfooconfig.redteam.yaml --remote
```

**Option 2:** Click **Run Now** in the browser. This option requires Promptfoo Cloud connectivity and remote generation to be enabled.

Once it starts, Promptfoo will:

- Run tests
- Show run progress
- Report pass/fail results
- Let you open the dedicated risk report with:

```bash
promptfoo redteam report
```

When complete, you’ll get a summary for the selected plugins and strategies, pass rate, and detailed results.

## Step 12: Check and summarize your results

You’ve now completed the configured red team run.

Go to the **risk report** and review:

- If no issues are reported, note that the selected checks did not identify issues in this run.
- A 100% pass rate means all configured checks passed in this run; it does not guarantee general safety.
- Inspect the generated probes, raw outputs, scores, and pass rates before drawing conclusions.

Final takeaway: You now have a detailed view of how your CrewAI recruitment agent performed against the configured security, fairness, and robustness probes.

Your CrewAI agent is now tested against the selected red-team checks.

## **Conclusion**

You’ve connected, tested, and red-teamed a CrewAI recruitment agent using Promptfoo.

Use the results to investigate failures, compare changes, and share the configured checks with your team.
