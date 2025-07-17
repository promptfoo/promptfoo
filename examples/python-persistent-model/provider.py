"""
Promptfoo Python provider that connects to the persistent model server.
"""

import os
import json
import requests
import backoff
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Server configuration
MODEL_SERVER_URL = os.getenv('MODEL_SERVER_URL', 'http://localhost:5000')

@backoff.on_exception(
    backoff.expo,
    requests.exceptions.RequestException,
    max_tries=3,
    max_time=30
)
def call_api(prompt, options, context):
    """
    Call the persistent model server API.
    
    Args:
        prompt: The input prompt string
        options: Provider configuration
        context: Test context with variables
        
    Returns:
        dict: Response with 'output' key
    """
    config = options.get('config', {})
    
    # Prepare request payload
    payload = {
        'prompt': prompt,
        'max_length': config.get('max_length', 150),
        'temperature': config.get('temperature', 0.7)
    }
    
    try:
        # Make request to model server
        response = requests.post(
            f"{MODEL_SERVER_URL}/generate",
            json=payload,
            timeout=config.get('timeout', 30)
        )
        
        response.raise_for_status()
        result = response.json()
        
        # Return in promptfoo format
        return {
            "output": result.get('output', ''),
            "metadata": {
                "model": result.get('model', 'unknown')
            }
        }
        
    except requests.exceptions.Timeout:
        logger.error("Request timed out")
        return {
            "output": "",
            "error": "Request timed out"
        }
    except requests.exceptions.ConnectionError:
        logger.error("Failed to connect to model server")
        return {
            "output": "",
            "error": f"Failed to connect to model server at {MODEL_SERVER_URL}"
        }
    except Exception as e:
        logger.error(f"Error calling model server: {str(e)}")
        return {
            "output": "",
            "error": str(e)
        }


def check_server_health(server_url):
    """
    Optional: Check if the model server is healthy
    """
    try:
        response = requests.get(f"{server_url}/health", timeout=5)
        if response.status_code == 200:
            return response.json()
        return None
    except:
        return None


if __name__ == "__main__":
    # Test the provider locally
    test_prompt = "Once upon a time"
    test_options = {
        "config": {
            "server_url": "http://localhost:5000",
            "max_length": 50,
            "temperature": 0.8
        }
    }
    
    # Check server health first
    health = check_server_health(test_options["config"]["server_url"])
    if health:
        print(f"Server health: {health}")
    else:
        print("Warning: Server health check failed")
    
    # Test generation
    result = call_api(test_prompt, test_options, {})
    print(f"Result: {result}") 