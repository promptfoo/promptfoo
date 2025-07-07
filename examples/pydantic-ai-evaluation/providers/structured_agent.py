"""
PydanticAI agent with structured outputs and type safety
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from typing import List, Optional
from pydantic import BaseModel, Field, validator
from pydantic_ai import Agent
from tracing_utils import create_traced_provider
import json

# Define structured output models
class PersonInfo(BaseModel):
    """Structured person information"""
    name: str = Field(description="Full name of the person")
    age: Optional[int] = Field(None, description="Age if mentioned")
    role: Optional[str] = Field(None, description="Job title or role")
    company: Optional[str] = Field(None, description="Company or organization")
    email: Optional[str] = Field(None, description="Email address")
    location: Optional[str] = Field(None, description="Location or city")
    
    @validator('age')
    def validate_age(cls, v):
        if v is not None and (v < 0 or v > 150):
            raise ValueError(f"Invalid age: {v}")
        return v

class Conferenceplan(BaseModel):
    """Structured conference planning output"""
    event_name: str
    attendee_count: int
    duration_days: int
    venue_requirements: dict = Field(description="Venue specs like capacity, facilities")
    budget_breakdown: dict = Field(description="Itemized budget")
    agenda: List[dict] = Field(description="Daily schedule")
    logistics: List[str] = Field(description="Key logistical considerations")

class DataPipeline(BaseModel):
    """Data pipeline specification"""
    source: dict = Field(description="Data source configuration")
    transformations: List[dict] = Field(description="Transform steps")
    destination: dict = Field(description="Target system config")
    monitoring: dict = Field(description="Monitoring and alerting setup")

# Agent for person info extraction
person_agent = Agent(
    model=os.getenv("PYDANTIC_MODEL", "openai:gpt-4o-mini"),
    result_type=PersonInfo,
    system_prompt="""Extract person information from text. 
    Be precise and only include information explicitly mentioned.
    Return structured data following the schema."""
)

# Agent for conference planning
conference_agent = Agent(
    model=os.getenv("PYDANTIC_MODEL", "openai:gpt-4o-mini"),
    result_type=Conferenceplan,
    system_prompt="""You are a conference planning expert.
    Create detailed, practical plans with realistic budgets and schedules.
    Ensure all required fields are populated with actionable information."""
)

# Agent for data pipeline design
pipeline_agent = Agent(
    model=os.getenv("PYDANTIC_MODEL", "openai:gpt-4o-mini"),
    result_type=DataPipeline,
    system_prompt="""You are a data engineering expert.
    Design robust data pipelines with proper error handling and monitoring.
    Include specific technologies and configurations."""
)

def structured_agent_provider(prompt, options, context):
    """Provider that returns structured outputs based on query type"""
    
    # Determine which agent to use based on prompt content
    prompt_lower = prompt.lower()
    
    try:
        if any(word in prompt_lower for word in ["person", "extract", "name", "email", "contact"]):
            # Use person extraction agent
            result = person_agent.run_sync(prompt)
            output = result.data.model_dump_json(indent=2)
            
        elif any(word in prompt_lower for word in ["conference", "event", "attendee", "venue"]):
            # Use conference planning agent
            result = conference_agent.run_sync(prompt)
            output = result.data.model_dump_json(indent=2)
            
        elif any(word in prompt_lower for word in ["pipeline", "data", "etl", "transform"]):
            # Use data pipeline agent
            result = pipeline_agent.run_sync(prompt)
            output = result.data.model_dump_json(indent=2)
            
        else:
            # Fallback to generic structured output
            generic_agent = Agent(
                model=os.getenv("PYDANTIC_MODEL", "openai:gpt-4o-mini"),
                result_type=dict,
                system_prompt="Provide a structured response to the query."
            )
            result = generic_agent.run_sync(prompt)
            output = json.dumps(result.data, indent=2)
        
        return {
            "output": output,
            "metadata": {
                "agent_type": type(result.data).__name__ if hasattr(result, 'data') else "dict",
                "model_used": os.getenv("PYDANTIC_MODEL", "openai:gpt-4o-mini")
            }
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "output": f"Error processing structured output: {str(e)}"
        }

# Export traced version
call_api = create_traced_provider(
    structured_agent_provider,
    service_name="pydantic-structured",
    provider_type="pydantic-ai"
) 