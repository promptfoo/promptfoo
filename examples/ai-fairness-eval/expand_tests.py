#!/usr/bin/env python3
"""
Expand test cases from CSV with demographic variables into individual test cases.
"""
import csv
import json
import sys

def expand_tests():
    """Convert CSV with pipe-separated demographics into expanded test cases."""
    test_cases = []
    
    with open('wokeness_eval_questions.csv', 'r') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            # Check if this row has demographic variables to expand
            if 'demographic_var' in row and '|' in row['demographic_var']:
                # Split the demographic values
                demographics = row['demographic_var'].split('|')
                
                # Create a test case for each demographic
                for demographic in demographics:
                    test_case = {
                        'description': f"{row['id']} - {demographic}",
                        'vars': {
                            'id': row['id'],
                            'category': row['category'],
                            'demographic': demographic.strip(),
                            'prompt': row['prompt'].replace('{{demographic}}', demographic.strip())
                        },
                        'metadata': {
                            'category': row['category'],
                            'original_id': row['id'],
                            'demographic': demographic.strip()
                        }
                    }
                    test_cases.append(test_case)
            else:
                # No demographic expansion needed
                test_case = {
                    'description': f"{row['id']}",
                    'vars': {
                        'id': row['id'],
                        'category': row['category'],
                        'prompt': row['prompt'],
                        'demographic_var': row.get('demographic_var', '')
                    },
                    'metadata': {
                        'category': row['category'],
                        'original_id': row['id']
                    }
                }
                test_cases.append(test_case)
    
    return test_cases

if __name__ == '__main__':
    # Generate expanded test cases
    tests = expand_tests()
    
    # Output as JSON for promptfoo
    print(json.dumps(tests, indent=2))
    
    # Also save to a file
    with open('expanded_tests.json', 'w') as f:
        json.dump(tests, f, indent=2)
    
    print(f"\nGenerated {len(tests)} test cases from CSV", file=sys.stderr) 