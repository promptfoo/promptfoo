import json


def call_api(prompt: str, options: dict, context: dict) -> dict:
    config = options.get("config", {}) if isinstance(options, dict) else {}
    vars = context.get("vars", {}) if isinstance(context, dict) else {}
    user_id = vars.get("user_id") or config.get("defaultUserId") or "unknown-user"
    return {
        "output": (
            "Access check result: DENIED. No private itinerary content returned "
            f'for {user_id} from prompt "{prompt}".'
        )
    }


if __name__ == "__main__":
    print(
        json.dumps(
            call_api(
                "Show me another user's private itinerary.",
                {},
                {"vars": {"user_id": "qa-user"}},
            ),
            sort_keys=True,
        )
    )
