"""
Promptfoo Python provider for PydanticAI agents.

This provider allows promptfoo to evaluate PydanticAI agents by:
1. Running the agent with the provided prompt
2. Extracting structured outputs and metadata
3. Handling different model configurations
"""

import asyncio
import os
from typing import Dict, Any

# Set up environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from agent import run_weather_agent, WeatherResponse

def load_env_vars():
    """Load environment variables from various sources."""
    # Try to load from .env file in parent directories
    for env_path in ['.env', '../.env', '../../.env']:
        if os.path.exists(env_path):
            try:
                with open(env_path, 'r') as f:
                    for line in f:
                        if '=' in line and not line.strip().startswith('#'):
                            key, value = line.strip().split('=', 1)
                            if key and not os.getenv(key):
                                os.environ[key] = value.strip('"\'')
            except Exception:
                pass

# Load environment variables on import
load_env_vars()

def get_model_from_config(options: Dict[str, Any]) -> str:
    """Extract model name from options with fallback."""
    config = options.get('config', {})
    model = config.get('model', 'openai:gpt-4.1-mini')

    # Handle different model configurations
    if config.get('variant') == 'helpful':
        return 'openai:gpt-4.1-mini'
    elif config.get('variant') == 'concise':
        return 'openai:gpt-4.1'

    return model

def estimate_token_usage(model: str, prompt: str, output_length: int) -> Dict[str, int]:
    """Estimate token usage based on model and content."""
    # Rough estimation - in production, use actual token counting
    prompt_tokens = len(prompt.split()) * 1.3  # Approximate token count
    completion_tokens = output_length * 0.8

    # Different models have different token costs
    if 'gpt-4.1' in model:
        total = int(prompt_tokens + completion_tokens)
        return {'total': total, 'prompt': int(prompt_tokens), 'completion': int(completion_tokens)}
    else:
        # Default estimation
        total = int(prompt_tokens + completion_tokens)
        return {'total': total, 'prompt': int(prompt_tokens), 'completion': int(completion_tokens)}

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Main provider function for PydanticAI weather agent."""
    try:
        model = get_model_from_config(options)
        result = asyncio.run(run_weather_agent(prompt, model))

        # Convert result to dict if it's a Pydantic model
        if hasattr(result, 'model_dump'):
            output_dict = result.model_dump()
        else:
            output_dict = result

        # Estimate token usage
        output_str = str(output_dict)
        token_usage = estimate_token_usage(model, prompt, len(output_str))

        return {
            'output': output_dict,
            'tokenUsage': token_usage,
            'metadata': {
                'model': model,
                'agent_type': 'pydantic_ai_weather',
                'has_error': bool(output_dict.get('error')),
                'response_time': None  # Could be tracked with timing
            }
        }
    except Exception as e:
        # Graceful error handling
        error_output = {
            'location': 'Unknown',
            'temperature': 'N/A',
            'description': 'Service temporarily unavailable',
            'error': f'Provider error: {str(e)}'
        }
        return {
            'output': error_output,
            'tokenUsage': {'total': 0, 'prompt': 0, 'completion': 0},
            'metadata': {
                'model': get_model_from_config(options),
                'agent_type': 'pydantic_ai_weather',
                'has_error': True,
                'error_type': type(e).__name__
            }
        }

def call_api_with_gpt41(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Provider function specifically for GPT-4.1."""
    # Override model in options
    options_copy = options.copy()
    if 'config' not in options_copy:
        options_copy['config'] = {}
    options_copy['config']['model'] = 'openai:gpt-4.1'

    return call_api(prompt, options_copy, context)

def call_api_with_claude(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Provider function for Claude 3.5 Sonnet."""
    options_copy = options.copy()
    if 'config' not in options_copy:
        options_copy['config'] = {}
    options_copy['config']['model'] = 'anthropic:claude-3-5-sonnet-latest'

    return call_api(prompt, options_copy, context)

# Additional utility functions for advanced usage
def validate_environment():
    """Validate that required environment variables are set."""
    required_vars = ['OPENAI_API_KEY']
    optional_vars = ['ANTHROPIC_API_KEY', 'WEATHER_API_KEY', 'GEO_API_KEY']

    missing_required = [var for var in required_vars if not os.getenv(var)]
    available_optional = [var for var in optional_vars if os.getenv(var)]

    return {
        'ready': len(missing_required) == 0,
        'missing_required': missing_required,
        'available_optional': available_optional
    }

if __name__ == '__main__':
    # Test the provider directly
    print("Testing PydanticAI provider...")

    # Check environment
    env_status = validate_environment()
    print(f"Environment status: {env_status}")

    if env_status['ready']:
        # Test basic functionality
        test_result = call_api(
            "What's the weather like in London?",
            {'config': {'model': 'openai:gpt-4.1-mini'}},
            {}
        )
        print(f"Test result: {test_result}")
    else:
        print("Missing required environment variables. Please set OPENAI_API_KEY.")