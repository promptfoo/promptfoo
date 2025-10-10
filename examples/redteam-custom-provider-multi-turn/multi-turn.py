import json
import logging
import re
import requests
import urllib3

# Suppress SSL warnings since we're using verify=False for the example
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

url = "https://customer-service-chatbot-example.promptfoo.app"


def call_api(prompt, options, context):
    """
    Custom API provider function for multi-turn conversations.

    This function is called by promptfoo for each test case and handles
    communication with a multi-turn conversation API endpoint.

    Args:
        prompt (str): The user's message/input for this turn of the conversation.  If stateful is set to false in your config, this can be a list of messages expressed as JSON.
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
    logger.info(f"Using session ID: {session_id}")
    if isinstance(prompt, str):
        # Use regex to detect JSON-like patterns
        prompt_stripped = prompt.strip()
        json_pattern = r'^(\{.*\}|\[.*\]|".*"|true|false|null|\d+|-\d+)$'
        is_likely_json = re.match(json_pattern, prompt_stripped) is not None
        if is_likely_json:
            try:
                # Try to parse as JSON
                parsed_prompt = json.loads(prompt)
                # If it's an array, log the number of messages
                if isinstance(parsed_prompt, list):
                    logger.info(f"Prompt includes {len(parsed_prompt)} messages")

            except json.JSONDecodeError:
                # If it's not valid JSON, use as string
                logger.info(
                    "Prompt looked like JSON but failed to parse, using as string"
                )
        else:
            logger.info("Prompt is a single message")

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
            verify=False,  # Disable SSL verification (not recommended for production)
        )
        response.raise_for_status()  # Raise an exception for bad status codes
        response_data = response.json() if response.content else {}
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error {e.response.status_code}: {e.response.text}")
        response_data = {
            "error": f"HTTP {e.response.status_code}",
            "body": e.response.text,
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed: {str(e)}")
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
        "output": response_data.get("message", response_data).get("response")
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
