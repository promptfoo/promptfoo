"""
Promptfoo provider for Google ADK examples.
Supports both single agent (weather) and multi-agent (party planning) examples.
"""

import os
import sys
from typing import Dict, Any, Optional

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simple_agent import WeatherAssistant
from multi_agent_example import PartyPlanningSystem


# Initialize both systems
weather_assistant = WeatherAssistant()
party_planning_system = PartyPlanningSystem()


async def call_provider(prompt: str, options: Optional[Dict[str, Any]] = None, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The user's input message
        options: Provider options including which system to use
        context: Additional context from promptfoo
        
    Returns:
        Dict with output and metadata for assertions
    """
    try:
        # Get the system to use from context vars (default to single agent)
        vars = context.get('vars', {}) if context else {}
        system_type = vars.get('system', 'single')
        
        # Route to appropriate system
        if system_type == 'multi':
            # Use the party planning multi-agent system
            result = await party_planning_system.process_message_async(prompt)
        else:
            # Use the simple weather assistant
            result = await weather_assistant.process_message_async(prompt)
        
        # Format response for promptfoo
        output = result['response']
        
        # Add metadata for assertions
        metadata = result.get('metadata', {})
        
        return {
            'output': output,
            'metadata': metadata,
            'success': result.get('success', True)
        }
        
    except Exception as e:
        return {
            'output': f'Error: {str(e)}',
            'metadata': {'error': str(e)},
            'success': False
        }