"""
Python Provider Example with Session Management

This provider demonstrates how to access session metadata
from hooks in a Python provider.
"""

import json
import os
from typing import Dict, Any, Optional
import urllib.request
import urllib.error


def call_api(
    prompt: str,
    options: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Python provider that uses session metadata from hooks.
    
    Args:
        prompt: The input prompt
        options: Provider options
        context: Context object containing metadata from hooks
        
    Returns:
        Provider response with output or error
    """
    # Access session metadata set by the beforeAll hook
    metadata = context.get('metadata', {}) if context else {}
    session_id = metadata.get('sessionId')
    server_url = metadata.get('serverUrl', 'http://localhost:8000')
    
    if not session_id:
        return {
            'error': 'No session ID found in metadata. Make sure the beforeAll hook is running.'
        }
    
    print(f"📤 [Python] Making request with session: {session_id}")
    
    try:
        # Make a request using the session ID
        url = f"{server_url}/echo"
        req = urllib.request.Request(
            url, 
            method='POST',
            headers={ 'Content-Type': 'application/json', 'x-session-id': session_id },
            data=json.dumps({ 'prompt': prompt }).encode('utf-8'))
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return { 'output': data.get('output') }
            
    except urllib.error.HTTPError as e:
        return {'error': f"Session request failed: {e.code} {e.reason}"}
    except Exception as e:
        return {'error': f"Failed to call API: {str(e)}"}

