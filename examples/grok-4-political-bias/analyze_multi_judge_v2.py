#!/usr/bin/env python3
"""Analyze multi-judge political bias evaluation results - Version 2."""

import json
import pandas as pd
import numpy as np
from collections import defaultdict
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

def load_results(filename):
    """Load evaluation results from JSON file."""
    with open(filename, 'r') as f:
        data = json.load(f)
    return data

def analyze_results(filename='results-multi-judge.json'):
    """Main analysis function."""
    print("Loading evaluation results...")
    data = load_results(filename)
    
    # Navigate to actual test results
    test_results = data['results']['results']
    print(f"Total test results: {len(test_results)}")
    
    # Initialize data structures
    all_scores = []
    judge_scores = defaultdict(list)
    model_scores = defaultdict(list)
    model_judge_scores = defaultdict(lambda: defaultdict(list))
    question_scores = defaultdict(lambda: defaultdict(dict))
    
    # Process each test result
    for test in test_results:
        if 'vars' not in test or 'gradingResult' not in test:
            continue
            
        question_id = test['vars']['id']
        question = test['vars']['question']
        provider = test.get('provider', {})
        
        # Handle provider as dict or string
        if isinstance(provider, dict):
            provider_id = provider.get('id', '')
        else:
            provider_id = str(provider)
            
        model_name = provider_id.split(':')[1] if ':' in provider_id else provider_id
        
        # Extract scores from namedScores
        if test['gradingResult'] and 'namedScores' in test['gradingResult']:
            for judge_metric, score in test['gradingResult']['namedScores'].items():
                judge_name = judge_metric.replace('-judge', '')
                
                # Store scores in various ways
                all_scores.append({
                    'question_id': question_id,
                    'question': question[:100] + '...' if len(question) > 100 else question,
                    'model': model_name,
                    'judge': judge_name,
                    'score': score
                })
                
                judge_scores[judge_name].append(score)
                model_scores[model_name].append(score)
                model_judge_scores[model_name][judge_name].append(score)
                question_scores[question_id][model_name][judge_name] = score
    
    # Convert to DataFrame for easier analysis
    df = pd.DataFrame(all_scores)
    print(f"\nTotal score records: {len(df)}")
    print(f"Unique questions: {df['question_id'].nunique()}")
    print(f"Unique models: {df['model'].nunique()}")
    print(f"Unique judges: {df['judge'].nunique()}")
    
    # 1. Judge Bias Analysis
    print("\n\n=== JUDGE BIAS ANALYSIS ===")
    print("\nAverage scores by judge (1.0 = Left, 0.0 = Right):")
    judge_summary = df.groupby('judge')['score'].agg(['mean', 'std', 'count']).sort_values('mean', ascending=False)
    for judge, row in judge_summary.iterrows():
        print(f"  {judge:<25} Mean: {row['mean']:.3f}, Std: {row['std']:.3f}, N: {row['count']}")
    
    # 2. Model Political Positioning
    print("\n\n=== MODEL POLITICAL POSITIONING ===")
    print("\nAverage scores by model (across all judges):")
    model_summary = df.groupby('model')['score'].agg(['mean', 'std', 'count']).sort_values('mean', ascending=False)
    for model, row in model_summary.iterrows():
        print(f"  {model:<30} Mean: {row['mean']:.3f}, Std: {row['std']:.3f}, N: {row['count']}")
    
    # 3. Model x Judge Matrix
    print("\n\n=== MODEL SCORES BY JUDGE ===")
    pivot_table = df.pivot_table(values='score', index='model', columns='judge', aggfunc='mean')
    print("\nAverage scores by judge for each model:")
    print(pivot_table.round(3))
    
    # 4. Self-Scoring Analysis
    print("\n\n=== SELF-SCORING ANALYSIS ===")
    print("\nComparing how models score themselves vs how others score them:")
    
    for model in df['model'].unique():
        model_data = df[df['model'] == model]
        
        # Self score (when judge = model)
        self_scores = model_data[model_data['judge'] == model]['score']
        # Other scores (when judge != model)
        other_scores = model_data[model_data['judge'] != model]['score']
        
        if len(self_scores) > 0 and len(other_scores) > 0:
            self_mean = self_scores.mean()
            other_mean = other_scores.mean()
            diff = self_mean - other_mean
            
            # Run t-test
            t_stat, p_value = stats.ttest_ind(self_scores, other_scores)
            
            print(f"{model:<30} Self: {self_mean:.3f}, Others: {other_mean:.3f}, Diff: {diff:+.3f} {'*' if p_value < 0.05 else ''}")
    
    # 5. Inter-Judge Agreement
    print("\n\n=== INTER-JUDGE AGREEMENT ===")
    
    # Calculate correlations between judges
    judge_pairs = []
    judges = df['judge'].unique()
    
    for i, judge1 in enumerate(judges):
        for j, judge2 in enumerate(judges):
            if i < j:  # Only calculate once for each pair
                # Get common model-question pairs scored by both judges
                j1_data = df[df['judge'] == judge1].set_index(['model', 'question_id'])['score']
                j2_data = df[df['judge'] == judge2].set_index(['model', 'question_id'])['score']
                
                # Find common indices
                common_idx = j1_data.index.intersection(j2_data.index)
                
                if len(common_idx) > 10:  # Need enough data for correlation
                    corr = j1_data[common_idx].corr(j2_data[common_idx])
                    judge_pairs.append({
                        'judge1': judge1,
                        'judge2': judge2,
                        'correlation': corr,
                        'n_common': len(common_idx)
                    })
    
    if judge_pairs:
        print("\nPairwise judge correlations:")
        for pair in sorted(judge_pairs, key=lambda x: x['correlation'], reverse=True):
            print(f"  {pair['judge1']:<20} vs {pair['judge2']:<20} r={pair['correlation']:.3f} (n={pair['n_common']})")
    
    # 6. Questions with Highest Judge Disagreement
    print("\n\n=== QUESTIONS WITH HIGHEST JUDGE DISAGREEMENT ===")
    
    # Calculate variance across judges for each model-question combination
    variance_data = []
    for (model, question_id), group in df.groupby(['model', 'question_id']):
        if len(group) > 1:  # Need multiple judges
            scores = group['score'].values
            variance = np.var(scores)
            
            variance_data.append({
                'model': model,
                'question_id': question_id,
                'question': group.iloc[0]['question'],
                'variance': variance,
                'mean_score': np.mean(scores),
                'n_judges': len(scores),
                'scores': scores
            })
    
    if variance_data:
        variance_df = pd.DataFrame(variance_data).sort_values('variance', ascending=False)
        print("\nTop 10 model-question combinations with highest judge disagreement:")
        for _, row in variance_df.head(10).iterrows():
            print(f"\n{row['model']} - Q{row['question_id']}: {row['question']}")
            print(f"  Variance: {row['variance']:.3f}, Mean: {row['mean_score']:.3f}, N judges: {row['n_judges']}")
            print(f"  Scores: {row['scores']}")
    
    # 7. Company Bias Analysis
    print("\n\n=== COMPANY/TRIBAL BIAS ANALYSIS ===")
    
    # Check if judges favor their own company's model
    company_mappings = {
        'grok-4': 'xAI',
        'gemini-2.5-pro': 'Google',
        'gpt-4.1': 'OpenAI',
        'claude-opus-4-20250514': 'Anthropic'
    }
    
    print("\nChecking for 'home team' bias:")
    for model, company in company_mappings.items():
        if model in pivot_table.index and model in pivot_table.columns:
            self_score = pivot_table.loc[model, model]
            other_scores = pivot_table.loc[model, [col for col in pivot_table.columns if col != model]].mean()
            diff = self_score - other_scores
            
            print(f"{model} judging itself: {self_score:.3f} vs others: {other_scores:.3f} (diff: {diff:+.3f})")
    
    return df, pivot_table

if __name__ == "__main__":
    df, pivot_table = analyze_results() 