import requests

url = "https://customer-service-chatbot-example.promptfoo.app"



def call_api(prompt, options, context):
    """
    Custom API provider function for multi-turn conversations.
    
    This function is called by promptfoo for each test case and handles
    communication with a multi-turn conversation API endpoint.
    
    Args:
        prompt (str): The user's message/input for this turn of the conversation
        options (dict): Configuration options passed from the promptfoo config
            - config (dict): Custom configuration parameters
        context (dict): Context information including conversation state
            - vars (dict): Variables from the test case, including sessionId for conversation continuity
    
    Returns:
        dict: Response object containing:
            - output (str): The API's response message (if successful)
            - error (str): Error message (if API call failed)
            - tokenUsage (dict): Token usage information (if exposed by the API)
            - metadata (dict): Additional metadata including config options
    
    Example:
        >>> prompt = "What is the weather like?"
        >>> options = {"config": {"temperature": 0.7}}
        >>> context = {"vars": {"sessionId": "conv_123"}}
        >>> result = call_api(prompt, options, context)
        >>> print(result["output"])  # API response message
    """

    # Get the session ID from the context
    session_id = context.get("vars", {}).get("sessionId", "")
    payload = {
        "message": prompt,

        # Add the session ID to the payload.  Could also be added to a header depending on your API.
        "conversationId": session_id,
        "email": "john.doe@example.com",
    }
    try:
        response = requests.post(
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30,
            verify=False  # Disable SSL verification (not recommended for production)
        )
        response.raise_for_status()  # Raise an exception for bad status codes
        response_data = response.json() if response.content else {}
    except requests.exceptions.HTTPError as e:
        response_data = {"error": f"HTTP {e.response.status_code}", "body": e.response.text}
    except requests.exceptions.RequestException as e:
        response_data = {"error": str(e)}

    # Extract token usage information from the response
    token_usage = None
    if isinstance(response_data, dict) and "error" in response_data:
        return {
            "error": response_data["error"],
            "tokenUsage": token_usage,
            "metadata": {
                "config": options.get("config", {}),
            },
        }

    return {
        "output": response_data.get("message", response_data)
        if isinstance(response_data, dict)
        else response_data,
        "tokenUsage": token_usage,
        "metadata": {
            "config": options.get("config", {}),
        },
    }


if __name__ == "__main__":
    # Example usage showing prompt, options with config, and context with vars
    prompt = "What is the weather in San Francisco?"
    options = {"config": {"optionFromYaml": 123}}
    context = {"vars": {"location": "San Francisco"}}

    print(call_api(prompt, options, context))
