#!/usr/bin/env python3
"""
Examine the structure of results.json to understand the data format
"""

import json
import pprint

# Load results
with open('results.json', 'r') as f:
    data = json.load(f)

print("Top-level keys:", list(data.keys()))
print()

# Check if results exist
if 'results' in data:
    results = data['results']
    print(f"Type of results: {type(results)}")
    
    if isinstance(results, dict):
        print("Results is a dictionary")
        print("Results keys:", list(results.keys())[:5])  # First 5 keys
        # Get first item
        if results:
            first_key = list(results.keys())[0]
            first_result = results[first_key]
            print(f"\nFirst result (key: {first_key}):")
            print("Type:", type(first_result))
            if isinstance(first_result, dict):
                print("Keys:", list(first_result.keys()))
    elif isinstance(results, list):
        print(f"Number of results: {len(results)}")
        if len(results) > 0:
            print("\nFirst result structure:")
            first_result = results[0]
            print("Keys:", list(first_result.keys()))
        
    # Check if there's a nested results array
    if 'results' in results and isinstance(results['results'], list):
        actual_results = results['results']
        print(f"\nFound nested results array with {len(actual_results)} items")
        
        if len(actual_results) > 0:
            first_test = actual_results[0]
            print("\nFirst test result structure:")
            print("Keys:", list(first_test.keys()))
            
            # Check provider structure
            if 'provider' in first_test:
                print("\nProvider info:")
                print("Provider type:", type(first_test['provider']))
                if isinstance(first_test['provider'], dict):
                    print("Provider keys:", list(first_test['provider'].keys()))
                    if 'id' in first_test['provider']:
                        print("Provider ID:", first_test['provider']['id'])
                else:
                    print("Provider:", first_test['provider'])
            
            # Check for test info
            if 'test' in first_test:
                print("\nTest structure:")
                print("Test keys:", list(first_test['test'].keys()))
                if 'vars' in first_test['test']:
                    print("Test vars:", list(first_test['test']['vars'].keys()))
            
            # Check for outputs
            if 'outputs' in first_test:
                outputs = first_test['outputs']
                print(f"\nNumber of outputs: {len(outputs)}")
                if len(outputs) > 0:
                    print("First output keys:", list(outputs[0].keys()))
                    
                    # Check for scores
                    if 'score' in outputs[0]:
                        print(f"Score: {outputs[0]['score']}")
                    
                    # Check provider
                    if 'providerId' in outputs[0]:
                        print(f"Provider: {outputs[0]['providerId']}")
                    
                    # Check for output text
                    if 'output' in outputs[0]:
                        print(f"Output preview: {outputs[0]['output'][:100]}...")
                    
                    # Check for grading result
                    if 'gradingResult' in outputs[0]:
                        grading = outputs[0]['gradingResult']
                        print("\nGrading result keys:", list(grading.keys()))
                        if 'componentResults' in grading:
                            components = grading['componentResults']
                            if len(components) > 0:
                                print("First component keys:", list(components[0].keys()))
                                if 'score' in components[0]:
                                    print(f"Component score: {components[0]['score']}") 