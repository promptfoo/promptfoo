"""Base class for Gemini-powered agents."""

import os
import google.generativeai as genai
from typing import Dict, Any, List, Optional


class GeminiAgent:
    """Base class for agents using Gemini models."""
    
    def __init__(self, 
                 name: str,
                 model_name: str = "gemini-2.5-pro",
                 instructions: str = "",
                 **kwargs):
        self.name = name
        self.model_name = model_name
        self.instructions = instructions
        
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
        """Run the agent with a prompt and optional images."""
        try:
            # Prepare content
            content = [prompt]
            if images:
                content.extend(images)
            
            # Generate response
            response = await self.model.generate_content_async(content)
            return response.text
        except Exception as e:
            print(f"Error in {self.name}: {e}")
            raise
    
    def __call__(self, *args, **kwargs):
        """Make the agent callable."""
        return self.run(*args, **kwargs)