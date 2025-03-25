---
sidebar_position: 2
sidebar_label: Types Reference
---

# Python Types Reference

promptfoo provides Python type definitions that match our JSON schema used for configuration. These types are useful for:

1. Writing strongly-typed custom assertion functions
2. Creating type-safe test generation scripts
3. Building integrations with promptfoo using Python
4. Validating configuration files

## Using the Types

The Python type definitions are included with promptfoo and can be imported using:

```python
from promptfoo.schemas import PromptfooConfigSchema, AssertionItem, AssertionMethodEnum
```

### Basic Example

Here's how to use the promptfoo types in a Python script:

```python
from promptfoo.schemas import PromptfooConfigSchema, AssertionItem, AssertionMethodEnum

# Define a test configuration with typed objects
config = PromptfooConfigSchema(
    prompts=["What is {{topic}}?"],
    tests=[{
        "description": "Test with Python types",
        "vars": {
            "topic": "artificial intelligence"
        },
        "assert": [
            AssertionItem(
                type=AssertionMethodEnum.contains,
                value="AI is a field of computer science"
            )
        ]
    }]
)

# Validate your configuration
print(config.model_dump())  # In Pydantic v2
# or
print(config.dict())  # In Pydantic v1
```

### Simplified Approach

If you encounter compatibility issues with different Pydantic versions, you can use this simpler approach:

```python
from enum import Enum
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Define an enum for assertion types
class Type(str, Enum):
    CONTAINS = "contains"
    SIMILAR = "similar"
    PYTHON = "python"

# Define models for configuration components
class AssertItem(BaseModel):
    type: Type
    value: Any
    threshold: Optional[float] = None

# Create a configuration dictionary
config = {
    "description": "Example configuration",
    "prompts": ["Tell me about {{topic}}"],
    "tests": [{
        "description": "Test case",
        "vars": {"topic": "AI"},
        "assert": [{
            "type": "contains",
            "value": "artificial intelligence"
        }]
    }]
}
```

## Key Type Definitions

### Key Schema Classes

The promptfoo Python types include many well-named classes for working with configurations:

#### Configuration Classes

- `PromptfooConfigSchema` - The main configuration schema
- `ProviderConfig` - Configuration for a provider
- `PromptConfig` - Configuration for a prompt

#### Assertion Classes

- `AssertionMethodEnum` - Enum of assertion methods (contains, equals, etc.)
- `GraderMethodEnum` - Enum of grader methods (select-best, human)
- `AssertionItem` - An individual assertion
- `AssertionSet` - A set of assertions grouped together
- `BasicAssertionItem` - Simple assertion items
- `ExtendedAssertionItem` - More complex assertion items with additional configuration

#### Test Configuration

- `TestOptionsConfig` - Options for test execution
- `TestCaseConfig` - Configuration for a test case
- `ProviderBaseLabel` - Basic provider configuration with label
- `ProviderFullConfig` - Complete provider configuration

### AssertionValueFunctionContext

When writing custom Python assertions, you have access to a context object with this structure:

```python
from typing import Any, Dict, List, Optional, TypedDict, Union

class AssertionValueFunctionContext(TypedDict):
    # Raw prompt sent to LLM
    prompt: Optional[str]

    # Test case variables
    vars: Dict[str, Union[str, object]]

    # The complete test case
    test: Dict[str, Any]  # Contains keys like "vars", "assert", "options"

    # Log probabilities from the LLM response, if available
    logProbs: Optional[List[float]]

    # Configuration passed to the assertion
    config: Optional[Dict[str, Any]]

    # The provider that generated the response
    provider: Optional[Any]  # ApiProvider type

    # The complete provider response
    providerResponse: Optional[Any]  # ProviderResponse type
```

### GradingResult

When returning complex grading results from assertion functions:

```python
from typing import Dict, List, Optional, TypedDict, Union

class GradingResult(TypedDict, total=False):
    pass_: bool  # Using pass_ since 'pass' is a reserved keyword
    score: float
    reason: str
    componentResults: Optional[List['GradingResult']]
    namedScores: Optional[Dict[str, float]]  # Appear as metrics in the UI
```

### Test Case

For generating test cases:

```python
from typing import Dict, List, Any, Optional, Union

class TestCase(TypedDict, total=False):
    description: str
    vars: Dict[str, Any]
    assert_: List[Dict[str, Any]]  # List of assertions
    threshold: Optional[float]
    metadata: Optional[Dict[str, Any]]
```

## Handling Python Keywords

When working with the promptfoo schema in Python, you'll need to handle reserved keywords like `assert`. There are two approaches:

1. Use alternative field names with trailing underscores: `assert_` instead of `assert`
2. Use dictionary access when working with raw dictionaries: `test_case["assert"]`

## Examples

### Custom Assertion Function

```python
from typing import Dict, Union, Any
from promptfoo.schemas import AssertionValueFunctionContext

def custom_assert(output: str, context: AssertionValueFunctionContext) -> Union[bool, float, Dict[str, Any]]:
    # Access test case variables
    topic = context["vars"].get("topic", "")

    # Simple content check
    if topic.lower() in output.lower():
        return {
            "pass_": True,
            "score": 0.9,
            "reason": f"Output contains the topic '{topic}'"
        }
    return {
        "pass_": False,
        "score": 0.0,
        "reason": f"Output does not mention the topic '{topic}'"
    }
```

### Test Case Generation

```python
from typing import List, Dict, Any
import csv

def generate_tests() -> List[Dict[str, Any]]:
    test_cases = []

    with open('test_data.csv', 'r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            test_case = {
                "description": f"Test for {row['topic']}",
                "vars": {
                    "topic": row["topic"],
                    "context": row["context"]
                },
                "assert": [{
                    "type": "contains",
                    "value": row["expected_text"]
                }]
            }
            test_cases.append(test_case)

    return test_cases
```

## Related Resources

- [Python Assertions Documentation](/docs/configuration/expected-outputs/python)
- [Test Generation with Python](/docs/configuration/parameters#import-from-python)
- [Prompt Functions with Python](/docs/configuration/parameters#prompt-functions)
