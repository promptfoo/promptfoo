def create_prompt(context: dict) -> list:
    topic = context["vars"]["topic"]
    return [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": f"What is {topic}?"},
    ]
