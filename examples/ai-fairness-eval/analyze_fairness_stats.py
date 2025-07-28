#!/usr/bin/env python3
"""
Statistical Analysis for AI Fairness Evaluation Results
Performs chi-square tests and generates comprehensive statistics
"""

import json
import pandas as pd
import numpy as np
from scipy import stats
from collections import defaultdict
import sys

def load_results(filepath):
    """Load evaluation results from promptfoo output"""
    with open(filepath, 'r') as f:
        data = json.load(f)
    return data

def extract_scores(results):
    """Extract scores and metadata from results"""
    records = []
    
    for result in results.get('results', []):
        test_case = result.get('testCase', {})
        vars_data = test_case.get('vars', {})
        
        for output in result.get('outputs', []):
            provider = output.get('provider', {}).get('label', 'unknown')
            
            # Extract scores from gradingResults
            scores = {}
            for grading in output.get('gradingResults', []):
                metric = grading.get('metric', '')
                if metric in ['factual_correctness', 'inclusive_language', 'harmful_content']:
                    scores[metric] = grading.get('score', 0)
            
            # Extract metadata
            record = {
                'provider': provider,
                'demographic': vars_data.get('demographic_var', 'unknown'),
                'category': vars_data.get('category', 'unknown'),
                'prompt': vars_data.get('prompt', ''),
                'response_length': len(output.get('output', '')),
                **scores
            }
            
            # Calculate composite score
            if all(k in scores for k in ['factual_correctness', 'inclusive_language', 'harmful_content']):
                record['composite_score'] = (scores['factual_correctness'] + 
                                            scores['inclusive_language'] + 
                                            scores['harmful_content']) / 6
            
            records.append(record)
    
    return pd.DataFrame(records)

def chi_square_test_demographics(df, metric='composite_score'):
    """Perform chi-square test for score distribution across demographics"""
    # Create bins for scores
    bins = [0, 0.33, 0.67, 1.0]
    labels = ['low', 'medium', 'high']
    
    df['score_bin'] = pd.cut(df[metric], bins=bins, labels=labels)
    
    # Create contingency table
    contingency = pd.crosstab(df['demographic'], df['score_bin'])
    
    # Perform chi-square test
    chi2, p_value, dof, expected = stats.chi2_contingency(contingency)
    
    return {
        'chi2': chi2,
        'p_value': p_value,
        'degrees_of_freedom': dof,
        'contingency_table': contingency,
        'expected_frequencies': expected
    }

def response_length_analysis(df):
    """Analyze response length variations across demographics"""
    length_by_demo = df.groupby('demographic')['response_length'].agg(['mean', 'std', 'count'])
    
    # ANOVA test for response length differences
    demographics = df['demographic'].unique()
    groups = [df[df['demographic'] == d]['response_length'].values for d in demographics]
    f_stat, p_value = stats.f_oneway(*groups)
    
    return {
        'length_statistics': length_by_demo,
        'anova_f_statistic': f_stat,
        'anova_p_value': p_value
    }

def category_analysis(df):
    """Analyze scores by category"""
    category_scores = df.groupby(['category', 'provider']).agg({
        'factual_correctness': 'mean',
        'inclusive_language': 'mean',
        'harmful_content': 'mean',
        'composite_score': 'mean'
    }).round(3)
    
    return category_scores

def generate_report(df, chi_square_results, length_results, category_results):
    """Generate comprehensive statistical report"""
    report = []
    
    report.append("=" * 60)
    report.append("AI FAIRNESS EVALUATION - STATISTICAL ANALYSIS")
    report.append("=" * 60)
    report.append("")
    
    # Overall statistics
    report.append("OVERALL SCORES BY PROVIDER:")
    provider_scores = df.groupby('provider').agg({
        'composite_score': ['mean', 'std'],
        'factual_correctness': 'mean',
        'inclusive_language': 'mean',
        'harmful_content': 'mean'
    }).round(3)
    report.append(str(provider_scores))
    report.append("")
    
    # Chi-square test results
    report.append("CHI-SQUARE TEST - DEMOGRAPHIC PARITY:")
    report.append(f"Chi-square statistic: {chi_square_results['chi2']:.3f}")
    report.append(f"P-value: {chi_square_results['p_value']:.4f}")
    report.append(f"Degrees of freedom: {chi_square_results['degrees_of_freedom']}")
    
    if chi_square_results['p_value'] < 0.05:
        report.append("⚠️  SIGNIFICANT DISPARITY DETECTED (p < 0.05)")
    else:
        report.append("✅ No significant disparity detected (p >= 0.05)")
    report.append("")
    
    # Response length analysis
    report.append("RESPONSE LENGTH ANALYSIS:")
    report.append(f"ANOVA F-statistic: {length_results['anova_f_statistic']:.3f}")
    report.append(f"ANOVA p-value: {length_results['anova_p_value']:.4f}")
    
    if length_results['anova_p_value'] < 0.05:
        report.append("⚠️  SIGNIFICANT LENGTH VARIATION across demographics")
    else:
        report.append("✅ No significant length variation")
    report.append("")
    
    # Category breakdown
    report.append("SCORES BY CATEGORY:")
    report.append(str(category_results))
    report.append("")
    
    # Demographic breakdown
    report.append("DEMOGRAPHIC SCORE DISTRIBUTION:")
    demo_scores = df.groupby('demographic')['composite_score'].agg(['mean', 'std', 'count']).round(3)
    report.append(str(demo_scores))
    
    return "\n".join(report)

def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze_fairness_stats.py <results.json>")
        sys.exit(1)
    
    results_file = sys.argv[1]
    
    # Load and process results
    results = load_results(results_file)
    df = extract_scores(results)
    
    # Perform analyses
    chi_square_results = chi_square_test_demographics(df)
    length_results = response_length_analysis(df)
    category_results = category_analysis(df)
    
    # Generate and print report
    report = generate_report(df, chi_square_results, length_results, category_results)
    print(report)
    
    # Save detailed results
    df.to_csv('fairness_analysis_detailed.csv', index=False)
    print("\n📊 Detailed results saved to fairness_analysis_detailed.csv")

if __name__ == "__main__":
    main() 