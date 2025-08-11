import json
from collections import defaultdict

def load_results(filepath='results/political_bias_models_8k_eval.json'):
    with open(filepath, 'r') as f:
        return json.load(f)

def analyze_results():
    data = load_results()
    results = data['results']['results']
    
    # Overall stats
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
        'category_stats': defaultdict(lambda: {'passed': 0, 'failed': 0, 'errors': 0})
    })
    
    # Category stats
    category_stats = defaultdict(lambda: {'passed': 0, 'failed': 0, 'errors': 0})
    
    # Demographic bias detection
    demographic_failures = defaultdict(list)
    
    for result in results:
        # Skip if result is not a dictionary
        if not isinstance(result, dict):
            continue
            
        # Extract test metadata
        vars_data = result.get('vars', {})
        category = vars_data.get('category', 'unknown')
        demographic = vars_data.get('demographics', 'none')
        test_type = vars_data.get('test_type', 'unknown')
        prompt = vars_data.get('prompt', '')
        
        # Determine status
        if result.get('error'):
            errors += 1
            status = 'errors'
        elif result.get('gradingResult') and result['gradingResult'].get('pass'):
            passed += 1
            status = 'passed'
        else:
            failed += 1
            status = 'failed'
            
        # Update category stats
        category_stats[category][status] += 1
        
        # Track demographic failures
        if status == 'failed' and demographic != 'none':
            demographic_failures[demographic].append({
                'prompt': prompt,
                'category': category,
                'model': result.get('provider', {}).get('label', 'Unknown')
            })
        
        # Update model stats
        provider = result.get('provider', {})
        if isinstance(provider, dict):
            model_label = provider.get('label', 'Unknown')
            model_stats[model_label]['total'] += 1
            model_stats[model_label][status] += 1
            model_stats[model_label]['category_stats'][category][status] += 1
    
    # Print results
    print("=" * 80)
    print("COMPREHENSIVE AI FAIRNESS EVALUATION RESULTS")
    print("=" * 80)
    
    print(f"\nOverall Results:")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed} ({passed/total_tests*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total_tests*100:.1f}%)")
    print(f"Errors: {errors} ({errors/total_tests*100:.1f}%)")
    
    print("\n" + "=" * 80)
    print("MODEL PERFORMANCE BREAKDOWN")
    print("=" * 80)
    
    for model, stats in sorted(model_stats.items()):
        if stats['total'] == 0:
            continue
            
        print(f"\n{model}:")
        print(f"  Total Tests: {stats['total']}")
        print(f"  Passed: {stats['passed']} ({stats['passed']/stats['total']*100:.1f}%)")
        print(f"  Failed: {stats['failed']} ({stats['failed']/stats['total']*100:.1f}%)")
        print(f"  Errors: {stats['errors']} ({stats['errors']/stats['total']*100:.1f}%)")
        
        print(f"\n  Category Breakdown:")
        for category, cat_stats in sorted(stats['category_stats'].items()):
            total_cat = cat_stats['passed'] + cat_stats['failed'] + cat_stats['errors']
            if total_cat > 0:
                print(f"    {category}: {cat_stats['failed']} failures out of {total_cat} tests ({cat_stats['failed']/total_cat*100:.1f}% failure rate)")
    
    print("\n" + "=" * 80)
    print("DEMOGRAPHIC BIAS ANALYSIS")
    print("=" * 80)
    
    if demographic_failures:
        print("\nTests that failed on demographic groups:")
        for demographic, failures in demographic_failures.items():
            print(f"\n{demographic}: {len(failures)} failures")
            # Show sample failures
            for failure in failures[:3]:
                print(f"  - Model: {failure['model']}")
                print(f"    Category: {failure['category']}")
                print(f"    Prompt: {failure['prompt'][:100]}...")
    else:
        print("\nNo demographic-specific failures detected!")
    
    print("\n" + "=" * 80)
    print("KEY FINDINGS")
    print("=" * 80)
    
    # Find best and worst performing models
    model_pass_rates = {}
    for model, stats in model_stats.items():
        if stats['total'] > 0:
            model_pass_rates[model] = stats['passed'] / stats['total']
    
    if model_pass_rates:
        best_model = max(model_pass_rates, key=model_pass_rates.get)
        worst_model = min(model_pass_rates, key=model_pass_rates.get)
        
        print(f"\nBest Performing Model: {best_model} ({model_pass_rates[best_model]*100:.1f}% pass rate)")
        print(f"Worst Performing Model: {worst_model} ({model_pass_rates[worst_model]*100:.1f}% pass rate)")
    
    # Check for systematic bias
    treatment_failures = sum(1 for cat, stats in category_stats.items() 
                           if 'treatment' in cat for _ in range(stats['failed']))
    control_failures = sum(1 for cat, stats in category_stats.items() 
                          if 'control' in cat for _ in range(stats['failed']))
    
    print(f"\nSystematic Bias Check:")
    print(f"Treatment group failures: {treatment_failures}")
    print(f"Control group failures: {control_failures}")
    
    if treatment_failures > control_failures * 1.5:
        print("⚠️  POTENTIAL DEMOGRAPHIC BIAS DETECTED: Treatment groups failing at higher rates")
    elif treatment_failures > 0:
        print("✓ Some demographic sensitivity detected, but not systematic")
    else:
        print("✓ No significant demographic bias detected")
    
    return data

if __name__ == "__main__":
    analyze_results()
