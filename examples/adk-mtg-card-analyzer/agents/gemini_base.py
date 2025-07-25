"""Base class for Gemini-powered agents with token tracking."""

import os
import google.generativeai as genai
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class TokenUsage:
    """Track token usage and costs for a single request."""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    prompt_cost: float = 0.0
    completion_cost: float = 0.0
    total_cost: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)


class TokenTracker:
    """Track cumulative token usage across all requests."""
    
    # Gemini 2.5 Pro pricing (per million tokens)
    PRICING = {
        "standard": {  # Up to 200K tokens
            "input": 1.25,   # $1.25 per million input tokens
            "output": 10.0   # $10.00 per million output tokens
        },
        "long_context": {  # 200K+ tokens
            "input": 2.50,   # $2.50 per million input tokens
            "output": 15.0   # $15.00 per million output tokens
        }
    }
    
    def __init__(self):
        self.requests: List[TokenUsage] = []
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0
        self.total_tokens = 0
        self.total_cost = 0.0
    
    def add_usage(self, prompt_tokens: int, completion_tokens: int) -> TokenUsage:
        """Add token usage for a request and calculate cost."""
        # Determine pricing tier based on total tokens
        total = prompt_tokens + completion_tokens
        pricing = self.PRICING["long_context" if total > 200000 else "standard"]
        
        # Calculate costs (convert from per million to actual cost)
        prompt_cost = (prompt_tokens / 1_000_000) * pricing["input"]
        completion_cost = (completion_tokens / 1_000_000) * pricing["output"]
        total_cost = prompt_cost + completion_cost
        
        # Create usage record
        usage = TokenUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total,
            prompt_cost=prompt_cost,
            completion_cost=completion_cost,
            total_cost=total_cost
        )
        
        # Update totals
        self.requests.append(usage)
        self.total_prompt_tokens += prompt_tokens
        self.total_completion_tokens += completion_tokens
        self.total_tokens += total
        self.total_cost += total_cost
        
        return usage
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of token usage and costs."""
        return {
            "total_requests": len(self.requests),
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_completion_tokens": self.total_completion_tokens,
            "total_tokens": self.total_tokens,
            "total_cost_usd": round(self.total_cost, 4),
            "average_tokens_per_request": round(self.total_tokens / len(self.requests), 2) if self.requests else 0,
            "average_cost_per_request": round(self.total_cost / len(self.requests), 4) if self.requests else 0,
            "breakdown_by_agent": {}
        }


# Global token tracker shared across all agents
_global_token_tracker = TokenTracker()


class GeminiAgent:
    """Base class for agents using Gemini models with token tracking."""
    
    def __init__(self, 
                 name: str,
                 model_name: str = "gemini-2.5-pro",
                 instructions: str = "",
                 track_tokens: bool = True,
                 **kwargs):
        self.name = name
        self.model_name = model_name
        self.instructions = instructions
        self.track_tokens = track_tokens
        self.agent_token_usage = TokenTracker()  # Per-agent tracking
        
        # Configure Gemini
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set")
        
        genai.configure(api_key=api_key)
        
        # Initialize the model
        self.model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=instructions
        )
    
    async def run(self, prompt: str, images: Optional[List[Any]] = None) -> str:
        """Run the agent with a prompt and optional images, tracking token usage."""
        try:
            # Prepare content
            content = [prompt]
            if images:
                content.extend(images)
            
            # Generate response
            response = await self.model.generate_content_async(content)
            
            # Track token usage if available
            if self.track_tokens and hasattr(response, 'usage_metadata'):
                usage_metadata = response.usage_metadata
                prompt_tokens = getattr(usage_metadata, 'prompt_token_count', 0)
                completion_tokens = getattr(usage_metadata, 'candidates_token_count', 0)
                
                # Add to both agent and global trackers
                usage = self.agent_token_usage.add_usage(prompt_tokens, completion_tokens)
                _global_token_tracker.add_usage(prompt_tokens, completion_tokens)
                
                print(f"[{self.name}] Tokens used - Prompt: {prompt_tokens}, Completion: {completion_tokens}, Cost: ${usage.total_cost:.4f}")
            
            return response.text
        except Exception as e:
            print(f"Error in {self.name}: {e}")
            raise
    
    def get_token_usage(self) -> Dict[str, Any]:
        """Get token usage for this agent."""
        return self.agent_token_usage.get_summary()
    
    @staticmethod
    def get_global_token_usage() -> Dict[str, Any]:
        """Get global token usage across all agents."""
        # Add per-agent breakdown
        summary = _global_token_tracker.get_summary()
        return summary
    
    @staticmethod
    def reset_global_token_tracking():
        """Reset global token tracking."""
        global _global_token_tracker
        _global_token_tracker = TokenTracker()
    
    def __call__(self, *args, **kwargs):
        """Make the agent callable."""
        return self.run(*args, **kwargs)