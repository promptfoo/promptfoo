#!/usr/bin/env python3
"""
Generate test cases for promptfoo echo provider example.
This script creates test cases with various patterns to demonstrate
promptfoo's testing capabilities at scale.
"""

import json
import random
from typing import Dict, List, Any

def generate_test_cases(num_cases: int = 1000) -> List[Dict[str, Any]]:
    """Generate test cases with various patterns."""
    test_cases = []
    
    # Categories of test inputs
    categories = [
        "greeting", "question", "command", "statement", 
        "calculation", "story", "technical", "creative"
    ]
    
    # Sample data for each category
    greetings = ["Hello", "Hi there", "Good morning", "Hey", "Greetings"]
    questions = ["What is your name?", "How are you?", "Where are you from?", "What time is it?", "Can you help me?"]
    commands = ["Tell me a joke", "Explain quantum physics", "Write a poem", "List prime numbers", "Describe the weather"]
    statements = ["The sky is blue", "Python is a programming language", "AI is transformative", "Data is valuable", "Testing is important"]
    calculations = ["2 + 2", "10 * 5", "100 / 4", "sqrt(16)", "factorial(5)"]
    story_prompts = ["Once upon a time", "In a galaxy far away", "The hero's journey began", "It was a dark night", "The adventure started"]
    technical_terms = ["API", "Database", "Algorithm", "Machine Learning", "Cloud Computing", "DevOps", "Microservices"]
    creative_prompts = ["Create a haiku about", "Write a sonnet on", "Compose a limerick about", "Draft a short story on", "Design a logo for"]
    
    # Assertion types to vary
    assertion_types = ["equals", "contains", "icontains", "regex", "javascript", "python", "is-json"]
    
    for i in range(num_cases):
        # Select a random category
        category = random.choice(categories)
        
        # Generate test case based on category
        test_case = {
            "description": f"Test case {i+1}: {category} test"
        }
        
        # Create vars based on category
        if category == "greeting":
            input_text = random.choice(greetings)
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "equals",
                    "value": input_text  # Echo provider should return exact input
                }
            ]
            
        elif category == "question":
            input_text = random.choice(questions)
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "contains",
                    "value": "?"  # Should contain question mark
                }
            ]
            
        elif category == "command":
            input_text = random.choice(commands)
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "icontains",  # Case-insensitive contains
                    "value": input_text.split()[0].lower()  # First word
                }
            ]
            
        elif category == "statement":
            input_text = random.choice(statements)
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "regex",
                    "value": r"^[A-Z].*"  # Starts with capital letter
                }
            ]
            
        elif category == "calculation":
            input_text = random.choice(calculations)
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "javascript",
                    "value": f"output === '{input_text}'"  # Exact match via JS
                }
            ]
            
        elif category == "story":
            input_text = f"{random.choice(story_prompts)} in the year {random.randint(2000, 3000)}"
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "python",
                    "value": f"len(output) == {len(input_text)}"  # Length check via Python
                }
            ]
            
        elif category == "technical":
            term = random.choice(technical_terms)
            input_text = f"Define {term}"
            test_case["vars"] = {"input": input_text}
            test_case["assert"] = [
                {
                    "type": "contains",
                    "value": term  # Should contain the technical term
                }
            ]
            
        elif category == "creative":
            prompt = random.choice(creative_prompts)
            topic = random.choice(["nature", "technology", "love", "adventure", "space"])
            input_text = f"{prompt} {topic}"
            test_case["vars"] = {"input": input_text}
            
            # For creative prompts, let's check if it's valid JSON (as a fun test)
            if i % 10 == 0:  # Every 10th creative test
                test_case["vars"]["input"] = f'{{"request": "{input_text}"}}'
                test_case["assert"] = [{"type": "is-json"}]
            else:
                test_case["assert"] = [
                    {
                        "type": "contains",
                        "value": topic
                    }
                ]
        
        # Add some variety with multiple assertions occasionally
        if i % 5 == 0:  # Every 5th test gets an extra assertion
            test_case["assert"].append({
                "type": "javascript",
                "value": "output.length > 0"  # Output should not be empty
            })
        
        # Add custom metrics occasionally
        if i % 20 == 0:  # Every 20th test
            test_case["assert"].append({
                "type": "python",
                "value": f"1 if output == '{input_text}' else 0",  # Custom metric  
                "metric": "exact_match_score"
            })
        
        test_cases.append(test_case)
    
    return test_cases

def generate_config(test_cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate the complete promptfoo configuration."""
    config = {
        "description": "Echo provider with 1000 test cases",
        "prompts": ["{{input}}"],  # Simple passthrough prompt
        "providers": ["echo"],  # Echo provider just returns the input
        "tests": test_cases,
        "outputPath": "file://output.csv"
    }
    
    # Add the schema reference as a comment (will be added manually to YAML)
    return config

def main():
    """Main function to generate and save the configuration."""
    print("Generating 1000 test cases...")
    test_cases = generate_test_cases(1000)
    
    print(f"Generated {len(test_cases)} test cases")
    
    # Generate the configuration
    config = generate_config(test_cases)
    
    # Save as JSON (can be used directly by promptfoo)
    with open("promptfooconfig.json", "w") as f:
        json.dump(config, f, indent=2)
    
    print("Configuration saved to promptfooconfig.json")
    
    # Also save as YAML for better readability
    try:
        import yaml
        
        # Add the schema reference
        yaml_content = "# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n"
        yaml_content += yaml.dump(config, default_flow_style=False, sort_keys=False)
        
        with open("promptfooconfig.yaml", "w") as f:
            f.write(yaml_content)
        
        print("Configuration also saved to promptfooconfig.yaml")
    except ImportError:
        print("PyYAML not installed. Install with: pip install pyyaml")
        print("You can still use the JSON config file.")
    
    # Generate a summary
    print("\n=== Test Case Summary ===")
    categories = {}
    for tc in test_cases:
        cat = tc["description"].split(":")[1].split()[0]
        categories[cat] = categories.get(cat, 0) + 1
    
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count} tests")
    
    print(f"\nTotal: {len(test_cases)} test cases")
    print("\nTo run the evaluation:")
    print("  npx promptfoo@latest eval -c promptfooconfig.yaml")
    print("  # or")
    print("  npx promptfoo@latest eval -c promptfooconfig.json")

if __name__ == "__main__":
    main() 