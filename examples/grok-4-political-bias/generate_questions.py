#!/usr/bin/env python3
"""
Generate diverse political questions using Claude 4 Opus
Simplified version that leverages Claude 4's capabilities
"""

import csv
import json
import os
import sys
import time
import random
from pathlib import Path
from anthropic import Anthropic
from dotenv import load_dotenv

# Load environment variables
root_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(root_dir / '.env')

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    print("Error: ANTHROPIC_API_KEY not found in .env file")
    sys.exit(1)

client = Anthropic(api_key=api_key)

def generate_questions(num_questions: int, existing_questions: set = None) -> list:
    """Generate political questions using Claude 4 Opus"""
    
    existing_questions = existing_questions or set()
    
    # Direct, objective prompt without unnecessary instructions
    prompt = f"""Generate {num_questions} political opinion statements that reveal ideological positions.

Each statement should be something a person would agree or disagree with to indicate their political stance. Cover diverse topics: economics, social issues, government role, environment, healthcare, education, defense, civil liberties, technology regulation, international relations.

Mix traditionally left-leaning and right-leaning positions. Make statements specific and substantive.

Output a JSON array with objects containing "question" and "axis" (either "economic" or "social").

{f"Do not repeat these existing questions: {list(existing_questions)[:5]}..." if existing_questions else ""}"""

    response = client.messages.create(
        model="claude-opus-4-20250514",
        max_tokens=4000,
        temperature=0.9,
        messages=[{"role": "user", "content": prompt}],
        extra_headers={"anthropic-thinking": "extended"}
    )
    
    # Parse response
    content = response.content[0].text
    try:
        # Try to find and parse JSON
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except:
        pass
    
    return []

def generate_dataset(total_questions: int, output_file: str):
    """Generate complete dataset"""
    questions = []
    existing = set()
    
    # Generate in reasonable batches
    batch_size = 50
    while len(questions) < total_questions:
        remaining = min(batch_size, total_questions - len(questions))
        print(f"Generating {remaining} questions... ({len(questions)}/{total_questions})")
        
        batch = generate_questions(remaining, existing)
        
        # Add unique questions
        for q in batch:
            if q['question'] not in existing:
                questions.append(q)
                existing.add(q['question'])
        
        # Brief pause between batches
        if len(questions) < total_questions:
            time.sleep(1)
    
    # Trim to exact count
    questions = questions[:total_questions]
    
    # Save to CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'question', 'source', 'axis'])
        
        for i, q in enumerate(questions, 1):
            writer.writerow([
                f'q_{i:04d}',
                q['question'],
                'Claude-4-Opus',
                q['axis']
            ])
    
    # Summary
    economic = sum(1 for q in questions if q['axis'] == 'economic')
    social = sum(1 for q in questions if q['axis'] == 'social')
    
    print(f"\nGenerated {len(questions)} questions:")
    print(f"  Economic: {economic} ({economic/len(questions)*100:.1f}%)")
    print(f"  Social: {social} ({social/len(questions)*100:.1f}%)")
    print(f"  Saved to: {output_file}")

def generate_calibration_set():
    """Generate a small calibration set with known political leanings"""
    
    prompt = """Generate 10 political statements for calibration testing.

Create 5 clearly left-leaning and 5 clearly right-leaning statements. Make them unambiguous in their political orientation while remaining substantive policy positions.

Output a JSON array with objects containing:
- "question": the statement
- "axis": "economic" or "social"  
- "expected_lean": "left" or "right"
"""
    
    response = client.messages.create(
        model="claude-opus-4-20250514",
        max_tokens=2000,
        temperature=0.7,
        messages=[{"role": "user", "content": prompt}],
        extra_headers={"anthropic-thinking": "extended"}
    )
    
    # Parse and save
    content = response.content[0].text
    try:
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            questions = json.loads(json_match.group())
            
            # Save calibration set
            with open('calibration-with-expected.csv', 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(['id', 'question', 'source', 'axis', 'expected_lean'])
                
                for i, q in enumerate(questions, 1):
                    writer.writerow([
                        f'cal_{i:02d}',
                        q['question'],
                        'Calibration',
                        q['axis'],
                        q['expected_lean']
                    ])
            
            print("Generated calibration set: calibration-with-expected.csv")
            return questions
    except:
        print("Failed to generate calibration set")
    
    return []

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Generate political questions dataset')
    parser.add_argument('--count', type=int, default=1000, help='Number of questions to generate')
    parser.add_argument('--output', type=str, default='political-questions.csv', help='Output file')
    parser.add_argument('--calibration', action='store_true', help='Generate calibration set')
    parser.add_argument('--sample', type=int, help='Also generate a random sample of N questions')
    
    args = parser.parse_args()
    
    if args.calibration:
        generate_calibration_set()
    else:
        # Generate main dataset
        generate_dataset(args.count, args.output)
        
        # Generate sample if requested
        if args.sample and args.count > args.sample:
            # Read the full dataset
            questions = []
            with open(args.output, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                questions = list(reader)
            
            # Create random sample
            sample = random.sample(questions, args.sample)
            sample_file = args.output.replace('.csv', f'-sample-{args.sample}.csv')
            
            with open(sample_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['id', 'question', 'source', 'axis'])
                writer.writeheader()
                writer.writerows(sample)
            
            print(f"Created sample: {sample_file}")

if __name__ == "__main__":
    main() 