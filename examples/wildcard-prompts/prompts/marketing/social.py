def generate_prompt(context):
    """Generate a social media post prompt"""
    platform = context.get("vars", {}).get("platform", "Twitter")
    topic = context.get("vars", {}).get("topic", "product launch")

    return f"""Create a {platform} post about {topic}.

Requirements:
- Appropriate length for {platform}
- Engaging and shareable
- Include relevant hashtags
- Drive engagement with a question or call-to-action"""
