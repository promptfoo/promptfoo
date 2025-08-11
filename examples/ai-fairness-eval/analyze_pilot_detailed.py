#!/usr/bin/env python3
"""
Detailed analysis of pilot multi-judge evaluation results
Focuses on judge agreement and specific bias patterns
"""

import json
import pandas as pd
from collections import defaultdict
import statistics

def load_results(filepath='results/pilot_multi_judge_results.json'):
    """Load pilot evaluation results"""
    with open(filepath, 'r') as f:
        return json.load(f)

def analyze_judge_scores():
    """Analyze judge agreement and scoring patterns"""
    data = load_results()
    results = data['results']['results']
    
    print("🔬 PILOT EVALUATION DETAILED ANALYSIS")
    print("=" * 80)
    
    # Overall statistics
    total_tests = len(results)
    passed = sum(1 for r in results if r['gradingResult']['pass'])
    failed = total_tests - passed
    
    print(f"\n📊 OVERALL RESULTS")
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed} ({passed/total_tests*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total_tests*100:.1f}%)")
    
    # Analyze failures by demographic
    failures_by_demo = defaultdict(list)
    for result in results:
        if not result['gradingResult']['pass']:
            demo = result['vars']['demographic']
            failures_by_demo[demo].append({
                'prompt': result['vars']['prompt'],
                'test_type': result['vars']['test_type'],
                'category': result['vars']['category']
            })
    
    print(f"\n❌ FAILURES BY DEMOGRAPHIC")
    for demo, failures in sorted(failures_by_demo.items()):
        print(f"\n{demo} ({len(failures)} failures):")
        for i, fail in enumerate(failures[:3]):  # Show first 3
            print(f"  {i+1}. {fail['prompt'][:60]}...")
            print(f"     Type: {fail['test_type']}, Category: {fail['category']}")
    
    # Analyze judge scoring patterns
    print(f"\n👨‍⚖️ JUDGE SCORING ANALYSIS")
    
    judge_scores = defaultdict(lambda: {
        'total': 0,
        'passed': 0,
        'scores': []
    })
    
    for result in results:
        if 'namedScores' in result['gradingResult']:
            for metric, score in result['gradingResult']['namedScores'].items():
                if '_' in metric:
                    judge_name = metric.split('_')[0]
                    dimension = '_'.join(metric.split('_')[1:])
                    
                    judge_scores[judge_name]['total'] += 1
                    if score > 0:  # Assuming score > 0 means pass
                        judge_scores[judge_name]['passed'] += 1
                    judge_scores[judge_name]['scores'].append(score)
    
    for judge, stats in judge_scores.items():
        if stats['total'] > 0:
            pass_rate = stats['passed'] / stats['total'] * 100
            avg_score = statistics.mean(stats['scores']) if stats['scores'] else 0
            
            print(f"\n{judge}:")
            print(f"  Evaluations: {stats['total']}")
            print(f"  Pass rate: {pass_rate:.1f}%")
            print(f"  Average score: {avg_score:.2f}")
    
    # Compare judge agreement on specific dimensions
    print(f"\n🤝 JUDGE AGREEMENT ANALYSIS")
    
    dimension_agreement = defaultdict(lambda: {
        'agree': 0,
        'disagree': 0,
        'examples': []
    })
    
    for result in results:
        scores = result['gradingResult'].get('namedScores', {})
        
        # Look for common dimensions evaluated by multiple judges
        dimensions = defaultdict(list)
        for metric, score in scores.items():
            if '_' in metric:
                parts = metric.split('_', 1)
                judge = parts[0]
                dimension = parts[1]
                dimensions[dimension].append((judge, score))
        
        # Check agreement
        for dimension, judge_scores in dimensions.items():
            if len(judge_scores) >= 2:
                # Simple agreement: all judges gave same score
                scores_only = [s[1] for s in judge_scores]
                if all(s == scores_only[0] for s in scores_only):
                    dimension_agreement[dimension]['agree'] += 1
                else:
                    dimension_agreement[dimension]['disagree'] += 1
                    if len(dimension_agreement[dimension]['examples']) < 3:
                        dimension_agreement[dimension]['examples'].append({
                            'prompt': result['vars']['prompt'][:50] + '...',
                            'demographic': result['vars']['demographic'],
                            'scores': judge_scores
                        })
    
    for dimension, stats in sorted(dimension_agreement.items()):
        total = stats['agree'] + stats['disagree']
        if total > 0:
            agreement_rate = stats['agree'] / total * 100
            print(f"\n{dimension}:")
            print(f"  Agreement rate: {agreement_rate:.1f}% ({stats['agree']}/{total})")
            
            if stats['examples']:
                print(f"  Disagreement examples:")
                for ex in stats['examples']:
                    print(f"    - {ex['prompt']} ({ex['demographic']})")
                    for judge, score in ex['scores']:
                        print(f"      {judge}: {score}")
    
    # Analyze patterns in failed tests
    print(f"\n🔍 FAILURE PATTERN ANALYSIS")
    
    failure_patterns = defaultdict(int)
    for result in results:
        if not result['gradingResult']['pass']:
            # Extract reason from gradingResult if available
            reason = result['gradingResult'].get('reason', 'No reason provided')
            
            # Categorize failure reasons
            if 'assumption' in reason.lower():
                failure_patterns['Assumption bias'] += 1
            elif 'differential' in reason.lower() or 'different' in reason.lower():
                failure_patterns['Differential treatment'] += 1
            elif 'stereotype' in reason.lower():
                failure_patterns['Stereotyping'] += 1
            elif 'explicit' in reason.lower() or 'target' in reason.lower():
                failure_patterns['Explicit targeting'] += 1
            else:
                failure_patterns['Other'] += 1
    
    for pattern, count in sorted(failure_patterns.items(), key=lambda x: x[1], reverse=True):
        print(f"  {pattern}: {count} cases")
    
    # Test type performance
    print(f"\n📈 PERFORMANCE BY TEST TYPE")
    
    test_type_stats = defaultdict(lambda: {'total': 0, 'passed': 0})
    
    for result in results:
        test_type = result['vars']['test_type']
        test_type_stats[test_type]['total'] += 1
        if result['gradingResult']['pass']:
            test_type_stats[test_type]['passed'] += 1
    
    for test_type, stats in sorted(test_type_stats.items()):
        pass_rate = stats['passed'] / stats['total'] * 100
        print(f"\n{test_type}:")
        print(f"  Total: {stats['total']}")
        print(f"  Pass rate: {pass_rate:.1f}%")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    analyze_judge_scores() 