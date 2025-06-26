"""
Custom Python provider demonstrating variable access in simulated-user conversations.

This provider shows how to access test-level variables like workflow_id and session_id
that are passed through the context parameter during multi-turn conversations.
"""

import json
import random
import time


def call_api(prompt, options, context):
    """
    Custom provider that demonstrates accessing test variables.
    
    Args:
        prompt: The conversation messages as JSON string
        options: Provider configuration options
        context: Test context including vars, prompt info, etc.
    
    Returns:
        Dict with output and optional metadata
    """
    
    # Access test variables from context - these are now properly passed through!
    vars_dict = context.get('vars', {})
    workflow_id = vars_dict.get('workflow_id', 'unknown')
    session_id = vars_dict.get('session_id', 'unknown')
    user_name = vars_dict.get('user_name', 'Customer')
    
    # Parse the conversation messages
    try:
        messages = json.loads(prompt)
        last_user_message = None
        for msg in reversed(messages):
            if msg.get('role') == 'user':
                last_user_message = msg.get('content', '').lower()
                break
    except (json.JSONDecodeError, AttributeError):
        last_user_message = str(prompt).lower()
    
    # Simulate some processing time
    time.sleep(0.1)
    
    # Generate contextual responses based on user input and variables
    if 'hello' in last_user_message or 'help' in last_user_message:
        response = f"Hello {user_name}! I'm here to help you. Your session ID is {session_id} and I've assigned workflow {workflow_id} to track our conversation."
    
    elif 'workflow' in last_user_message or 'status' in last_user_message:
        statuses = ['in progress', 'pending review', 'ready for action', 'awaiting approval']
        status = random.choice(statuses)
        response = f"Your workflow {workflow_id} is currently {status}. Session {session_id} remains active."
    
    elif 'session' in last_user_message:
        response = f"Your current session ID is {session_id}. This session is linked to workflow {workflow_id}."
    
    elif 'book' in last_user_message or 'reservation' in last_user_message:
        response = f"I'll help you with your booking, {user_name}. I'm processing this request under workflow {workflow_id}. Let me check what's available..."
    
    elif 'thanks' in last_user_message or 'thank you' in last_user_message:
        response = f"You're welcome, {user_name}! Workflow {workflow_id} has been completed successfully. Session {session_id} will remain active for any follow-up questions."
    
    elif 'goodbye' in last_user_message or 'bye' in last_user_message:
        response = f"Goodbye, {user_name}! Workflow {workflow_id} is complete. Have a great day! ###STOP###"
    
    else:
        responses = [
            f"I understand, {user_name}. Let me process that for workflow {workflow_id}.",
            f"Got it! I'm handling this through session {session_id}.",
            f"Thanks for that information. Workflow {workflow_id} is being updated.",
            f"I'm working on your request now, {user_name}. Session {session_id} is active."
        ]
        response = random.choice(responses)
    
    # Calculate simple token usage for demonstration
    prompt_tokens = len(str(prompt).split())
    completion_tokens = len(response.split())
    total_tokens = prompt_tokens + completion_tokens
    
    return {
        "output": response,
        "tokenUsage": {
            "total": total_tokens,
            "prompt": prompt_tokens,
            "completion": completion_tokens
        },
        "metadata": {
            "workflow_id": workflow_id,
            "session_id": session_id,
            "user_name": user_name
        }
    }


if __name__ == "__main__":
    # Test the provider standalone
    import sys
    
    if len(sys.argv) >= 4:
        prompt = sys.argv[1]
        options = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        context = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        
        result = call_api(prompt, options, context)
        print(json.dumps(result, indent=2))
    else:
        # Demo with sample data
        sample_context = {
            "vars": {
                "workflow_id": "wf-demo-123",
                "session_id": "sess-demo-456",
                "user_name": "Alex"
            }
        }
        
        result = call_api("Hello, I need help", {}, sample_context)
        print("Demo result:")
        print(json.dumps(result, indent=2)) 