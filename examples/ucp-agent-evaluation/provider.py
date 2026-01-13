"""
Promptfoo Provider for UCP Agent Evaluation

Wraps the UCP agent for promptfoo's evaluation framework.
"""

import json
import os
import sys

# Configure Vertex AI before importing agent
if os.environ.get("GOOGLE_CLOUD_PROJECT"):
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent import run_ucp_scenario  # noqa: E402


def _load_profile(config: dict) -> dict | None:
    """Load platform profile from config or file path."""
    if profile := config.get("platform_profile"):
        return profile

    if path := config.get("platform_profile_path"):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        full_path = os.path.normpath(os.path.join(base_dir, path))
        if not full_path.startswith(base_dir):
            raise ValueError(f"Invalid profile path: {path}")
        with open(full_path) as f:
            return json.load(f)
    return None


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Promptfoo provider interface."""
    try:
        config = options.get("config", {})
        vars_dict = context.get("vars", {})

        # Get scenario from vars (primary path) or parse prompt as JSON
        scenario = vars_dict.get("scenario")
        if isinstance(scenario, str):
            scenario = json.loads(scenario)
        elif scenario is None and prompt:
            scenario = json.loads(prompt)

        result = run_ucp_scenario(
            scenario=scenario,
            business_url=config.get("business_url") or os.environ.get("UCP_BUSINESS_URL", "http://localhost:8182"),
            platform_profile=_load_profile(config),
            transport=config.get("transport") or os.environ.get("UCP_TRANSPORT", "rest"),
            traceparent=context.get("traceparent"),
        )
        return {"output": json.dumps(result)}

    except Exception as e:
        return {"output": json.dumps({
            "scenario_id": context.get("vars", {}).get("scenario_id", "unknown"),
            "success": False,
            "final_status": "provider_error",
            "error": str(e),
        })}
