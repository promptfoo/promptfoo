#!/usr/bin/env python3
"""
Analyze political bias results with 0-1 scoring (0=left, 1=right)
"""

import json
import sys
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
import numpy as np

def extract_scores(results):
    """Extract political scores from LLM judge results"""
    data = []
    
    for result in results['results']:
        question = result['vars']['question']
        
        for eval_result in result['response']:
            provider = eval_result['provider']
            output = eval_result['output']
            
            # Find the llm-rubric assertion result
            score_data = None
            for assertion in eval_result.get('assertionResults', []):
                if assertion['type'] == 'llm-rubric' and assertion.get('pass'):
                    try:
                        # Parse the JSON response from the judge
                        judge_output = assertion.get('reason', '')
                        # Extract JSON from the judge's response
                        import re
                        json_match = re.search(r'\{.*\}', judge_output, re.DOTALL)
                        if json_match:
                            score_data = json.loads(json_match.group())
                            break
                    except:
                        pass
            
            if score_data and 'score' in score_data:
                data.append({
                    'provider': provider,
                    'question': question,
                    'response': output,
                    'score': float(score_data['score']),
                    'reasoning': score_data.get('reasoning', '')
                })
    
    return pd.DataFrame(data)

def create_comparison_plot(df):
    """Create a bar chart comparing average political lean"""
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Calculate average scores by provider
    provider_avg = df.groupby('provider')['score'].agg(['mean', 'std', 'count'])
    
    # Create bar chart
    providers = provider_avg.index
    scores = provider_avg['mean']
    errors = provider_avg['std']
    
    bars = ax.bar(providers, scores, yerr=errors, capsize=10, alpha=0.7)
    
    # Color bars based on lean
    for i, (provider, score) in enumerate(zip(providers, scores)):
        if score < 0.4:
            bars[i].set_color('blue')  # Left-leaning
        elif score > 0.6:
            bars[i].set_color('red')   # Right-leaning
        else:
            bars[i].set_color('purple') # Centrist
    
    # Add horizontal line at 0.5 (center)
    ax.axhline(y=0.5, color='black', linestyle='--', alpha=0.5, label='Center (0.5)')
    
    # Labels and formatting
    ax.set_ylabel('Average Political Score (0=Left, 1=Right)', fontsize=12)
    ax.set_title('Political Bias Comparison: Grok-4 vs Gemini 2.5 Pro', fontsize=14)
    ax.set_ylim(0, 1)
    ax.grid(True, alpha=0.3)
    
    # Add value labels on bars
    for i, (provider, row) in enumerate(provider_avg.iterrows()):
        ax.text(i, row['mean'] + 0.02, f"{row['mean']:.3f}", 
                ha='center', va='bottom', fontsize=10)
    
    # Clean up provider names for display
    ax.set_xticklabels([p.split(':')[1] for p in providers], rotation=0)
    
    plt.tight_layout()
    return fig

def generate_detailed_analysis(df):
    """Generate detailed analysis by question"""
    # Group by question and calculate difference
    question_analysis = []
    
    for question in df['question'].unique():
        q_data = df[df['question'] == question]
        
        # Get scores for each provider
        scores = {}
        for _, row in q_data.iterrows():
            provider_name = row['provider'].split(':')[1]
            scores[provider_name] = row['score']
        
        if 'grok-4' in scores and 'gemini-2.5-pro' in scores:
            diff = scores['grok-4'] - scores['gemini-2.5-pro']
            question_analysis.append({
                'question': question[:80] + '...' if len(question) > 80 else question,
                'grok_score': scores['grok-4'],
                'gemini_score': scores['gemini-2.5-pro'],
                'difference': diff,
                'grok_more_right': diff > 0
            })
    
    # Sort by difference
    question_df = pd.DataFrame(question_analysis)
    question_df = question_df.sort_values('difference', ascending=False)
    
    return question_df

def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze_results_simple.py <results.json>")
        sys.exit(1)
    
    results_file = Path(sys.argv[1])
    if not results_file.exists():
        print(f"Error: {results_file} not found")
        sys.exit(1)
    
    # Load results
    with open(results_file) as f:
        results = json.load(f)
    
    # Extract scores
    df = extract_scores(results)
    
    if df.empty:
        print("No political scores found in results. Make sure you ran with the calibration configuration.")
        sys.exit(1)
    
    # Create visualization
    fig = create_comparison_plot(df)
    fig.savefig('political_bias_comparison.png', dpi=300, bbox_inches='tight')
    print("Created political_bias_comparison.png")
    
    # Generate detailed analysis
    question_df = generate_detailed_analysis(df)
    question_df.to_csv('question_analysis.csv', index=False)
    print("Created question_analysis.csv")
    
    # Print summary to console
    print("\nPolitical Bias Summary (0=Left, 1=Right):")
    print("=" * 60)
    
    provider_avg = df.groupby('provider')['score'].agg(['mean', 'std', 'count'])
    for provider, row in provider_avg.iterrows():
        provider_name = provider.split(':')[1]
        lean = "LEFT" if row['mean'] < 0.4 else "RIGHT" if row['mean'] > 0.6 else "CENTER"
        print(f"\n{provider_name}:")
        print(f"  Average Score: {row['mean']:.3f} ({lean})")
        print(f"  Std Deviation: {row['std']:.3f}")
        print(f"  Responses: {row['count']}")
    
    # Print biggest differences
    if not question_df.empty:
        print("\n\nBiggest Differences (Grok more right-leaning):")
        print("-" * 60)
        for _, row in question_df.head(3).iterrows():
            if row['grok_more_right']:
                print(f"\nQ: {row['question']}")
                print(f"   Grok: {row['grok_score']:.2f}, Gemini: {row['gemini_score']:.2f} (diff: +{row['difference']:.2f})")
        
        print("\n\nBiggest Differences (Grok more left-leaning):")
        print("-" * 60)
        for _, row in question_df.tail(3).iterrows():
            if not row['grok_more_right']:
                print(f"\nQ: {row['question']}")
                print(f"   Grok: {row['grok_score']:.2f}, Gemini: {row['gemini_score']:.2f} (diff: {row['difference']:.2f})")

if __name__ == "__main__":
    main() 