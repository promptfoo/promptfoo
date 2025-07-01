"""
Enhanced ADK agent runner with session management and performance tracking.
Simplified to work with current ADK version.
"""

import os
import asyncio
from typing import Dict, Any, Optional, List
from google import adk
from google.genai import types
from google.adk.sessions import InMemorySessionService
from datetime import datetime
import json
import time

# Import our enhanced coordinator
from agents.coordinator import travel_coordinator

# Initialize services
session_service = InMemorySessionService()

# Performance monitoring
class PerformanceMonitor:
    """Track agent performance metrics"""
    
    def __init__(self):
        self.metrics = []
    
    def start_timing(self, operation: str) -> Dict:
        """Start timing an operation"""
        return {
            "operation": operation,
            "start_time": time.time(),
            "start_timestamp": datetime.now().isoformat()
        }
    
    def end_timing(self, timing: Dict) -> Dict:
        """End timing and record metrics"""
        timing["end_time"] = time.time()
        timing["duration"] = timing["end_time"] - timing["start_time"]
        timing["end_timestamp"] = datetime.now().isoformat()
        self.metrics.append(timing)
        return timing
    
    def get_summary(self) -> Dict:
        """Get performance summary"""
        if not self.metrics:
            return {"total_operations": 0}
        
        total_duration = sum(m["duration"] for m in self.metrics)
        return {
            "total_operations": len(self.metrics),
            "total_duration": total_duration,
            "average_duration": total_duration / len(self.metrics),
            "operations": [
                {
                    "name": m["operation"],
                    "duration": m["duration"],
                    "timestamp": m["start_timestamp"]
                }
                for m in self.metrics
            ]
        }

perf_monitor = PerformanceMonitor()

# Create enhanced runner
def create_runner():
    """Create ADK runner with basic configuration"""
    return adk.Runner(
        agent=travel_coordinator,
        session_service=session_service,
        app_name="travel-assistant-pro"
    )

# Session management with context preservation
class SessionManager:
    """Enhanced session management with context preservation"""
    
    def __init__(self, session_service):
        self.session_service = session_service
        self.active_sessions = {}
        self.context_store = {}  # Simple in-memory storage for context
    
    async def get_or_create_session(self, user_id: str, session_id: Optional[str] = None):
        """Get existing session or create new one with context"""
        
        # Try to get existing session
        if session_id and session_id in self.active_sessions:
            return self.active_sessions[session_id]
        
        # Create new session
        session = await self.session_service.create_session(
            app_name="travel-assistant-pro",
            user_id=user_id
        )
        
        # Store in active sessions
        self.active_sessions[session.id] = session
        
        return session
    
    def save_context(self, session_id: str, context_key: str, context_data: Any):
        """Save context data for a session"""
        if session_id not in self.context_store:
            self.context_store[session_id] = {}
        
        self.context_store[session_id][context_key] = {
            "data": context_data,
            "timestamp": datetime.now().isoformat()
        }
    
    def load_context(self, session_id: str, context_key: str) -> Optional[Any]:
        """Load saved context for a session"""
        if session_id in self.context_store and context_key in self.context_store[session_id]:
            return self.context_store[session_id][context_key]["data"]
        return None

# Initialize session manager
session_manager = SessionManager(session_service)

# Main execution function
async def execute_agent(
    prompt: str, 
    session_id: Optional[str] = None, 
    user_id: str = "default_user",
    save_context: bool = True,
    enable_caching: bool = True
) -> Dict[str, Any]:
    """
    Execute the travel planning agent.
    
    Args:
        prompt: The user's travel planning request
        session_id: Optional session ID for context continuity
        user_id: User identifier
        save_context: Whether to save conversation context
        enable_caching: Whether to use response caching
        
    Returns:
        Dict containing response and metadata
    """
    
    timing = perf_monitor.start_timing("agent_execution")
    
    try:
        # Get or create session
        session = await session_manager.get_or_create_session(user_id, session_id)
        
        # Load previous context if available
        previous_context = session_manager.load_context(session.id, "travel_plan") if save_context else None
        
        # Enhance prompt with context
        if previous_context:
            enhanced_prompt = f"Previous context: {json.dumps(previous_context)}\n\nNew request: {prompt}"
        else:
            enhanced_prompt = prompt
        
        # Check cache if enabled
        if enable_caching:
            cache_key = f"response:{hash(prompt) % 10000}"
            cached_response = session_manager.load_context(session.id, cache_key)
            if cached_response:
                perf_monitor.end_timing(timing)
                return {
                    "response": cached_response,
                    "session_id": session.id,
                    "status": "success",
                    "cached": True,
                    "performance": perf_monitor.get_summary()
                }
        
        # Create runner
        runner = create_runner()
        
        # Create user message
        content = types.Content(
            role='user',
            parts=[types.Part(text=enhanced_prompt)]
        )
        
        # Execute agent
        events = []
        response_parts = []
        
        async for event in runner.run_async(
            session_id=session.id,
            user_id=user_id,
            new_message=content
        ):
            events.append(event)
            
            # Collect response parts
            if hasattr(event, 'content') and event.content:
                if hasattr(event.content, 'parts'):
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            response_parts.append(part.text)
        
        # Get final response
        final_response = " ".join(response_parts) if response_parts else ""
        
        # Save context if enabled
        if save_context and final_response:
            # Save travel plan context
            if "itinerary" in final_response.lower() or "plan" in final_response.lower():
                session_manager.save_context(
                    session.id, 
                    "travel_plan",
                    {
                        "destination": extract_destination(prompt),
                        "dates": extract_dates(prompt),
                        "last_updated": datetime.now().isoformat()
                    }
                )
        
        # Cache the response if enabled
        if enable_caching and final_response:
            session_manager.save_context(session.id, cache_key, final_response)
        
        # End timing
        perf_monitor.end_timing(timing)
        
        return {
            "response": final_response,
            "session_id": session.id,
            "status": "success",
            "cached": False,
            "performance": perf_monitor.get_summary()
        }
        
    except Exception as e:
        perf_monitor.end_timing(timing)
        return {
            "response": f"I encountered an error: {str(e)}",
            "session_id": session_id,
            "status": "error",
            "error_type": type(e).__name__,
            "performance": perf_monitor.get_summary()
        }

# Helper functions for context extraction
def extract_destination(prompt: str) -> Optional[str]:
    """Extract destination from prompt"""
    # Simple extraction - in production, use NLP
    words = prompt.lower().split()
    for i, word in enumerate(words):
        if word in ["to", "visit", "explore"] and i + 1 < len(words):
            return words[i + 1].title()
    return None

def extract_dates(prompt: str) -> Optional[Dict]:
    """Extract dates from prompt"""
    # Simple extraction - in production, use date parser
    import re
    
    # Look for month names
    months = ["january", "february", "march", "april", "may", "june", 
              "july", "august", "september", "october", "november", "december"]
    
    dates = {}
    prompt_lower = prompt.lower()
    
    for month in months:
        if month in prompt_lower:
            dates["month"] = month.title()
            break
    
    # Look for day numbers
    day_match = re.search(r'\b(\d{1,2})\b', prompt)
    if day_match:
        dates["day"] = int(day_match.group(1))
    
    return dates if dates else None

# Simple health check for production use
async def health_check() -> Dict:
    """Perform health check on the agent system"""
    try:
        # Test basic agent execution
        test_result = await execute_agent("What's the weather in Paris?", enable_caching=False)
        
        health_status = {
            "status": "healthy" if test_result["status"] == "success" else "degraded",
            "timestamp": datetime.now().isoformat(),
            "services": {
                "session_service": "active" if session_service else "inactive",
                "agent": "active" if travel_coordinator else "inactive"
            },
            "performance": perf_monitor.get_summary()
        }
        
        return health_status
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        } 