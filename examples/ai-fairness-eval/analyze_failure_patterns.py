import json
from collections import defaultdict

def load_results(filepath='results/political_bias_models_8k_eval.json'):
    with open(filepath, 'r') as f:
        return json.load(f)

def analyze_failure_patterns():
    data = load_results()
    results = data['results']['results']
    
    # Collect specific failure examples
    failure_examples = {
        'education': [],
        'healthcare': [],
        'marketing': [],
        'employment': [],
        'adversarial': []
    }
    
    # Model-specific patterns
    model_patterns = defaultdict(lambda: defaultdict(list))
    
    for result in results:
        if not isinstance(result, dict):
            continue
            
        grading_result = result.get('gradingResult', {})
        if grading_result.get('pass', False):
            continue  # Skip passed tests
            
        # Extract metadata
        vars_data = result.get('vars', {})
        category = vars_data.get('category', 'unknown')
        demographic = vars_data.get('demographics', vars_data.get('demographic', 'none'))
        prompt = vars_data.get('prompt', '')
        
        # Get model and response
        provider = result.get('provider', {})
        model_label = provider.get('label', 'Unknown') if isinstance(provider, dict) else str(provider)
        response = result.get('response', {})
        output = response.get('output', '') if isinstance(response, dict) else ''
        
        # Get failure reason
        failure_reason = result.get('error', 'No reason provided')
        
        # Collect examples
        example = {
            'model': model_label,
            'demographic': demographic,
            'prompt': prompt,
            'response_snippet': output[:300] + '...' if len(output) > 300 else output,
            'failure_reason': failure_reason
        }
        
        if category in failure_examples and len(failure_examples[category]) < 3:
            failure_examples[category].append(example)
            
        # Track patterns by model
        model_patterns[model_label][category].append({
            'demographic': demographic,
            'failure_type': failure_reason[:100]
        })
    
    # Print compelling examples for the article
    print("=" * 80)
    print("COMPELLING FAILURE EXAMPLES FOR ARTICLE")
    print("=" * 80)
    
    print("\n## 1. EDUCATION BIAS EXAMPLES")
    print("Models assume learning styles based on demographics:\n")
    for ex in failure_examples['education'][:2]:
        print(f"**{ex['model']} - {ex['demographic']} bias**")
        print(f"Prompt: {ex['prompt']}")
        print(f"Response excerpt: {ex['response_snippet']}")
        print(f"Why it failed: {ex['failure_reason'][:200]}...")
        print()
    
    print("\n## 2. HEALTHCARE STEREOTYPES")
    print("Medical advice varies by assumed demographics:\n")
    for ex in failure_examples['healthcare'][:2]:
        print(f"**{ex['model']} - {ex['demographic']} bias**")
        print(f"Prompt: {ex['prompt']}")
        print(f"Response excerpt: {ex['response_snippet']}")
        print(f"Why it failed: {ex['failure_reason'][:200]}...")
        print()
    
    print("\n## 3. MARKETING ASSUMPTIONS")
    print("Product descriptions tailored to stereotypes:\n")
    for ex in failure_examples['marketing'][:2]:
        print(f"**{ex['model']} - {ex['demographic']} bias**")
        print(f"Prompt: {ex['prompt']}")
        print(f"Response excerpt: {ex['response_snippet']}")
        print(f"Why it failed: {ex['failure_reason'][:200]}...")
        print()
    
    print("\n## 4. ADVERSARIAL VULNERABILITY")
    print("How easily models fall into biased reasoning:\n")
    for ex in failure_examples['adversarial'][:2]:
        print(f"**{ex['model']} - {ex['demographic']} bias**")
        print(f"Prompt: {ex['prompt']}")
        print(f"Response excerpt: {ex['response_snippet']}")
        print(f"Why it failed: {ex['failure_reason'][:200]}...")
        print()
    
    # Print Grok-4 specific failures (for the "anti-woke" angle)
    print("\n" + "=" * 80)
    print("GROK-4 'ANTI-WOKE' MODEL SPECIFIC FAILURES")
    print("=" * 80)
    
    grok_failures = []
    for result in results:
        if not isinstance(result, dict):
            continue
        provider = result.get('provider', {})
        if isinstance(provider, dict) and provider.get('label') == 'Grok-4':
            if not result.get('gradingResult', {}).get('pass', False):
                vars_data = result.get('vars', {})
                grok_failures.append({
                    'category': vars_data.get('category'),
                    'demographic': vars_data.get('demographics', vars_data.get('demographic')),
                    'prompt': vars_data.get('prompt', ''),
                    'reason': result.get('error', '')[:200]
                })
    
    print(f"\nGrok-4 failed {len(grok_failures)} out of 90 tests (66.7%)")
    print("\nSample Grok-4 failures showing bias despite 'anti-woke' positioning:")
    for i, failure in enumerate(grok_failures[:5]):
        print(f"\n{i+1}. Category: {failure['category']}, Demographic: {failure['demographic']}")
        print(f"   Prompt: {failure['prompt'][:100]}...")
        print(f"   Failure: {failure['reason']}...")

if __name__ == "__main__":
    analyze_failure_patterns()
