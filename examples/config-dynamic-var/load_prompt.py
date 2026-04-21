"""Load system prompts dynamically based on agent role."""

PROMPTS = {
    "support": """You are a customer support agent. Be empathetic, acknowledge
the customer's frustration, and focus on resolving their issue quickly.""",
    "sales": """You are a sales representative. Be helpful and informative about
our products and pricing. Don't be pushy - focus on understanding their needs.""",
    "technical": """You are a technical support engineer. Provide clear, accurate
technical guidance. Include code examples or specific steps when relevant.""",
}


def get_var(var_name, prompt, other_vars):
    """Load the appropriate system prompt based on the role variable."""
    role = other_vars.get("role", "support")
    system_prompt = PROMPTS.get(role, PROMPTS["support"])
    return {"output": system_prompt}
