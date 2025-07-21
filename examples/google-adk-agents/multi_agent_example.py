"""
Party Planning Multi-Agent System using Google ADK
Demonstrates collaboration between task planner, budget calculator, and coordinator.
"""

import os
import asyncio
from typing import Dict, Any, List
from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google import genai
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables from .env files
# First try local .env, then parent directory
load_dotenv()  # Load from current directory
load_dotenv('../../.env')  # Load from root directory


def get_or_create_event_loop():
    """Get the current event loop or create a new one if needed."""
    try:
        loop = asyncio.get_running_loop()
        return loop, False  # loop exists, don't close it
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop, True  # we created it, we should close it


# Task planning tool
def create_task_list(event_type: str, budget: float, guest_count: int) -> List[Dict[str, Any]]:
    """Create a task list for party planning."""
    base_tasks = [
        {"task": "Set date and time", "priority": "high", "estimated_hours": 0.5},
        {"task": "Create guest list", "priority": "high", "estimated_hours": 1.0},
        {"task": "Find venue", "priority": "high", "estimated_hours": 3.0},
        {"task": "Plan menu", "priority": "high", "estimated_hours": 2.0},
        {"task": "Send invitations", "priority": "medium", "estimated_hours": 1.5},
        {"task": "Arrange decorations", "priority": "medium", "estimated_hours": 2.0},
    ]
    
    # Add specific tasks based on event type
    if "birthday" in event_type.lower():
        base_tasks.append({"task": "Order birthday cake", "priority": "high", "estimated_hours": 0.5})
        base_tasks.append({"task": "Plan party games", "priority": "medium", "estimated_hours": 1.0})
    elif "wedding" in event_type.lower():
        base_tasks.append({"task": "Hire photographer", "priority": "high", "estimated_hours": 2.0})
        base_tasks.append({"task": "Arrange flowers", "priority": "high", "estimated_hours": 1.5})
    
    # Add budget-specific recommendations
    if budget < 500:
        base_tasks.append({"task": "Find DIY decoration ideas", "priority": "medium", "estimated_hours": 1.0})
    else:
        base_tasks.append({"task": "Hire catering service", "priority": "medium", "estimated_hours": 1.0})
    
    return base_tasks


# Budget calculation tool
def calculate_party_budget(guests: int) -> Dict[str, Any]:
    """Calculate basic party budget breakdown."""
    cost_per_person = 25.0  # Default cost per person
    food_cost = guests * cost_per_person
    decorations = guests * 5  # $5 per person for decorations
    venue = 200 if guests < 30 else 500
    misc = guests * 3
    
    total = food_cost + decorations + venue + misc
    
    return {
        "total_budget": total,
        "breakdown": {
            "food": food_cost,
            "decorations": decorations,
            "venue": venue,
            "miscellaneous": misc
        },
        "per_person": total / guests
    }


def create_agents(model_name: str = "gemini-2.0-flash") -> Dict[str, Agent]:
    """Create agents with the specified model."""
    
    # Task planner agent
    task_planner = Agent(
        name="task_planner",
        model=model_name,
        instruction="""You are a professional party planning specialist. Your role is to:
    1. Break down party planning into organized tasks using the create_task_list tool
    2. Provide time estimates and priorities for each task
    3. Suggest creative ideas based on the event type and budget
    4. Consider guest count when making recommendations
    
    Always be enthusiastic and creative in your planning!""",
        tools=[FunctionTool(create_task_list)]
    )

    # Budget calculator agent
    budget_calculator = Agent(
        name="budget_calculator",
        model=model_name,
        instruction="""You are a party budget specialist. Your role is to:
    1. Use the calculate_party_budget tool to provide budget estimates
    2. Suggest ways to save money or allocate budget effectively
    3. Provide detailed breakdowns of costs
    4. Help adjust plans based on budget constraints
    
    Always be practical and provide clear financial advice.""",
        tools=[FunctionTool(calculate_party_budget)]
    )

    # Coordinator agent
    coordinator = Agent(
        name="party_coordinator",
        model=model_name,
        instruction="""You are the head party planning coordinator. Your role is to:
    1. Understand the user's party planning needs
    2. Delegate to specialists:
       - Use task_planner for creating organized task lists and timelines
       - Use budget_calculator for financial planning and cost breakdowns
    3. Suggest venue ideas and party themes based on your knowledge
    4. Combine information from all sources into comprehensive party plans
    
    Always be helpful, organized, and ensure all aspects of the party are covered.
    When users ask about planning a party, gather key details (type, budget, guests) then coordinate with your team.""",
        sub_agents=[task_planner, budget_calculator]
    )
    
    return {
        'task_planner': task_planner,
        'budget_calculator': budget_calculator,
        'coordinator': coordinator
    }


class PartyPlanningSystem:
    """Wrapper for the party planning multi-agent system"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """Initialize with optional configuration."""
        self.config = config or {}
        model_name = self.config.get('model', 'gemini-2.0-flash')
        
        # Create agents with specified model
        self.agents = create_agents(model_name)
        self.coordinator = self.agents['coordinator']
        
        self.session_service = InMemorySessionService()
        self.app_name = "party_planning_app"
        self.user_id = "default_user"
        self.session_id = "default_session"
        self._session_created = False
        
        self.runner = Runner(
            agent=self.coordinator,
            app_name=self.app_name,
            session_service=self.session_service
        )
    
    async def _ensure_session(self):
        """Ensure the session is created"""
        if not self._session_created:
            await self.session_service.create_session(
                app_name=self.app_name,
                user_id=self.user_id,
                session_id=self.session_id
            )
            self._session_created = True
        
    async def process_message_async(self, message: str) -> Dict[str, Any]:
        """Process a party planning request through the multi-agent system."""
        try:
            # Ensure session is created
            await self._ensure_session()
            
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
                    "agents_used": ["party_coordinator"],
                    "model": self.config.get('model', 'gemini-2.0-flash')
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "response": f"I encountered an error planning your party: {str(e)}",
                "error": str(e),
                "metadata": {
                    "agents_used": ["party_coordinator"],
                    "error_type": type(e).__name__
                }
            }
    
    def process_message(self, message: str) -> Dict[str, Any]:
        """Synchronous wrapper for process_message_async"""
        loop, should_close = get_or_create_event_loop()
        try:
            if not loop.is_running():
                return loop.run_until_complete(self.process_message_async(message))
            else:
                # If called from async context, return a coroutine
                return self.process_message_async(message)
        finally:
            if should_close:
                loop.close()


# Example usage
if __name__ == "__main__":
    # Check if API key is available
    if not os.getenv('GOOGLE_API_KEY'):
        print("⚠️  Warning: GOOGLE_API_KEY not found in environment variables")
        print("Please set it in .env file or as an environment variable")
        print("Example: export GOOGLE_API_KEY=your-api-key-here")
        exit(1)
    
    # Example configuration
    example_config = {
        "model": "gemini-2.0-flash"  # Can be changed to gemini-2.0-pro, etc.
    }
    
    system = PartyPlanningSystem(example_config)
    
    # Test queries
    test_queries = [
        "I want to plan a birthday party for 20 people with a $500 budget",
        "Create a budget breakdown for a wedding reception with 100 guests",
        "Suggest outdoor party venues in San Francisco",
        "Generate a timeline for planning a corporate event in 2 weeks",
        "Calculate how much food I need for 30 people at a BBQ party"
    ]
    
    print("Testing Party Planning Multi-Agent System\n" + "="*50)
    
    # Get event loop for running async code
    loop, should_close = get_or_create_event_loop()
    
    try:
        for query in test_queries:
            print(f"\nUser: {query}")
            if loop.is_running():
                # If already in async context
                result = asyncio.create_task(system.process_message_async(query))
            else:
                result = loop.run_until_complete(system.process_message_async(query))
            
            if asyncio.iscoroutine(result):
                result = loop.run_until_complete(result)
                
            print(f"\nCoordinator: {result['response'][:500]}...")  # Truncate long responses
            if result['metadata'].get('agents_used'):
                print(f"Agents involved: {', '.join(result['metadata']['agents_used'])}")
            if result['metadata'].get('tools_used'):
                print(f"Tools used: {', '.join(result['metadata']['tools_used'])}") 
    finally:
        if should_close:
            loop.close() 