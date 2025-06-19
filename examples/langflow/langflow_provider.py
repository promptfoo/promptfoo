import os
import requests
import json
import sys


def get_demo_response(prompt):
    """Return demo responses for testing without a real Langflow setup."""
    prompt_lower = prompt.lower()
    
    if "hello" in prompt_lower or "help" in prompt_lower:
        return "Hello! I'm a Langflow AI assistant. I can help you with various tasks including answering questions, writing code, and solving problems. How can I assist you today?"
    
    elif "artificial intelligence" in prompt_lower or "ai" in prompt_lower:
        return "Artificial Intelligence (AI) is the simulation of human intelligence in machines. It encompasses machine learning, natural language processing, computer vision, and other technologies that enable computers to perform tasks that typically require human intelligence."
    
    elif "python" in prompt_lower and ("function" in prompt_lower or "add" in prompt_lower):
        return """Here's a simple Python function to add two numbers:

```python
def add_numbers(a, b):
    \"\"\"Add two numbers and return the result.\"\"\"
    return a + b

# Example usage:
result = add_numbers(5, 3)
print(f"5 + 3 = {result}")
```

This function takes two parameters and returns their sum."""
    
    elif "2 + 2" in prompt_lower or "2+2" in prompt_lower:
        return "2 + 2 equals 4."
    
    elif not prompt.strip():
        return "I'm ready to help! Please ask me a question or tell me what you'd like assistance with."
    
    else:
        return f"I understand you're asking about: '{prompt}'. This is a demo response from the Langflow provider. In a real setup, this would be processed by your custom Langflow workflow."


def call_api(prompt, options, context):
    """
    A Langflow provider that calls a Langflow flow via HTTP API.
    Includes demo mode for testing without real Langflow setup.
    """
    # Get configuration from environment variables
    langflow_url = os.getenv("LANGFLOW_URL", "http://localhost:7860")
    langflow_api_key = os.getenv("LANGFLOW_API_KEY", "demo")
    flow_id = os.getenv("LANGFLOW_FLOW_ID", "demo-flow")
    
    # Demo mode - return mock responses for testing
    if langflow_api_key == "demo" or flow_id == "demo-flow":
        return {"output": get_demo_response(prompt)}
    
    # Real Langflow API mode
    if not langflow_api_key or langflow_api_key == "demo":
        return {
            "error": "Set LANGFLOW_API_KEY to your real API key (or use 'demo' for demo mode)",
            "output": None
        }
    
    if not flow_id or flow_id == "demo-flow":
        return {
            "error": "Set LANGFLOW_FLOW_ID to your real flow ID (or use 'demo-flow' for demo mode)",
            "output": None
        }
    
    # Prepare the API request
    url = f"{langflow_url}/api/v1/run/{flow_id}"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": langflow_api_key
    }
    
    payload = {
        "input_value": prompt,
        "output_type": "chat",
        "input_type": "chat"
    }
    
    try:
        # Make the API request
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        
        # Parse the Langflow response
        if "outputs" in result and len(result["outputs"]) > 0:
            outputs = result["outputs"][0]
            if "outputs" in outputs and len(outputs["outputs"]) > 0:
                output_data = outputs["outputs"][0]
                if "results" in output_data and "message" in output_data["results"]:
                    message = output_data["results"]["message"]
                    if "text" in message:
                        return {"output": message["text"]}
        
        # Fallback parsing
        return {"output": result.get("output", json.dumps(result))}
        
    except requests.exceptions.RequestException as e:
        return {
            "error": f"Failed to call Langflow API: {str(e)}",
            "output": None
        }
    except Exception as e:
        return {
            "error": f"Error processing Langflow response: {str(e)}",
            "output": None
        }


if __name__ == "__main__":
    # For testing the provider directly
    if len(sys.argv) > 1:
        test_prompt = sys.argv[1]
        result = call_api(test_prompt, {}, {})
        if result.get("error"):
            print(f"Error: {result['error']}")
        else:
            print(result["output"])
    else:
        print("Usage: python langflow_provider.py 'Your test prompt here'")
        print("Demo mode: Uses default demo credentials")
        print("Real mode: Set LANGFLOW_API_KEY and LANGFLOW_FLOW_ID environment variables") 