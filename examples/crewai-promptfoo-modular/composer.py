import os
from typing import Any, Dict

import yaml

try:
    from openai import OpenAI

    oai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    USE_OPENAI = True
except ImportError:
    USE_OPENAI = False

AGENTS_PATH = os.getenv("AGENTS_PATH", "agents.yaml")
TASKS_PATH = os.getenv("TASKS_PATH", "tasks.yaml")


def render(text: str, vars: Dict[str, Any]) -> str:
    """Simple template renderer for {{vars}} in YAML."""
    for k, v in vars.items():
        text = text.replace(f"{{{{{k}}}}}", str(v))
    return text


def compose_messages(agent_id: str, task_id: str, vars: Dict[str, Any]):
    """Build chat messages from YAML files."""
    agents = yaml.safe_load(open(AGENTS_PATH))
    tasks = yaml.safe_load(open(TASKS_PATH))

    agent = agents[agent_id]
    task = tasks[task_id]

    role = render(agent["role"], vars)
    goal = render(agent["goal"], vars)
    backstory = render(agent["backstory"], vars)
    description = render(task["description"], vars)
    expected_output = render(task["expected_output"], vars)

    system_message = f"""Role: {role}
Goal: {goal}
Backstory: {backstory}
You must strictly follow the expected output format.
"""

    user_message = f"""Task description:
{description}

Input text:
{vars.get("input_text", "")}

Expected output:
{expected_output}
"""

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Promptfoo entry point."""
    cfg = options.get("config", {})
    agent_id = cfg.get("agent_id", "trend_researcher")
    task_id = cfg.get("task_id", "trend_identification_task")
    vars = context.get("vars", {}) if context else {}

    messages = compose_messages(agent_id, task_id, vars)

    try:
        if USE_OPENAI:
            response = oai_client.chat.completions.create(
                model=cfg.get("model", "gpt-4o-mini"),
                messages=messages,
                temperature=cfg.get("temperature", 0.2),
            )
            return {"output": response.choices[0].message.content}
        else:
            return {"error": "OpenAI not installed or configured."}
    except Exception as e:
        return {"error": f"Composer error: {e}"}
