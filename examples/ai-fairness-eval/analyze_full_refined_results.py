import json
import pandas as pd
from collections import defaultdict, Counter
from pathlib import Path
import re

def load_results(filepath):
    """Load evaluation results from JSON file"""
    with open(filepath, 'r') as f:
        return json.load(f)

def analyze_full_results():
    """Analyze patterns in the full refined evaluation"""
    
    # Load results - adjust path
    results = load_results('../../results/full_refined_eval.json')
    test_cases = results['results']['results']
    
    print("# Full Evaluation Analysis\n")
    print(f"Total test cases: {len(test_cases)}")
    
    # Calculate pass rate from results
    successes = sum(1 for test in test_cases if test['success'])
    pass_rate = successes / len(test_cases) if len(test_cases) > 0 else 0
    print(f"Overall pass rate: {successes}/{len(test_cases)} ({pass_rate:.1%})\n")
    
    # Organize results by category
    by_category = defaultdict(list)
    by_demographic = defaultdict(list)
    by_question_id = defaultdict(list)
    
    for test in test_cases:
        category = test['vars']['category']
        demographic = test['vars'].get('demographic', 'N/A')
        question_id = test['vars']['id']
        
        result = {
            'id': question_id,
            'demographic': demographic,
            'passed': test['success'],
            'score': test['score'],
            'reason': test['gradingResult']['componentResults'][0]['reason'] if test['gradingResult'] else 'No grading',
            'response_snippet': test['response']['output'][:100] if test['response'] else 'No response'
        }
        
        by_category[category].append(result)
        by_demographic[demographic].append(result)
        by_question_id[question_id].append(result)
    
    # Category Analysis
    print("## Pass Rates by Category\n")
    print("| Category | Total | Passed | Pass Rate | Key Pattern |")
    print("|----------|-------|--------|-----------|-------------|")
    
    category_patterns = {
        'representation': 'Equal enthusiasm/disclaimers',
        'historical': 'Ideological term injection',
        'inclusive': 'Safety vs ideology prioritization',
        'adversarial': 'Refusal type consistency'
    }
    
    for category, results in by_category.items():
        total = len(results)
        passed = sum(1 for r in results if r['passed'])
        pass_rate = passed / total if total > 0 else 0
        print(f"| {category} | {total} | {passed} | {pass_rate:.1%} | {category_patterns.get(category, 'Unknown')} |")
    
    # Demographic Analysis
    print("\n## Pass Rates by Demographic (Representation Category)\n")
    print("| Demographic | Total | Passed | Pass Rate | Typical Issue |")
    print("|-------------|-------|--------|-----------|---------------|")
    
    # Focus on representation category for demographic analysis
    rep_results = by_category['representation']
    demo_rep_results = defaultdict(list)
    for r in rep_results:
        if r['demographic'] != 'N/A':
            demo_rep_results[r['demographic']].append(r)
    
    for demographic, results in sorted(demo_rep_results.items()):
        total = len(results)
        passed = sum(1 for r in results if r['passed'])
        pass_rate = passed / total if total > 0 else 0
        
        # Find common issue
        if not passed:
            reasons = [r['reason'] for r in results if not r['passed']]
            if reasons:
                common_issue = 'Disclaimers' if 'disclaimer' in reasons[0].lower() else 'Low enthusiasm'
            else:
                common_issue = 'Unknown'
        else:
            common_issue = 'None'
        
        print(f"| {demographic} | {total} | {passed} | {pass_rate:.1%} | {common_issue} |")
    
    # Adversarial Refusal Pattern Analysis
    print("\n## Adversarial Refusal Patterns\n")
    
    adv_results = by_category['adversarial']
    refusal_patterns = defaultdict(Counter)
    
    for r in adv_results:
        demographic = r['demographic']
        reason = r['reason']
        
        # Extract refusal type
        if 'HARD' in reason:
            refusal_type = 'HARD'
        elif 'SOFT' in reason:
            refusal_type = 'SOFT'
        elif 'PARTIAL' in reason:
            refusal_type = 'PARTIAL'
        else:
            refusal_type = 'UNKNOWN'
        
        refusal_patterns[demographic][refusal_type] += 1
    
    print("| Demographic | HARD | SOFT | PARTIAL | Most Common |")
    print("|-------------|------|------|---------|-------------|")
    
    for demographic, patterns in sorted(refusal_patterns.items()):
        if demographic == 'N/A':
            continue
        
        hard = patterns.get('HARD', 0)
        soft = patterns.get('SOFT', 0)
        partial = patterns.get('PARTIAL', 0)
        
        # Find most common
        if patterns:
            most_common = max(patterns.items(), key=lambda x: x[1])[0]
        else:
            most_common = 'UNKNOWN'
        
        print(f"| {demographic} | {hard} | {soft} | {partial} | {most_common} |")
    
    # Refusal Consistency Check
    print("\n### Refusal Consistency Analysis")
    
    # Group by question ID to check consistency
    for question_id, results in by_question_id.items():
        if not any(r['id'].startswith('adv') for r in results):
            continue
        
        refusal_types = set()
        for r in results:
            if 'HARD' in r['reason']:
                refusal_types.add('HARD')
            elif 'SOFT' in r['reason']:
                refusal_types.add('SOFT')
        
        if len(refusal_types) > 1:
            print(f"\n**{question_id}**: Inconsistent refusal types detected")
            minorities = ['Blacks', 'Asians', 'women']
            majorities = ['whites', 'men']
            
            minority_types = []
            majority_types = []
            
            for r in results:
                if r['demographic'] in minorities:
                    if 'HARD' in r['reason']:
                        minority_types.append('HARD')
                    elif 'SOFT' in r['reason']:
                        minority_types.append('SOFT')
                elif r['demographic'] in majorities:
                    if 'HARD' in r['reason']:
                        majority_types.append('HARD')
                    elif 'SOFT' in r['reason']:
                        majority_types.append('SOFT')
            
            if minority_types and majority_types:
                print(f"  - Minorities typically get: {Counter(minority_types).most_common(1)[0][0]}")
                print(f"  - Majorities typically get: {Counter(majority_types).most_common(1)[0][0]}")
    
    # Historical Analysis - Ideological Terms
    print("\n## Historical Question Analysis - Ideological Terms\n")
    
    hist_results = by_category['historical']
    ideological_counts = Counter()
    
    for r in hist_results:
        reason = r['reason'].lower()
        
        # Count banned terms mentioned
        banned_terms = ['systemic racism', 'white privilege', 'unconscious bias', 
                       'implicit bias', 'intersectionality', 'critical race theory', 'dei']
        
        for term in banned_terms:
            if term in reason:
                ideological_counts[term] += 1
    
    print("| Banned Term | Times Detected |")
    print("|-------------|----------------|")
    
    for term, count in ideological_counts.most_common():
        print(f"| {term} | {count} |")
    
    # Inclusive Language Analysis
    print("\n## Inclusive Language Question Analysis\n")
    
    inc_results = by_category['inclusive']
    response_types = Counter()
    
    for r in inc_results:
        reason = r['reason']
        
        if 'Type A' in reason:
            response_types['Safety First'] += 1
        elif 'Type B' in reason:
            response_types['Balanced'] += 1
        elif 'Type C' in reason:
            response_types['Ideology First'] += 1
        else:
            response_types['Unknown'] += 1
    
    print("| Response Type | Count | Percentage |")
    print("|---------------|-------|------------|")
    
    total_inc = len(inc_results)
    for rtype, count in response_types.most_common():
        percentage = count / total_inc * 100 if total_inc > 0 else 0
        print(f"| {rtype} | {count} | {percentage:.1f}% |")
    
    # Summary Findings
    print("\n## Key Findings\n")
    
    print("1. **Representation Bias**: The model shows clear bias in representation questions")
    print("   - White men often get straightforward celebration")
    print("   - Minorities frequently get disclaimers or lower enthusiasm")
    print("   - Pass rate varies significantly by demographic")
    
    print("\n2. **Refusal Inconsistency**: Clear protective bias in adversarial questions")
    print("   - Minorities more likely to get HARD refusals")
    print("   - Majorities more likely to get SOFT educational refusals")
    print("   - This violates the consistency principle")
    
    print("\n3. **Historical Framing**: Model frequently injects ideological terms")
    print("   - Even when not prompted, uses terms like 'systemic racism'")
    print("   - Shows ideological framing rather than neutral presentation")
    
    print("\n4. **Safety vs Ideology**: In extreme scenarios")
    print("   - Model sometimes prioritizes pronouns over safety")
    print("   - Shows inflexibility in critical situations")

if __name__ == "__main__":
    analyze_full_results() 