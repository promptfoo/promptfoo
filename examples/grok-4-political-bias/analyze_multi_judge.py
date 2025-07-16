#!/usr/bin/env python3
"""Analyze multi-judge political bias evaluation results."""

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

def extract_judge_scores(results):
    """Extract scores from each judge for each model and question."""
    judge_scores = defaultdict(lambda: defaultdict(list))
    model_responses = defaultdict(dict)
    question_data = []
    
    # Navigate to actual test results
    test_results = results['results']['results'] if 'results' in results and 'results' in results['results'] else results.get('results', [])
    
    for test in test_results:
        if 'vars' not in test:
            continue
            
        try:
            question_id = str(test['vars']['id'])
            question = str(test['vars']['question'])
            question_data.append({'id': question_id, 'question': question})
            
            # Extract provider and response
            provider = test.get('provider', '')
            response_obj = test.get('response', {})
            if isinstance(response_obj, dict):
                response = response_obj.get('output', '')
            else:
                response = str(response_obj)
            
            model_name = provider.split(':')[1] if ':' in provider else provider
            
            if model_name and response:
                model_responses[question_id][model_name] = response
        except Exception as e:
            print(f"Error processing test: {e}")
            print(f"Question ID type: {type(question_id) if 'question_id' in locals() else 'not set'}")
            continue
        
        # Extract scores from each judge
        if 'gradingResult' in test and test['gradingResult']:
            grading = test['gradingResult']
            
            # Check for namedScores first (easier)
            if 'namedScores' in grading:
                for judge_metric, score in grading['namedScores'].items():
                    judge_name = judge_metric.replace('-judge', '')
                    judge_scores[judge_name][f"{model_name}_{question_id}"].append(score)
            
            # Also check componentResults for detailed scoring
            elif 'componentResults' in grading:
                for component in grading['componentResults']:
                    if 'assertion' in component and component['assertion']:
                        metric = component['assertion'].get('metric', 'unknown')
                        if component.get('pass') and 'score' in component:
                            score = component['score']
                            judge_name = metric.replace('-judge', '')
                            judge_scores[judge_name][f"{model_name}_{question_id}"].append(score)
    
    return judge_scores, model_responses, pd.DataFrame(question_data).drop_duplicates()

def analyze_judge_bias(judge_scores):
    """Analyze bias patterns for each judge."""
    print("\n=== JUDGE BIAS ANALYSIS ===\n")
    
    judge_stats = {}
    for judge, scores in judge_scores.items():
        all_scores = []
        for key, score_list in scores.items():
            if score_list:
                all_scores.extend(score_list)
        
        if all_scores:
            judge_stats[judge] = {
                'mean': np.mean(all_scores),
                'std': np.std(all_scores),
                'median': np.median(all_scores),
                'count': len(all_scores)
            }
    
    # Print judge statistics
    print("Average scores by judge (1.0 = Left, 0.0 = Right):")
    for judge, stats in sorted(judge_stats.items(), key=lambda x: x[1]['mean'], reverse=True):
        print(f"  {judge:20} Mean: {stats['mean']:.3f}, Std: {stats['std']:.3f}, N: {stats['count']}")
    
    return judge_stats

def analyze_self_scoring(judge_scores):
    """Analyze how models score themselves vs how others score them."""
    print("\n\n=== SELF-SCORING ANALYSIS ===\n")
    
    models = ['grok-4', 'gemini-2.5-pro', 'gpt-4.1', 'claude-opus-4-20250514']
    
    # Calculate self vs other scores
    self_vs_other = defaultdict(lambda: {'self': [], 'others': []})
    
    for judge, scores in judge_scores.items():
        judge_model = judge
        
        for key, score_list in scores.items():
            if score_list and '_' in key:
                model_name = key.split('_')[0]
                
                if judge_model == model_name:
                    self_vs_other[model_name]['self'].extend(score_list)
                else:
                    self_vs_other[model_name]['others'].extend(score_list)
    
    print("Self-scoring vs External scoring:")
    print("Model                Self Score   Others Score   Difference")
    print("-" * 60)
    
    for model in models:
        if model in self_vs_other and self_vs_other[model]['self'] and self_vs_other[model]['others']:
            self_mean = np.mean(self_vs_other[model]['self'])
            others_mean = np.mean(self_vs_other[model]['others'])
            diff = self_mean - others_mean
            
            # Run t-test
            t_stat, p_value = stats.ttest_ind(self_vs_other[model]['self'], 
                                               self_vs_other[model]['others'])
            
            print(f"{model:20} {self_mean:.3f}        {others_mean:.3f}         {diff:+.3f} {'*' if p_value < 0.05 else ''}")

def analyze_inter_judge_agreement(judge_scores):
    """Analyze agreement between judges."""
    print("\n\n=== INTER-JUDGE AGREEMENT ===\n")
    
    # Convert to DataFrame for easier analysis
    judge_names = list(judge_scores.keys())
    
    # Create a matrix of scores for correlation
    score_matrix = defaultdict(dict)
    
    for judge, scores in judge_scores.items():
        for key, score_list in scores.items():
            if score_list:
                score_matrix[key][judge] = np.mean(score_list)
    
    # Convert to DataFrame
    df = pd.DataFrame.from_dict(score_matrix, orient='index')
    
    # Calculate correlations
    if len(df.columns) > 1:
        correlations = df.corr()
        print("Judge correlation matrix:")
        print(correlations.round(3))
        
        # Find most/least agreeable judges
        avg_corr = correlations.mean(axis=1) - 1  # Subtract 1 to exclude self-correlation
        avg_corr = avg_corr / (len(correlations) - 1)
        
        print(f"\nMost agreeable judge: {avg_corr.idxmax()} (avg correlation: {avg_corr.max():.3f})")
        print(f"Least agreeable judge: {avg_corr.idxmin()} (avg correlation: {avg_corr.min():.3f})")
    
    return df

def analyze_judge_variance_by_question(df_scores, questions_df):
    """Find questions with highest judge disagreement."""
    print("\n\n=== QUESTIONS WITH HIGHEST JUDGE DISAGREEMENT ===\n")
    
    # Calculate variance across judges for each question
    question_variance = []
    
    for idx, row in df_scores.iterrows():
        if '_' in idx:
            model, q_id = idx.rsplit('_', 1)
            scores = row.dropna().values
            
            if len(scores) > 1:
                variance = np.var(scores)
                mean_score = np.mean(scores)
                
                # Get question text
                q_text = questions_df[questions_df['id'] == q_id]['question'].values
                q_text = q_text[0] if len(q_text) > 0 else "Unknown"
                
                question_variance.append({
                    'question_id': q_id,
                    'model': model,
                    'question': q_text[:100] + '...' if len(q_text) > 100 else q_text,
                    'variance': variance,
                    'mean_score': mean_score,
                    'scores': scores
                })
    
    # Sort by variance and show top 10
    variance_df = pd.DataFrame(question_variance)
    if not variance_df.empty:
        top_variance = variance_df.nlargest(10, 'variance')
        
        print("Top 10 questions with highest judge disagreement:")
        for _, row in top_variance.iterrows():
            print(f"\nQ{row['question_id']} ({row['model']}): {row['question']}")
            print(f"  Variance: {row['variance']:.3f}, Mean: {row['mean_score']:.3f}")
            print(f"  Scores: {row['scores']}")

def analyze_model_by_judge(judge_scores):
    """Analyze how each judge scores each model."""
    print("\n\n=== MODEL SCORES BY JUDGE ===\n")
    
    # Create model x judge matrix
    models = ['grok-4', 'gemini-2.5-pro', 'gpt-4.1', 'claude-opus-4-20250514']
    judge_model_scores = defaultdict(lambda: defaultdict(list))
    
    for judge, scores in judge_scores.items():
        for key, score_list in scores.items():
            if score_list and '_' in key:
                model = key.split('_')[0]
                judge_model_scores[judge][model].extend(score_list)
    
    # Print matrix
    judges = sorted(judge_model_scores.keys())
    
    print("Average scores by judge for each model:")
    print(f"{'Judge':<25}", end='')
    for model in models:
        print(f"{model:<20}", end='')
    print()
    print("-" * 105)
    
    for judge in judges:
        print(f"{judge:<25}", end='')
        for model in models:
            scores = judge_model_scores[judge][model]
            if scores:
                avg = np.mean(scores)
                print(f"{avg:<20.3f}", end='')
            else:
                print(f"{'N/A':<20}", end='')
        print()
    
    # Check for company bias
    print("\n\nChecking for 'home team' bias (models scoring themselves higher):")
    for i, judge in enumerate(judges):
        for j, model in enumerate(models):
            if judge == model:
                self_score = np.mean(judge_model_scores[judge][model]) if judge_model_scores[judge][model] else 0
                other_scores = []
                for other_model in models:
                    if other_model != model and judge_model_scores[judge][other_model]:
                        other_scores.extend(judge_model_scores[judge][other_model])
                
                if other_scores:
                    other_mean = np.mean(other_scores)
                    diff = self_score - other_mean
                    print(f"{judge} scoring itself: {self_score:.3f} vs others: {other_mean:.3f} (diff: {diff:+.3f})")

def main():
    """Run all analyses."""
    print("Loading evaluation results...")
    results = load_results('results-multi-judge.json')
    
    # Get actual test count
    test_results = results['results']['results'] if 'results' in results and 'results' in results['results'] else results.get('results', [])
    print(f"Total tests: {len(test_results)}")
    
    # Extract scores
    judge_scores, model_responses, questions_df = extract_judge_scores(results)
    
    print(f"Judges found: {list(judge_scores.keys())}")
    
    # Run analyses
    judge_stats = analyze_judge_bias(judge_scores)
    analyze_self_scoring(judge_scores)
    df_scores = analyze_inter_judge_agreement(judge_scores)
    analyze_judge_variance_by_question(df_scores, questions_df)
    analyze_model_by_judge(judge_scores)
    
    # Summary statistics
    print("\n\n=== SUMMARY STATISTICS ===\n")
    
    total_judgments = sum(len(scores) for judge_scores_dict in judge_scores.values() 
                         for scores in judge_scores_dict.values())
    print(f"Total judgments analyzed: {total_judgments}")
    
    # Calculate overall model scores across all judges
    model_scores = defaultdict(list)
    for judge, scores in judge_scores.items():
        for key, score_list in scores.items():
            if score_list and '_' in key:
                model = key.split('_')[0]
                model_scores[model].extend(score_list)
    
    print("\nOverall model political positions (averaged across all judges):")
    for model, scores in sorted(model_scores.items(), key=lambda x: np.mean(x[1]) if x[1] else 0, reverse=True):
        if scores:
            mean = np.mean(scores)
            std = np.std(scores)
            print(f"  {model:<30} Mean: {mean:.3f} (Std: {std:.3f})")

if __name__ == "__main__":
    main() 