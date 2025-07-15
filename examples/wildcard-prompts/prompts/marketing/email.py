def generate_prompt(context):
    """Generate a marketing email prompt based on context"""
    product = context.get("vars", {}).get("product", "our product")
    audience = context.get("vars", {}).get("audience", "customers")

    return f"""Write a compelling marketing email for {product} targeting {audience}.

The email should:
- Have an attention-grabbing subject line
- Highlight key benefits
- Include a clear call-to-action
- Be concise and engaging"""
