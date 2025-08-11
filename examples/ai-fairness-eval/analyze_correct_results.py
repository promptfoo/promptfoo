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
    
    # Model-specific stats
    model_stats = defaultdict(lambda: {
        'total': 0, 
        'passed': 0, 
        'failed': 0, 
        'category_stats': defaultdict(lambda: {'passed': 0, 'failed': 0}),
        'demographic_failures': defaultdict(list)
    })
    
    # Category stats
    category_stats = defaultdict(lambda: {'passed': 0, 'failed': 0})
    
    # Demographic bias detection
    demographic_failures = defaultdict(list)
    
    for result in results:
        # Skip if result is not a dictionary
        if not isinstance(result, dict):
            continue
            
        # Extract test metadata
        vars_data = result.get('vars', {})
        category = vars_data.get('category', 'unknown')
        demographic = vars_data.get('demographics', vars_data.get('demographic', 'none'))
        test_type = vars_data.get('test_type', 'unknown')
        prompt = vars_data.get('prompt', '')
        
        # Determine status - if gradingResult.pass is false, it's a failure regardless of error field
        grading_result = result.get('gradingResult', {})
        if grading_result.get('pass', False):
            passed += 1
            status = 'passed'
        else:
            failed += 1
            status = 'failed'
            
        # Update category stats
        category_stats[category][status] += 1
        
        # Get model info
        provider = result.get('provider', {})
        if isinstance(provider, dict):
            model_label = provider.get('label', 'Unknown')
        else:
            model_label = str(provider)
            
        # Update model stats
        model_stats[model_label]['total'] += 1
        model_stats[model_label][status] += 1
        model_stats[model_label]['category_stats'][category][status] += 1
        
        # Track demographic failures
        if status == 'failed' and demographic != 'none':
            failure_info = {
                'prompt': prompt,
                'category': category,
                'model': model_label,
                'reason': result.get('error', 'No reason provided')
            }
            demographic_failures[demographic].append(failure_info)
            model_stats[model_label]['demographic_failures'][demographic].append(failure_info)
    
    # Print results
    print("=" * 80)
    print("COMPREHENSIVE AI FAIRNESS EVALUATION RESULTS - 8K TOKEN LIMIT")
    print("=" * 80)
    
    print(f"\nOverall Results:")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed} ({passed/total_tests*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total_tests*100:.1f}%)")
    
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
        
        print(f"\n  Category Breakdown:")
        for category, cat_stats in sorted(stats['category_stats'].items()):
            total_cat = cat_stats['passed'] + cat_stats['failed']
            if total_cat > 0:
                print(f"    {category}: {cat_stats['failed']} failures out of {total_cat} tests ({cat_stats['failed']/total_cat*100:.1f}% failure rate)")
        
        if stats['demographic_failures']:
            print(f"\n  Demographic Failures:")
            for demo, failures in stats['demographic_failures'].items():
                print(f"    {demo}: {len(failures)} failures")
    
    print("\n" + "=" * 80)
    print("DEMOGRAPHIC BIAS ANALYSIS")
    print("=" * 80)
    
    if demographic_failures:
        print("\nTests that failed on demographic groups:")
        for demographic, failures in demographic_failures.items():
            print(f"\n{demographic}: {len(failures)} failures")
            # Show sample failures
            for i, failure in enumerate(failures[:2]):
                print(f"  Example {i+1}:")
                print(f"    Model: {failure['model']}")
                print(f"    Category: {failure['category']}")
                print(f"    Prompt: {failure['prompt'][:80]}...")
                print(f"    Reason: {failure['reason'][:150]}...")
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
    treatment_count = defaultdict(int)
    control_count = defaultdict(int)
    
    for cat, stats in category_stats.items():
        if test_type in ['treatment', 'comparison']:
            treatment_count['total'] += stats['passed'] + stats['failed']
            treatment_count['failed'] += stats['failed']
        else:
            control_count['total'] += stats['passed'] + stats['failed']
            control_count['failed'] += stats['failed']
    
    print(f"\nSystematic Bias Check:")
    if treatment_count['total'] > 0:
        treatment_failure_rate = treatment_count['failed'] / treatment_count['total'] * 100
        print(f"Treatment/Comparison group failure rate: {treatment_failure_rate:.1f}%")
    if control_count['total'] > 0:
        control_failure_rate = control_count['failed'] / control_count['total'] * 100
        print(f"Control group failure rate: {control_failure_rate:.1f}%")
    
    # Count adversarial failures
    adversarial_failures = category_stats.get('adversarial', {}).get('failed', 0)
    adversarial_total = category_stats.get('adversarial', {}).get('passed', 0) + adversarial_failures
    if adversarial_total > 0:
        print(f"\nAdversarial Test Performance:")
        print(f"Failed {adversarial_failures} out of {adversarial_total} adversarial tests ({adversarial_failures/adversarial_total*100:.1f}%)")
    
    return data

if __name__ == "__main__":
    analyze_results()
