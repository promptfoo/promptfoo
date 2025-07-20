import requests  # Import HTTP requests library

def call_api(prompt, config=None, context=None):
    agent_name = config.get("agent_name", "outline")  # Get agent name from config, default to 'outline'
    url = "http://localhost:8000/runs"  # ACP server endpoint

    payload = {
        "input": [{
            "text": prompt,  # Original prompt text
            "parts": [{
                "type": "text",  # Content type (text)
                "content": prompt  # Content body
            }]
        }],
        "agent_name": agent_name  # Target agent to call (outline, chapter, editor)
    }

    headers = {"Content-Type": "application/json"}  # Set JSON header

    try:
        response = requests.post(url, json=payload, headers=headers)  # Make POST request to ACP server
        response.raise_for_status()  # Raise error if HTTP response is not 200

        result = response.json()  # Parse response JSON

        # Check if ACP server returned an error
        if result.get('error'):
            return {"output": f"[ERROR] {result['error'].get('message', 'Unknown error')}"}

        # Extract and return the first content part from output
        outputs = result.get('output', [])
        if outputs:
            first_output = outputs[0]
            if 'parts' in first_output and first_output['parts']:
                first_part = first_output['parts'][0]
                if 'content' in first_part:
                    return {"output": str(first_part['content']).strip()}

        return {"output": "[ERROR] No valid content found."}  # Fallback if no valid output

    except Exception as e:
        return {"output": f"[ERROR] Exception during call: {e}"}  # Catch and report exceptions