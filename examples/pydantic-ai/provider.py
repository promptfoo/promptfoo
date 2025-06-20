"""
Promptfoo Python provider for PydanticAI agents.

This provider runs PydanticAI agents and returns structured outputs
for evaluation by promptfoo.
"""

import asyncio
import os
from typing import Dict, Any

# Load environment variables if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from agent import run_weather_agent

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Main provider function for PydanticAI weather agent."""
    try:
        config = options.get('config', {})
        model = config.get('model', 'openai:gpt-4o-mini')
        
        result = asyncio.run(run_weather_agent(prompt, model))
        
        # Convert result to dict if it's a Pydantic model
        if hasattr(result, 'model_dump'):
            output_dict = result.model_dump()
        else:
            output_dict = result

        return {
            'output': output_dict,
            'tokenUsage': {
                'total': 100,  # Mock token usage for demo
                'prompt': 50,
                'completion': 50
            },
            'metadata': {
                'model': model,
                'agent_type': 'pydantic_ai_weather'
            }
        }
        
    except Exception as e:
        return {
            'output': {
                'location': 'Unknown',
                'temperature': 'N/A',
                'description': f'Error: {str(e)}'
            },
            'tokenUsage': {'total': 0, 'prompt': 0, 'completion': 0}
        }

if __name__ == '__main__':
    # Test the provider directly
    print("Testing PydanticAI provider...")
    
    if not os.getenv('OPENAI_API_KEY'):
        print("Warning: OPENAI_API_KEY not set. Set it to test the provider.")
    else:
        test_result = call_api(
            "What's the weather like in London?",
            {'config': {'model': 'openai:gpt-4o-mini'}},
            {}
        )
        print(f"Test result: {test_result}")