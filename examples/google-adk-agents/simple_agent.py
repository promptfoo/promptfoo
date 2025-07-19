"""
Simple Weather Assistant using Google ADK
Demonstrates ADK best practices with a single agent and tool.
"""

import os
import asyncio
from typing import Dict, Any
from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google import genai
import random
from dotenv import load_dotenv

# Load environment variables from .env files
# First try local .env, then parent directory
load_dotenv()  # Load from current directory
load_dotenv('../../.env')  # Load from root directory


# Simple weather tool
def get_weather(location: str) -> Dict[str, Any]:
    """
    Get weather information for a location.
    
    Args:
        location: City name or location to get weather for
        
    Returns:
        Weather information including temperature and conditions
    """
    # Mock weather data for example
    conditions = ["sunny", "cloudy", "rainy", "partly cloudy", "windy"]
    temp = random.randint(60, 85)
    
    return {
        "location": location,
        "temperature": f"{temp}°F",
        "conditions": random.choice(conditions),
        "humidity": f"{random.randint(40, 80)}%",
        "wind": f"{random.randint(5, 20)} mph"
    }


# Create the weather assistant agent
weather_agent = Agent(
    name="weather_assistant",
    model="gemini-2.5-flash",  # Using latest Gemini 2.5 model
    instruction="""You are a helpful weather assistant. 
    
    When users ask about weather:
    1. Use the get_weather tool to fetch current conditions
    2. Present the information in a friendly, conversational way
    3. Add helpful context (e.g., "perfect day for a walk" or "don't forget an umbrella")
    
    For non-weather questions, politely explain you're a weather specialist and suggest they ask about weather instead.""",
    tools=[FunctionTool(get_weather)]
)


class WeatherAssistant:
    """Simple wrapper for the weather agent"""
    
    def __init__(self):
        self.agent = weather_agent
        self.session_service = InMemorySessionService()
        self.app_name = "weather_assistant_app"
        self.user_id = "default_user"
        self.session_id = "default_session"
        
        # Create session synchronously
        asyncio.run(self._create_session())
        
        self.runner = Runner(
            agent=weather_agent,
            app_name=self.app_name,
            session_service=self.session_service
        )
    
    async def _create_session(self):
        """Create the session asynchronously"""
        await self.session_service.create_session(
            app_name=self.app_name,
            user_id=self.user_id,
            session_id=self.session_id
        )
        
    async def process_message_async(self, message: str) -> Dict[str, Any]:
        """
        Process a user message and return response with metadata.
        
        Args:
            message: User's input message
            
        Returns:
            Dict with response and metadata
        """
        try:
            # Create a Content object for the message
            content = genai.types.Content(
                role="user",
                parts=[genai.types.Part(text=message)]
            )
            
            # Run the agent asynchronously
            final_response = None
            async for event in self.runner.run_async(
                user_id=self.user_id,
                session_id=self.session_id,
                new_message=content
            ):
                # Get the final response
                if hasattr(event, 'content') and event.content:
                    if hasattr(event.content, 'parts') and event.content.parts:
                        for part in event.content.parts:
                            if hasattr(part, 'text'):
                                final_response = part.text
            
            response_text = final_response or "I couldn't generate a response."
            
            return {
                "success": True,
                "response": response_text,
                "metadata": {
                    "agent": "weather_assistant",
                    "model": "gemini-2.5-flash"
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "response": f"I encountered an error: {str(e)}. Please try again.",
                "error": str(e),
                "metadata": {
                    "agent": "weather_assistant",
                    "error_type": type(e).__name__
                }
            }
    
    def process_message(self, message: str) -> Dict[str, Any]:
        """Synchronous wrapper for process_message_async"""
        return asyncio.run(self.process_message_async(message))


# Example usage
if __name__ == "__main__":
    # Check if API key is available
    if not os.getenv('GOOGLE_API_KEY'):
        print("⚠️  Warning: GOOGLE_API_KEY not found in environment variables")
        print("Please set it in .env file or as an environment variable")
        print("Example: export GOOGLE_API_KEY=your-api-key-here")
        exit(1)
    
    assistant = WeatherAssistant()
    
    # Test queries
    test_queries = [
        "What's the weather in San Francisco?",
        "Is it raining in New York?",
        "Tell me about the weather in London",
        "What's 2 + 2?"  # Non-weather query
    ]
    
    print("Testing Weather Assistant\n" + "="*50)
    
    for query in test_queries:
        print(f"\nUser: {query}")
        result = assistant.process_message(query)
        print(f"Assistant: {result['response']}")
        if result['metadata'].get('tools_used'):
            print(f"Tools used: {result['metadata']['tools_used']}") 