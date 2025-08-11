#!/usr/bin/env python3
"""
Analysis of comprehensive model evaluation results
"""

import json
from collections import defaultdict

def load_results(filepath='results/comprehensive_model_eval.json'):
    """Load evaluation results"""
    with open(filepath, 'r') as f:
        return json.load(f)

def analyze_results():
    """Analyze comprehensive model evaluation results"""
    data = load_results()
    results = data['results']['results']
    
    print("🔬 COMPREHENSIVE MODEL EVALUATION ANALYSIS")
    print("=" * 80)
    
    # Overall statistics
    total_tests = len(results)
    passed = 0
    failed = 0
    errors = 0
    
    # Model-specific stats
    model_stats = defaultdict(lambda: {'total': 0, 'passed': 0, 'failed': 0, 'errors': 0})
    
    # Test type stats
    test_type_stats = defaultdict(lambda: {'total': 0, 'passed': 0, 'failed': 0, 'errors': 0})
    
    # Demographic stats
    demo_stats = defaultdict(lambda: {'total': 0, 'passed': 0, 'failed': 0, 'errors': 0})
    
    for result in results:
        test_type = result['vars']['test_type']
        demographic = result['vars']['demographic']
        
        # Count overall results
        if result.get('error'):
            errors += 1
            status = 'errors'
        elif result.get('gradingResult') and result['gradingResult'].get('pass'):
            passed += 1
            status = 'passed'
        else:
            failed += 1
            status = 'failed'
        
        # Count by model
        provider = result['provider']
        if isinstance(provider, dict):
            model_label = provider['label']
            model_stats[model_label]['total'] += 1
            model_stats[model_label][status] += 1
        elif isinstance(provider, list):
            for p in provider:
                model_label = p['label']
                model_stats[model_label]['total'] += 1
                model_stats[model_label][status] += 1
        
        # Count by test type
        test_type_stats[test_type]['total'] += 1
        test_type_stats[test_type][status] += 1
        
        # Count by demographic
        demo_stats[demographic]['total'] += 1
        demo_stats[demographic][status] += 1
    
    print(f"\n📊 OVERALL RESULTS")
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed} ({passed/total_tests*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total_tests*100:.1f}%)")
    print(f"Errors: {errors} ({errors/total_tests*100:.1f}%)")
    
    print(f"\n📊 MODEL PERFORMANCE")
    for model, stats in sorted(model_stats.items()):
        total = stats['total']
        if total > 0:
            pass_rate = stats['passed'] / total * 100
            error_rate = stats['errors'] / total * 100
            print(f"\n{model}:")
            print(f"  Total: {total}")
            print(f"  Pass rate: {pass_rate:.1f}%")
            print(f"  Error rate: {error_rate:.1f}%")
            if stats['errors'] > 0:
                print(f"  Errors: {stats['errors']}")
    
    print(f"\n📈 PERFORMANCE BY TEST TYPE")
    for test_type, stats in sorted(test_type_stats.items()):
        total = stats['total']
        pass_rate = stats['passed'] / total * 100 if total > 0 else 0
        print(f"\n{test_type}:")
        print(f"  Total: {total}")
        print(f"  Pass rate: {pass_rate:.1f}%")
        if stats['errors'] > 0:
            print(f"  Errors: {stats['errors']}")
    
    print(f"\n🌍 PERFORMANCE BY DEMOGRAPHIC (Top 5 Best/Worst)")
    
    # Sort demographics by pass rate
    demo_pass_rates = []
    for demo, stats in demo_stats.items():
        if stats['total'] > 0:
            pass_rate = stats['passed'] / stats['total'] * 100
            demo_pass_rates.append((demo, pass_rate, stats['total']))
    
    demo_pass_rates.sort(key=lambda x: x[1], reverse=True)
    
    print("\nBest performing demographics:")
    for demo, pass_rate, total in demo_pass_rates[:5]:
        print(f"  {demo}: {pass_rate:.1f}% pass rate ({total} tests)")
    
    print("\nWorst performing demographics:")
    for demo, pass_rate, total in demo_pass_rates[-5:]:
        print(f"  {demo}: {pass_rate:.1f}% pass rate ({total} tests)")
    
    # Analyze specific errors
    print(f"\n❌ ERROR ANALYSIS")
    error_types = defaultdict(int)
    
    for result in results:
        if result.get('error'):
            error_msg = str(result['error'])
            if 'max_tokens 8000 > 4096' in error_msg:
                error_types['Token limit exceeded'] += 1
            elif '401 Unauthorized' in error_msg:
                error_types['API authentication'] += 1
            elif 'parsing response' in error_msg:
                error_types['Response parsing'] += 1
            else:
                error_types['Other'] += 1
    
    for error_type, count in sorted(error_types.items(), key=lambda x: x[1], reverse=True):
        print(f"  {error_type}: {count} occurrences")
    
    # Sample outputs analysis
    print(f"\n💬 SAMPLE OUTPUTS")
    
    # Find successful outputs
    successful_results = [r for r in results if not r.get('error') and r.get('response') and r['response'].get('output')]
    
    if successful_results:
        print("\nExample successful response (GPT-4o-mini on control question):")
        for result in successful_results[:1]:
            if result['vars']['test_type'] == 'control':
                print(f"Prompt: {result['prompt'][:100]}...")
                print(f"Response preview: {result['response']['output'][:200]}...")
                break
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    analyze_results() 