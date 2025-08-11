#!/usr/bin/env python3
"""
Analysis of political bias models evaluation with 8k tokens
"""

import json
from collections import defaultdict

def load_results(filepath='results/political_bias_models_8k_eval.json'):
    """Load evaluation results"""
    with open(filepath, 'r') as f:
        return json.load(f)

def analyze_results():
    """Analyze political bias models evaluation results"""
    data = load_results()
    results = data['results']['results']
    
    print("🔬 POLITICAL BIAS MODELS 8K EVALUATION ANALYSIS")
    print("=" * 80)
    
    # Overall statistics
    total_tests = len(results)
    passed = 0
    failed = 0
    errors = 0
    
    # Model-specific stats
    model_stats = defaultdict(lambda: {
        'total': 0, 
        'passed': 0, 
        'failed': 0, 
        'errors': 0,
        'responses': []
    })
    
    # Analyze each result
    for result in results:
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
            
            # Store successful responses for analysis
            if not result.get('error') and result.get('response'):
                model_stats[model_label]['responses'].append({
                    'prompt': result['vars']['prompt'],
                    'demographic': result['vars']['demographic'],
                    'test_type': result['vars']['test_type'],
                    'output': result['response'].get('output', ''),
                    'passed': result.get('gradingResult', {}).get('pass', False),
                    'reason': result.get('gradingResult', {}).get('reason', '')
                })
    
    print(f"\n📊 OVERALL RESULTS")
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed} ({passed/total_tests*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total_tests*100:.1f}%)")
    print(f"Errors: {errors} ({errors/total_tests*100:.1f}%)")
    
    # Model breakdown
    print(f"\n📈 MODEL PERFORMANCE")
    for model, stats in sorted(model_stats.items()):
        print(f"\n{model}:")
        print(f"  Total: {stats['total']}")
        if stats['total'] > 0:
            print(f"  Passed: {stats['passed']} ({stats['passed']/stats['total']*100:.1f}%)")
            print(f"  Failed: {stats['failed']} ({stats['failed']/stats['total']*100:.1f}%)")
            print(f"  Errors: {stats['errors']} ({stats['errors']/stats['total']*100:.1f}%)")
    
    # Analyze GPT-4.1 responses in detail
    gpt4_stats = model_stats.get('GPT-4.1', {})
    if gpt4_stats.get('responses'):
        print(f"\n🔍 GPT-4.1 DETAILED ANALYSIS")
        
        # Group by test type
        test_type_results = defaultdict(lambda: {'passed': 0, 'failed': 0})
        demographic_results = defaultdict(lambda: {'passed': 0, 'failed': 0})
        
        for resp in gpt4_stats['responses']:
            test_type = resp['test_type']
            demographic = resp['demographic']
            
            if resp['passed']:
                test_type_results[test_type]['passed'] += 1
                demographic_results[demographic]['passed'] += 1
            else:
                test_type_results[test_type]['failed'] += 1
                demographic_results[demographic]['failed'] += 1
        
        print(f"\nBy Test Type:")
        for test_type, results in sorted(test_type_results.items()):
            total = results['passed'] + results['failed']
            pass_rate = results['passed'] / total * 100 if total > 0 else 0
            print(f"  {test_type}: {pass_rate:.1f}% pass ({results['passed']}/{total})")
        
        print(f"\nBy Demographic:")
        for demo, results in sorted(demographic_results.items()):
            total = results['passed'] + results['failed']
            pass_rate = results['passed'] / total * 100 if total > 0 else 0
            print(f"  {demo}: {pass_rate:.1f}% pass ({results['passed']}/{total})")
        
        # Show example failures
        print(f"\n❌ EXAMPLE FAILURES:")
        failures = [r for r in gpt4_stats['responses'] if not r['passed']][:5]
        
        for i, fail in enumerate(failures, 1):
            print(f"\n{i}. Prompt: {fail['prompt'][:100]}...")
            print(f"   Demographic: {fail['demographic']}")
            print(f"   Test Type: {fail['test_type']}")
            print(f"   Output Preview: {fail['output'][:200]}...")
            print(f"   Reason: {fail['reason'][:200]}...")
    
    # Error analysis
    print(f"\n⚠️ ERROR ANALYSIS")
    error_types = defaultdict(int)
    
    for result in results:
        if result.get('error'):
            error_msg = str(result['error'])[:100]
            if 'Google API key' in error_msg:
                error_types['Google/Gemini API key not set'] += 1
            elif 'Anthropic API key' in error_msg:
                error_types['Anthropic API key not set'] += 1
            elif '400 Bad Request' in error_msg:
                error_types['Grok-4 API key invalid'] += 1
            else:
                error_types['Other'] += 1
    
    for error_type, count in sorted(error_types.items(), key=lambda x: x[1], reverse=True):
        print(f"  {error_type}: {count} occurrences")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    analyze_results() 