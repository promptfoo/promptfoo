#!/usr/bin/env python3
"""Extract and analyze interesting multi-judge findings."""

import json
import pandas as pd
import numpy as np
from collections import defaultdict

def analyze_musk_related_bias():
    """Analyze how different judges score Musk/X related questions."""
    print("\n=== MUSK/X RELATED BIAS BY JUDGE ===")
    
    # Load the original questions to identify Musk-related ones
    questions_df = pd.read_csv('political-questions.csv')
    
    # Find Musk-related questions
    musk_keywords = ['Musk', 'Tesla', 'X (formerly Twitter)', 'SpaceX', 'xAI', 'Neuralink', 'Elon']
    musk_questions = questions_df[questions_df['question'].str.contains('|'.join(musk_keywords), case=False)]
    musk_ids = set(musk_questions['id'].values)
    
    print(f"\nFound {len(musk_ids)} Musk-related questions")
    
    # Load results
    with open('results-multi-judge.json', 'r') as f:
        data = json.load(f)
    
    # Extract scores for Musk-related questions
    musk_scores_by_judge = defaultdict(lambda: defaultdict(list))
    all_scores_by_judge = defaultdict(lambda: defaultdict(list))
    
    for test in data['results']['results']:
        if 'vars' not in test or 'gradingResult' not in test:
            continue
            
        question_id = test['vars']['id']
        provider = test.get('provider', {})
        model_name = provider.get('id', '').split(':')[1] if isinstance(provider, dict) else ''
        
        if test['gradingResult'] and 'namedScores' in test['gradingResult']:
            for judge_metric, score in test['gradingResult']['namedScores'].items():
                judge_name = judge_metric.replace('-judge', '')
                
                # Store all scores
                all_scores_by_judge[judge_name][model_name].append(score)
                
                # Store Musk-related scores
                if question_id in musk_ids:
                    musk_scores_by_judge[judge_name][model_name].append(score)
    
    # Compare Musk vs non-Musk scoring by each judge
    print("\n\nHow each judge scores Musk-related topics:")
    print("Judge                Model                  Musk Topics    All Topics    Difference")
    print("-" * 85)
    
    for judge in sorted(musk_scores_by_judge.keys()):
        for model in sorted(musk_scores_by_judge[judge].keys()):
            if musk_scores_by_judge[judge][model]:
                musk_mean = np.mean(musk_scores_by_judge[judge][model])
                all_mean = np.mean(all_scores_by_judge[judge][model])
                diff = musk_mean - all_mean
                
                print(f"{judge:<20} {model:<22} {musk_mean:.3f}         {all_mean:.3f}        {diff:+.3f}")
    
    # Check if Grok-4 as judge is harsher on Musk topics
    print("\n\nDoes Grok-4 as judge compensate by being harsher on Musk topics?")
    for model in ['grok-4', 'gemini-2.5-pro', 'gpt-4.1', 'claude-opus-4-20250514']:
        if model in musk_scores_by_judge['grok-4']:
            musk_scores = musk_scores_by_judge['grok-4'][model]
            all_scores = all_scores_by_judge['grok-4'][model]
            
            if musk_scores and all_scores:
                print(f"\nGrok-4 judging {model}:")
                print(f"  Musk topics: {np.mean(musk_scores):.3f}")
                print(f"  All topics: {np.mean(all_scores):.3f}")
                print(f"  Difference: {np.mean(musk_scores) - np.mean(all_scores):+.3f}")

def analyze_judge_extremism():
    """Analyze which judges give more extreme scores."""
    print("\n\n=== JUDGE EXTREMISM ANALYSIS ===")
    
    with open('results-multi-judge.json', 'r') as f:
        data = json.load(f)
    
    # Count extreme scores by judge
    extreme_counts = defaultdict(lambda: {'extreme_left': 0, 'extreme_right': 0, 'moderate': 0, 'total': 0})
    
    for test in data['results']['results']:
        if 'gradingResult' in test and test['gradingResult'] and 'namedScores' in test['gradingResult']:
            for judge_metric, score in test['gradingResult']['namedScores'].items():
                judge_name = judge_metric.replace('-judge', '')
                
                extreme_counts[judge_name]['total'] += 1
                
                if score >= 0.9:
                    extreme_counts[judge_name]['extreme_left'] += 1
                elif score <= 0.1:
                    extreme_counts[judge_name]['extreme_right'] += 1
                else:
                    extreme_counts[judge_name]['moderate'] += 1
    
    print("\nExtreme scoring patterns by judge:")
    print("Judge                Extreme Left (≥0.9)    Extreme Right (≤0.1)    Moderate    Total")
    print("-" * 85)
    
    for judge in sorted(extreme_counts.keys()):
        counts = extreme_counts[judge]
        if counts['total'] > 0:
            left_pct = (counts['extreme_left'] / counts['total']) * 100
            right_pct = (counts['extreme_right'] / counts['total']) * 100
            mod_pct = (counts['moderate'] / counts['total']) * 100
            
            print(f"{judge:<20} {counts['extreme_left']:>4} ({left_pct:>5.1f}%)        "
                  f"{counts['extreme_right']:>4} ({right_pct:>5.1f}%)         "
                  f"{counts['moderate']:>4} ({mod_pct:>5.1f}%)    {counts['total']:>5}")

def analyze_contrarian_patterns():
    """Find questions where Grok-4 takes opposite position from consensus."""
    print("\n\n=== GROK-4 CONTRARIAN ANALYSIS ===")
    
    with open('results-multi-judge.json', 'r') as f:
        data = json.load(f)
    
    # Group scores by question and model
    question_model_scores = defaultdict(lambda: {'scores': {}, 'question': ''})
    
    for test in data['results']['results']:
        if 'vars' not in test or 'gradingResult' not in test:
            continue
            
        question_id = test['vars']['id']
        question = test['vars']['question']
        provider = test.get('provider', {})
        model_name = provider.get('id', '').split(':')[1] if isinstance(provider, dict) else ''
        
        if test['gradingResult'] and 'namedScores' in test['gradingResult']:
            # Average across all judges for this model-question
            scores = list(test['gradingResult']['namedScores'].values())
            avg_score = np.mean(scores) if scores else None
            
            if avg_score is not None:
                question_model_scores[question_id]['scores'][model_name] = avg_score
                question_model_scores[question_id]['question'] = question
    
    # Find contrarian examples
    contrarian_examples = []
    
    for q_id, data in question_model_scores.items():
        scores = data['scores']
        
        if 'grok-4' in scores and len(scores) >= 3:
            grok_score = scores['grok-4']
            other_scores = [s for k, s in scores.items() if k != 'grok-4']
            other_mean = np.mean(other_scores)
            
            # Check if Grok is contrarian (>0.5 difference from others)
            diff = abs(grok_score - other_mean)
            if diff > 0.5:
                contrarian_examples.append({
                    'question_id': q_id,
                    'question': data['question'][:100] + '...',
                    'grok_score': grok_score,
                    'others_mean': other_mean,
                    'difference': grok_score - other_mean
                })
    
    # Sort by absolute difference
    contrarian_examples.sort(key=lambda x: abs(x['difference']), reverse=True)
    
    print(f"\nFound {len(contrarian_examples)} questions where Grok-4 differs from consensus by >0.5")
    print("\nTop 10 contrarian examples:")
    
    for i, example in enumerate(contrarian_examples[:10]):
        print(f"\n{i+1}. Q{example['question_id']}: {example['question']}")
        print(f"   Grok-4: {example['grok_score']:.2f}, Others avg: {example['others_mean']:.2f}, Diff: {example['difference']:+.2f}")

def main():
    analyze_musk_related_bias()
    analyze_judge_extremism()
    analyze_contrarian_patterns()

if __name__ == "__main__":
    main() 