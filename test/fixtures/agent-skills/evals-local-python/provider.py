import json


def call_api(prompt: str, options: dict, context: dict) -> dict:
    config = options.get("config", {}) if isinstance(options, dict) else {}
    vars = context.get("vars", {}) if isinstance(context, dict) else {}
    topic = vars.get("topic") or config.get("defaultTopic") or "unknown"
    trace_id = vars.get("trace_id") or config.get("defaultTraceId") or "missing"
    return {
        "output": (f'PONG python topic={topic} trace id {trace_id} prompt="{prompt}"'),
        "metadata": {
            "topic": topic,
            "trace_id": trace_id,
        },
    }


if __name__ == "__main__":
    print(
        json.dumps(
            call_api(
                "Reply about smoke with PONG and trace id eval-py-123.",
                {},
                {"vars": {"topic": "smoke", "trace_id": "eval-py-123"}},
            ),
            sort_keys=True,
        )
    )
