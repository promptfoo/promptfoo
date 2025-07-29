import json
import sys
from pathlib import Path

def load_results(filepath):
    """Load evaluation results from JSON file"""
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        return None

def compare_judges():
    """Compare how different judge models scored the same responses"""
    
    # Load results from different judges - look in project root
    results_dir = Path('../../results')
    
    judge_results = {
        'GPT-4o-mini': load_results(results_dir / 'judge_gpt4omini.json'),
        'GPT-4o': load_results(results_dir / 'judge_gpt4o.json'),
    }
    
    # Check if we have valid results
    valid_results = {k: v for k, v in judge_results.items() if v is not None}
    
    if len(valid_results) < 2:
        print("Need at least 2 valid result files to compare")
        return
    
    print("# Judge Model Comparison Analysis\n")
    print(f"Comparing {len(valid_results)} judge models\n")
    
    # Create comparison table
    print("## Score Comparison by Test Case\n")
    print("| Test ID | Demographic | Category | GPT-4o-mini | GPT-4o | Agreement |")
    print("|---------|-------------|----------|-------------|---------|-----------|")
    
    # Get test cases from first result set
    first_judge = list(valid_results.keys())[0]
    test_cases = valid_results[first_judge]['results']['results']
    
    total_agreement = 0
    total_cases = 0
    
    for idx, test in enumerate(test_cases):
        test_id = test['vars']['id']
        demographic = test['vars'].get('demographic', 'N/A')
        category = test['vars']['category']
        
        # Get scores from each judge
        scores = {}
        reasons = {}
        
        for judge_name, results in valid_results.items():
            try:
                judge_test = results['results']['results'][idx]
                if judge_test['gradingResult'] and judge_test['gradingResult']['componentResults']:
                    component = judge_test['gradingResult']['componentResults'][0]
                    scores[judge_name] = '✓' if component['pass'] else '✗'
                    reasons[judge_name] = component.get('reason', 'No reason provided')
                else:
                    scores[judge_name] = '?'
                    reasons[judge_name] = 'No grading result'
            except:
                scores[judge_name] = 'ERR'
                reasons[judge_name] = 'Error in results'
        
        # Check agreement
        score_values = [v for v in scores.values() if v in ['✓', '✗']]
        agreement = '✓' if len(set(score_values)) == 1 and len(score_values) == len(scores) else '✗'
        
        if agreement == '✓':
            total_agreement += 1
        total_cases += 1
        
        # Print row
        print(f"| {test_id} | {demographic} | {category} | {scores.get('GPT-4o-mini', '?')} | {scores.get('GPT-4o', '?')} | {agreement} |")
    
    # Print summary statistics
    print(f"\n## Summary Statistics\n")
    print(f"- Total test cases: {total_cases}")
    print(f"- Agreement rate: {total_agreement}/{total_cases} ({total_agreement/total_cases*100:.1f}%)")
    
    # Analyze specific differences
    print("\n## Notable Differences\n")
    
    for idx, test in enumerate(test_cases):
        test_id = test['vars']['id']
        demographic = test['vars'].get('demographic', 'N/A')
        
        # Get pass/fail from each judge
        judge_decisions = {}
        judge_reasons = {}
        
        for judge_name, results in valid_results.items():
            try:
                judge_test = results['results']['results'][idx]
                if judge_test['gradingResult'] and judge_test['gradingResult']['componentResults']:
                    component = judge_test['gradingResult']['componentResults'][0]
                    judge_decisions[judge_name] = component['pass']
                    judge_reasons[judge_name] = component.get('reason', 'No reason')
            except:
                pass
        
        # If they disagree, show why
        if len(set(judge_decisions.values())) > 1:
            print(f"\n### {test_id} - {demographic}")
            print(f"**Prompt**: {test['vars']['prompt']}")
            print(f"**Response snippet**: {test['response']['output'][:150]}...")
            
            for judge, passed in judge_decisions.items():
                print(f"\n**{judge}**: {'PASS' if passed else 'FAIL'}")
                print(f"Reason: {judge_reasons[judge][:200]}...")
    
    # Analyze patterns
    print("\n## Pattern Analysis\n")
    
    # Check adversarial consistency
    adversarial_tests = [t for t in test_cases if t['vars']['category'] == 'adversarial']
    if adversarial_tests:
        print("### Adversarial Response Consistency")
        
        for judge_name in valid_results.keys():
            print(f"\n**{judge_name}:**")
            
            refusal_types = {}
            for idx, test in enumerate(test_cases):
                if test['vars']['category'] == 'adversarial':
                    try:
                        judge_test = valid_results[judge_name]['results']['results'][idx]
                        reason = judge_test['gradingResult']['componentResults'][0].get('reason', '')
                        
                        # Extract refusal type from reason
                        if 'HARD' in reason:
                            refusal_type = 'HARD'
                        elif 'SOFT' in reason:
                            refusal_type = 'SOFT'
                        else:
                            refusal_type = 'UNKNOWN'
                        
                        demographic = test['vars']['demographic']
                        refusal_types[demographic] = refusal_type
                        
                    except:
                        pass
            
            if refusal_types:
                print("Refusal types by demographic:")
                for demo, rtype in refusal_types.items():
                    print(f"  - {demo}: {rtype}")
                
                # Check consistency
                unique_types = set(refusal_types.values())
                if len(unique_types) == 1:
                    print("  ✓ Consistent refusal type across demographics")
                else:
                    print("  ✗ Inconsistent refusal types detected")

if __name__ == "__main__":
    compare_judges() 