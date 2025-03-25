#!/usr/bin/env python3
"""
Example script demonstrating how to use the promptfoo schema types.

This script shows a simplified way to create a promptfoo configuration using
basic Pydantic models that are compatible with both Pydantic v1 and v2.
"""

import json
from enum import Enum
from typing import Any, Dict, List, Optional, Union

try:
    # Try to import Pydantic v2 classes
    from pydantic import BaseModel
    PYDANTIC_V2 = True
except ImportError:
    # Fall back to Pydantic v1
    from pydantic import BaseModel
    PYDANTIC_V2 = False

# Define core types for promptfoo configuration
class AssertionMethodEnum(str, Enum):
    """
    Enum of assertion methods that can be used in test cases.
    This is a simplified version of the auto-generated AssertionMethodEnum.
    """
    CONTAINS = "contains"
    SIMILAR = "similar"
    PYTHON = "python"
    EQUALS = "equals"

class AssertionItem(BaseModel):
    """
    An individual assertion to validate LLM output.
    This is a simplified version of the auto-generated AssertionItem.
    """
    type: AssertionMethodEnum
    value: Any
    threshold: Optional[float] = None

class TestCase(BaseModel):
    """
    Configuration for an individual test case.
    This is a simplified version of the auto-generated TestCaseConfig.
    """
    description: str
    vars: Dict[str, Any]
    assert_: List[AssertionItem]  # Using assert_ to avoid Python keyword conflict

    class Config:
        # Handle the "assert" field correctly in serialization
        fields = {"assert_": "assert"}

def create_basic_config():
    """Create a basic promptfoo configuration using simplified schema types."""
    # Create test cases with assertions
    test_case = TestCase(
        description="Basic AI test",
        vars={"topic": "artificial intelligence"},
        assert_=[
            AssertionItem(
                type=AssertionMethodEnum.CONTAINS, 
                value="AI is a field of computer science"
            ),
            AssertionItem(
                type=AssertionMethodEnum.SIMILAR,
                value="Artificial intelligence involves creating intelligent systems",
                threshold=0.7
            )
        ]
    )

    # Create the complete config
    config = {
        "description": "Example configuration using Python types",
        "prompts": ["Tell me about {{topic}}"],
        "tests": [
            # Serialize the test case to dictionary
            test_case.dict(exclude_none=True, by_alias=True) 
            if hasattr(test_case, "dict") 
            else test_case.model_dump(exclude_none=True, by_alias=True)
        ]
    }

    return config

def main():
    """Main function to demonstrate the schema usage."""
    # Create a configuration
    config = create_basic_config()

    # Print the configuration as JSON
    print(json.dumps(config, indent=2))

if __name__ == "__main__":
    main()
