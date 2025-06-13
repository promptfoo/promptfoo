"""
Promptfoo Python provider for PydanticAI agents.

This provider allows promptfoo to evaluate PydanticAI agents by:
1. Running the agent with the provided prompt
2. Extracting structured outputs and metadata
3. Handling different model configurations
"""

import asyncio
import json
import os
from typing import Dict, Any
from agent import run_weather_agent, WeatherResponse


def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous wrapper for the PydanticAI agent.
    
    Args:
        prompt: The user's weather query
        options: Configuration options from promptfooconfig.yaml
        context: Test context including variables
        
    Returns:
        Dict with output, metadata, and token usage info
    """
    # Get model from options config, default to gpt-4o-mini
    config = options.get('config', {})
    model = config.get('model', 'openai:gpt-4o-mini')
    
    # Ensure environment variables are set
    if not os.getenv('OPENAI_API_KEY'):
        # Try to find the API key from the promptfoo .env file
        env_file = '../../.env'
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip().strip('"\'')
                        os.environ['OPENAI_API_KEY'] = key
                        break
    
    # Run the async agent
    try:
        result = asyncio.run(run_weather_agent(prompt, model))
        
        # Convert Pydantic model to dict for JSON serialization
        output_dict = result.model_dump()
        
        return {
            "output": output_dict,
            "metadata": {
                "model": model,
                "agent_type": "pydantic_ai_weather",
                "has_error": output_dict.get("error") is not None,
                "location_detected": output_dict.get("location", "Unknown") != "Unknown",
                "temperature_provided": output_dict.get("temperature", "N/A") != "N/A"
            },
            # Note: PydanticAI doesn't expose token usage by default
            # This would need to be implemented based on the underlying model
            "tokenUsage": {
                "total": None,
                "prompt": None, 
                "completion": None
            }
        }
        
    except Exception as e:
        error_output = {
            "location": "Unknown",
            "temperature": "N/A", 
            "description": "Error occurred",
            "error": str(e)
        }
        return {
            "output": error_output,
            "metadata": {
                "model": model,
                "agent_type": "pydantic_ai_weather",
                "has_error": True,
                "error_message": str(e)
            },
            "tokenUsage": {
                "total": None,
                "prompt": None,
                "completion": None
            }
        }


async def async_call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Asynchronous version of the PydanticAI agent provider.
    
    Args:
        prompt: The user's weather query
        options: Configuration options from promptfooconfig.yaml
        context: Test context including variables
        
    Returns:
        Dict with output, metadata, and token usage info
    """
    config = options.get('config', {})
    model = config.get('model', 'openai:gpt-4o-mini')
    
    # Ensure environment variables are set
    if not os.getenv('OPENAI_API_KEY'):
        # Try to find the API key from the promptfoo .env file
        env_file = '../../.env'
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip().strip('"\'')
                        os.environ['OPENAI_API_KEY'] = key
                        break
    
    try:
        result = await run_weather_agent(prompt, model)
        output_dict = result.model_dump()
        
        return {
            "output": output_dict,
            "metadata": {
                "model": model,
                "agent_type": "pydantic_ai_weather",
                "has_error": output_dict.get("error") is not None,
                "location_detected": output_dict.get("location", "Unknown") != "Unknown",
                "temperature_provided": output_dict.get("temperature", "N/A") != "N/A"
            },
            "tokenUsage": {
                "total": None,
                "prompt": None,
                "completion": None
            }
        }
        
    except Exception as e:
        error_output = {
            "location": "Unknown",
            "temperature": "N/A",
            "description": "Error occurred", 
            "error": str(e)
        }
        return {
            "output": error_output,
            "metadata": {
                "model": model,
                "agent_type": "pydantic_ai_weather",
                "has_error": True,
                "error_message": str(e)
            },
            "tokenUsage": {
                "total": None,
                "prompt": None,
                "completion": None
            }
        }


def call_api_with_gpt4(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Provider variant that uses GPT-4 model.
    """
    # Ensure environment variables are set
    if not os.getenv('OPENAI_API_KEY'):
        # Try to find the API key from the promptfoo .env file
        env_file = '../../.env'
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip().strip('"\'')
                        os.environ['OPENAI_API_KEY'] = key
                        break
    
    # Override model to GPT-4
    options_copy = options.copy()
    if 'config' not in options_copy:
        options_copy['config'] = {}
    options_copy['config']['model'] = 'openai:gpt-4o'
    
    return call_api(prompt, options_copy, context)


def call_api_with_claude(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Provider variant that uses Claude model.
    """
    # Ensure environment variables are set
    if not os.getenv('ANTHROPIC_API_KEY'):
        # Try to find the API key from the promptfoo .env file
        env_file = '../../.env'
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('ANTHROPIC_API_KEY='):
                        key = line.split('=', 1)[1].strip().strip('"\'')
                        os.environ['ANTHROPIC_API_KEY'] = key
                        break
    
    # Override model to Claude
    options_copy = options.copy()
    if 'config' not in options_copy:
        options_copy['config'] = {}
    options_copy['config']['model'] = 'anthropic:claude-3-5-sonnet-20241022'
    
    return call_api(prompt, options_copy, context)


if __name__ == "__main__":
    # Test the provider functions
    test_prompt = "What's the weather like in San Francisco?"
    test_options = {"config": {"model": "openai:gpt-4o-mini"}}
    test_context = {"vars": {}}
    
    print("Testing synchronous provider:")
    result = call_api(test_prompt, test_options, test_context)
    print(json.dumps(result, indent=2))
    
    print("\n" + "="*50)
    print("Testing GPT-4 variant:")
    result_gpt4 = call_api_with_gpt4(test_prompt, test_options, test_context)
    print(json.dumps(result_gpt4, indent=2)) 