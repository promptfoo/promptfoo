from agent import run_research_agent


# Main API function that external tools or systems will call
def call_api(prompt, options, context):
    """
    Executes the research agent with the given prompt.

    Args:
        prompt (str): The research query or question.
        options (dict): Provider configuration, including model and apiBaseUrl.
        context (dict): Contextual information (currently unused).

    Returns:
        dict: A dictionary containing the agent's output or an error message.
    """
    try:
        # Run the research agent and get the result
        config = options.get("config", {})
        result = run_research_agent(
            prompt,
            model=config.get("model", "gpt-4o"),
            base_url=config.get("apiBaseUrl"),
        )
        # Wrap and return the result inside a dictionary
        return {"output": result}
    except Exception as e:
        # Handle any exceptions and return a provider error
        return {"error": str(e)}


# If this file is run directly, execute a simple test
if __name__ == "__main__":
    print("✅ Testing Research Agent provider...")
    test_prompt = "latest AI research trends"
    result = call_api(test_prompt, {}, {})
    print("Provider result:", result)
