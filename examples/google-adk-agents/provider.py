"""
Promptfoo provider for Google ADK multi-agent example.
"""

import os
import sys
from typing import Dict, Any

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from multi_agent_example import PartyPlanningSystem


# Initialize the party planning system with empty config (will be configured per request)
party_planning_system = None


def get_or_create_system(config: Dict[str, Any]):
    """Get or create a party planning system with the given configuration."""
    global party_planning_system
    
    # For now, recreate the system with new config each time
    # In production, you might want to cache based on config
    party_planning_system = PartyPlanningSystem(config)
    return party_planning_system


async def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The user's input message
        options: Provider options including configuration
        context: Additional context from promptfoo
        
    Returns:
        Dict with output
    """
    try:
        # Extract configuration from options
        config = options.get('config', {})
        
        # Get or create system with configuration
        system = get_or_create_system(config)
        
        # Process the message through the party planning system
        result = await system.process_message_async(prompt)
        
        # Return just the output
        return {
            'output': result['response']
        }
        
    except Exception as e:
        return {
            'output': f'Error: {str(e)}'
        }