"""
Promptfoo Provider for UCP Agent Evaluation

This provider wraps the UCP agent to integrate with promptfoo's evaluation framework.
It receives scenario configurations and returns structured results for assertion.

Usage:
    promptfoo eval -c promptfooconfig.yaml
"""

import json
import os
import sys

# Configure Google GenAI authentication BEFORE importing agent
# This must happen before any google.adk or google.genai imports
if os.environ.get("GOOGLE_CLOUD_PROJECT"):
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")

# Add current directory to path for agent import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent import run_ucp_scenario  # noqa: E402


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """
    Promptfoo provider interface.

    Args:
        prompt: The prompt string (scenario JSON or description)
        options: Provider options from config
        context: Evaluation context including vars

    Returns:
        dict with 'output' key containing the result artifact
    """
    try:
        # Get configuration from options and context
        provider_config = options.get("config", {})
        vars_dict = context.get("vars", {})

        # Determine scenario source
        # Priority: vars.scenario > prompt as JSON > vars fields directly
        scenario = None

        # Try to get scenario from vars
        if "scenario" in vars_dict:
            scenario_data = vars_dict["scenario"]
            if isinstance(scenario_data, str):
                scenario = json.loads(scenario_data)
            else:
                scenario = scenario_data

        # Try to parse prompt as JSON scenario
        elif prompt:
            try:
                scenario = json.loads(prompt)
            except json.JSONDecodeError:
                # Prompt is not JSON, build scenario from vars
                pass

        # Build scenario from individual vars
        if scenario is None:
            scenario = {
                "scenario_id": vars_dict.get("scenario_id", "default"),
                "line_items": vars_dict.get("line_items", []),
                "buyer": vars_dict.get("buyer"),
                "discount_codes": vars_dict.get("discount_codes"),
                "fulfillment": vars_dict.get("fulfillment"),
                "payment_data": vars_dict.get("payment_data"),
                "currency": vars_dict.get("currency", "USD"),
            }

        # Parse line_items if string
        if isinstance(scenario.get("line_items"), str):
            scenario["line_items"] = json.loads(scenario["line_items"])

        # Get server configuration
        business_url = (
            provider_config.get("business_url")
            or vars_dict.get("business_url")
            or os.environ.get("UCP_BUSINESS_URL", "http://localhost:8182")
        )

        transport = (
            provider_config.get("transport")
            or vars_dict.get("transport")
            or os.environ.get("UCP_TRANSPORT", "rest")
        )

        # Load platform profile
        platform_profile = provider_config.get("platform_profile")
        if platform_profile is None:
            profile_path = provider_config.get("platform_profile_path")
            if profile_path:
                # Resolve path relative to provider file location with path traversal protection
                provider_dir = os.path.dirname(os.path.abspath(__file__))
                full_path = os.path.normpath(os.path.join(provider_dir, profile_path))
                # Ensure the resolved path is within the provider directory
                if not full_path.startswith(provider_dir):
                    raise ValueError(f"Invalid profile path: {profile_path} (path traversal detected)")
                with open(full_path) as f:
                    platform_profile = json.load(f)

        # Get traceparent for distributed tracing (if provided by promptfoo)
        traceparent = context.get("traceparent")

        # Run the scenario
        result = run_ucp_scenario(
            scenario=scenario,
            business_url=business_url,
            platform_profile=platform_profile,
            transport=transport,
            traceparent=traceparent,
        )

        # Return as JSON string for promptfoo
        return {"output": json.dumps(result)}

    except Exception as e:
        # Safely extract scenario_id from vars if available
        scenario_id = "unknown"
        try:
            scenario_id = context.get("vars", {}).get("scenario_id", "unknown")
        except Exception:
            pass
        error_result = {
            "scenario_id": scenario_id,
            "transport": "unknown",
            "success": False,
            "final_status": "provider_error",
            "error": str(e),
        }
        return {"output": json.dumps(error_result)}


def get_id() -> str:
    """Return the provider ID."""
    return "ucp-agent"


# CLI testing support
if __name__ == "__main__":
    # Test with a simple scenario
    test_prompt = json.dumps(
        {
            "scenario_id": "test_provider",
            "line_items": [{"merchant_item_id": "bouquet_roses", "quantity": 1}],
            "buyer": {"email": "test@example.com"},
        }
    )

    result = call_api(
        prompt=test_prompt,
        options={"config": {"business_url": "http://localhost:8182", "transport": "rest"}},
        context={"vars": {}},
    )

    print("Provider result:")
    print(json.dumps(json.loads(result["output"]), indent=2))
