import json
import sys


def prompt_with_config(context):
    """
    A Python prompt function that returns both prompt content and configuration.
    """
    vars = context["vars"]
    provider = context.get("provider", {})

    # Dynamic configuration based on the topic
    if vars["topic"] == "the Roman Empire" or vars["topic"] == "bob dylan":
        # Complex topics need more elaboration
        temperature = 0.8
        max_tokens = 200
    else:
        # Simple topics can be more constrained
        temperature = 0.4
        max_tokens = 100

    # Return structured object with both prompt and config
    return {
        "prompt": [
            {
                "role": "system",
                "content": f"You are a Python expert assistant using {provider.get('id', 'an AI')} model. Be technical and precise.",
            },
            {
                "role": "user",
                "content": f"Explain {vars['topic']} as if it were a Python library. What would its main classes and methods be?",
            },
        ],
        "config": {
            "temperature": temperature,
            "max_tokens": max_tokens,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.3,
        },
    }


if __name__ == "__main__":
    # When executed directly, run the prompt_with_config function
    print(json.dumps(prompt_with_config(json.loads(sys.argv[1]))))
