import os
import requests
import json
import sys


def call_api(prompt, options, context):
    """
    A Langflow provider that calls a Langflow flow via HTTP API.
    """
    # Get configuration from environment variables
    langflow_url = os.getenv("LANGFLOW_URL", "http://localhost:7860")
    langflow_api_key = os.getenv("LANGFLOW_API_KEY")
    flow_id = os.getenv("LANGFLOW_FLOW_ID")
    
    if not langflow_api_key:
        return {
            "error": "LANGFLOW_API_KEY environment variable is required",
            "output": None
        }
    
    if not flow_id:
        return {
            "error": "LANGFLOW_FLOW_ID environment variable is required",
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