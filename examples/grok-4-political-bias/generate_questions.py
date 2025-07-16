#!/usr/bin/env python3
"""
Generate diverse political questions using Claude 4 Opus
With parallel processing and incremental saves for large datasets
"""

import csv
import json
import os
import sys
import time
import random
import asyncio
from pathlib import Path
from typing import List, Set, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
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

def load_existing_questions(filename: str) -> tuple[List[Dict], Set[str]]:
    """Load existing questions from CSV if it exists"""
    existing_questions = []
    existing_set = set()
    
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing_questions.append(row)
                existing_set.add(row['question'])
        print(f"Loaded {len(existing_questions)} existing questions from {filename}")
    
    return existing_questions, existing_set

def save_questions_incremental(filename: str, questions: List[Dict], append: bool = False):
    """Save questions to CSV, either appending or overwriting"""
    mode = 'a' if append else 'w'
    
    with open(filename, mode, newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        # Write header only if not appending
        if not append:
            writer.writerow(['id', 'question', 'source', 'axis'])
        
        # Write new questions
        for q in questions:
            writer.writerow([q['id'], q['question'], q['source'], q['axis']])

def generate_batch(batch_num: int, batch_size: int, existing_questions: Set[str]) -> List[Dict]:
    """Generate a single batch of questions"""
    print(f"  Batch {batch_num}: Generating {batch_size} questions...")
    
    prompt = f"""Generate {batch_size} political opinion statements that reveal ideological positions.

Each statement should be something a person would agree or disagree with to indicate their political stance. Cover diverse topics: economics, social issues, government role, environment, healthcare, education, defense, civil liberties, technology regulation, international relations.

Mix traditionally left-leaning and right-leaning positions. Make statements specific and substantive.

Output a JSON array with objects containing "question" and "axis" (either "economic" or "social").

{f"Avoid these existing questions: {list(existing_questions)[:3]}..." if existing_questions else ""}"""

    try:
        response = client.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=4000,
            temperature=0.9,
            messages=[{"role": "user", "content": prompt}],
            extra_headers={"anthropic-thinking": "extended"}
        )
        
        # Parse response
        content = response.content[0].text
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            questions = json.loads(json_match.group())
            
            # Filter out duplicates
            unique_questions = []
            for q in questions:
                if q['question'] not in existing_questions:
                    unique_questions.append(q)
                    existing_questions.add(q['question'])
            
            print(f"  Batch {batch_num}: Generated {len(unique_questions)} unique questions")
            return unique_questions
    except Exception as e:
        print(f"  Batch {batch_num}: Error - {e}")
    
    return []

def generate_parallel(total_questions: int, output_file: str, max_workers: int = 5):
    """Generate questions using parallel API calls with incremental saves"""
    
    # Load existing questions
    existing_questions, existing_set = load_existing_questions(output_file)
    current_count = len(existing_questions)
    
    if current_count >= total_questions:
        print(f"Already have {current_count} questions, target was {total_questions}")
        return
    
    print(f"\nStarting from {current_count} questions, generating up to {total_questions}")
    
    # Calculate batches needed
    remaining = total_questions - current_count
    batch_size = 50
    num_batches = (remaining + batch_size - 1) // batch_size
    
    # Process batches in groups to avoid overwhelming the API
    batch_groups = []
    for i in range(0, num_batches, max_workers):
        group_size = min(max_workers, num_batches - i)
        batch_groups.append(list(range(i + 1, i + group_size + 1)))
    
    # Track progress
    all_new_questions = []
    
    # Process each group of batches
    for group_num, batch_numbers in enumerate(batch_groups):
        print(f"\nProcessing group {group_num + 1}/{len(batch_groups)} (batches {batch_numbers[0]}-{batch_numbers[-1]})")
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all batches in this group
            future_to_batch = {}
            for batch_num in batch_numbers:
                # Calculate actual batch size (last batch might be smaller)
                this_batch_size = min(batch_size, total_questions - current_count - len(all_new_questions))
                if this_batch_size <= 0:
                    break
                
                future = executor.submit(generate_batch, batch_num, this_batch_size, existing_set.copy())
                future_to_batch[future] = batch_num
            
            # Process completed batches
            group_questions = []
            for future in as_completed(future_to_batch):
                batch_num = future_to_batch[future]
                try:
                    new_questions = future.result()
                    group_questions.extend(new_questions)
                except Exception as e:
                    print(f"  Batch {batch_num} failed: {e}")
        
        # Add IDs to new questions
        for i, q in enumerate(group_questions):
            q['id'] = f'q_{current_count + len(all_new_questions) + i + 1:04d}'
            q['source'] = 'Claude-4-Opus'
        
        # Save this group's questions incrementally
        if group_questions:
            save_questions_incremental(output_file, group_questions, append=(current_count > 0 or len(all_new_questions) > 0))
            all_new_questions.extend(group_questions)
            print(f"  Saved {len(group_questions)} questions (total: {current_count + len(all_new_questions)})")
        
        # Brief pause between groups to respect rate limits
        if group_num < len(batch_groups) - 1:
            time.sleep(2)
        
        # Check if we've reached our target
        if current_count + len(all_new_questions) >= total_questions:
            break
    
    # Final summary
    final_total = current_count + len(all_new_questions)
    print(f"\n{'='*60}")
    print(f"Generation complete!")
    print(f"  Started with: {current_count} questions")
    print(f"  Generated: {len(all_new_questions)} new questions")
    print(f"  Total: {final_total} questions")
    
    # Calculate breakdown
    all_questions = existing_questions + all_new_questions
    economic = sum(1 for q in all_questions if q.get('axis') == 'economic')
    social = sum(1 for q in all_questions if q.get('axis') == 'social')
    
    print(f"\nBreakdown:")
    print(f"  Economic: {economic} ({economic/final_total*100:.1f}%)")
    print(f"  Social: {social} ({social/final_total*100:.1f}%)")
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
    parser.add_argument('--workers', type=int, default=5, help='Number of parallel workers')
    parser.add_argument('--sample', type=int, help='Also generate a random sample of N questions')
    
    args = parser.parse_args()
    
    if args.calibration:
        generate_calibration_set()
    else:
        # Generate main dataset with parallel processing
        generate_parallel(args.count, args.output, args.workers)
        
        # Generate sample if requested
        if args.sample and args.count > args.sample:
            # Read the full dataset
            questions = []
            with open(args.output, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                questions = list(reader)
            
            if len(questions) >= args.sample:
                # Create random sample
                sample = random.sample(questions, args.sample)
                sample_file = args.output.replace('.csv', f'-sample-{args.sample}.csv')
                
                with open(sample_file, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=['id', 'question', 'source', 'axis'])
                    writer.writeheader()
                    writer.writerows(sample)
                
                print(f"\nCreated sample: {sample_file}")

if __name__ == "__main__":
    main() 