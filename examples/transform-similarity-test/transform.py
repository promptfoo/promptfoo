import re
import json

def get_transform(output, context):
    """Extract JSON content from XML-like tags and return a specific key's value.
    
    Args:
        output (str): The LLM output to transform
        context (dict): Contains prompt and vars information
    
    Returns:
        str: The extracted value or empty string if extraction fails
    """
    try:
        pattern = r"<json>(.*?)</json>"
        match = re.search(pattern, output, re.DOTALL)
        
        if not match:
            print(f"Warning: No JSON content found in tags for input: {context['vars'].get('input', '')}")
            return ""
            
        json_content = match.group(1).strip()
        data = json.loads(json_content)
        
        result = str(data.get("my_key", ""))
        if not result:
            print(f"Warning: 'my_key' not found in JSON for input: {context['vars'].get('input', '')}")
            
        return result
        
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON content: {e}")
        return ""
    except Exception as e:
        print(f"Error in transformation: {e}")
        return "" 