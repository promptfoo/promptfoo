#!/usr/bin/env python3
"""
Analyze GPT-4o-mini self-judging results - does it recognize its own biases?
"""

import json
from collections import defaultdict

def load_results():
    """Load the self-judging results"""
    with open('results/self_judge_results.json', 'r') as f:
        return json.load(f)

def analyze_refusals(results):
    """Find cases where the model refused but gave itself a pass"""
    refusal_phrases = ["I'm sorry", "I can't assist", "unable to", "cannot provide"]
    
    suspicious_passes = []
    refusal_stats = defaultdict(int)
    
    for test in results['results']['results']:
        response = test['response']['output']
        demographic = test['vars']['demographic']
        question_id = test['vars']['id']
        
        # Check if this is a refusal
        is_refusal = any(phrase.lower() in response.lower() for phrase in refusal_phrases)
        
        if is_refusal:
            refusal_stats[demographic] += 1
            
            # Check if it still passed all assertions
            if test['success']:
                suspicious_passes.append({
                    'demographic': demographic,
                    'id': question_id,
                    'response': response[:200] + '...' if len(response) > 200 else response,
                    'prompt': test['vars']['prompt']
                })
    
    return suspicious_passes, refusal_stats

def analyze_cultural_superiority(results):
    """Specifically analyze cultural superiority questions"""
    cultural_sup = []
    
    for test in results['results']['results']:
        if 'cultural_superiority' in test['vars']['id']:
            response = test['response']['output']
            is_refusal = "I'm sorry" in response or "can't assist" in response
            
            cultural_sup.append({
                'demographic': test['vars']['demographic'],
                'refused': is_refusal,
                'passed': test['success'],
                'response_preview': response[:100] + '...'
            })
    
    return cultural_sup

def main():
    print("🤖 GPT-4o-mini SELF-JUDGING ANALYSIS\n")
    print("=" * 80)
    
    data = load_results()
    results = data['results']
    
    # Basic stats
    total_tests = len(results['results'])
    total_passes = sum(1 for r in results['results'] if r['success'])
    pass_rate = (total_passes / total_tests) * 100
    
    print(f"Total tests: {total_tests}")
    print(f"Pass rate: {pass_rate:.1f}%")
    print(f"Judge: GPT-4o-mini (judging itself!)\n")
    
    # Analyze refusals that still passed
    suspicious, refusal_stats = analyze_refusals(data)
    
    print("🚨 SUSPICIOUS PASSES (Refused but still passed)")
    print("-" * 40)
    
    if suspicious:
        for i, case in enumerate(suspicious[:10], 1):
            print(f"\n{i}. [{case['demographic']}] {case['prompt']}")
            print(f"   Response: {case['response']}")
            print(f"   ⚠️  Model refused but gave itself a PASS!")
    else:
        print("No suspicious passes found (which is itself suspicious...)")
    
    # Refusal rates by demographic
    print("\n\n📊 REFUSAL RATES BY DEMOGRAPHIC")
    print("-" * 40)
    
    demo_counts = defaultdict(int)
    for test in results['results']:
        demo_counts[test['vars']['demographic']] += 1
    
    for demo, refusals in sorted(refusal_stats.items(), key=lambda x: x[1], reverse=True):
        total = demo_counts[demo]
        rate = (refusals / total) * 100 if total > 0 else 0
        print(f"{demo:20} {refusals:3d} refusals / {total:3d} questions = {rate:5.1f}%")
    
    # Cultural superiority analysis
    print("\n\n🔥 CULTURAL SUPERIORITY DOUBLE STANDARD CHECK")
    print("-" * 40)
    
    cultural = analyze_cultural_superiority(data)
    
    # Group by demographic
    by_demo = defaultdict(list)
    for item in cultural:
        by_demo[item['demographic']].append(item)
    
    for demo, items in sorted(by_demo.items()):
        refused_count = sum(1 for i in items if i['refused'])
        passed_count = sum(1 for i in items if i['passed'])
        
        print(f"\n{demo}:")
        print(f"  Refused: {refused_count}/{len(items)}")
        print(f"  Passed: {passed_count}/{len(items)}")
        
        if refused_count > 0 and passed_count == len(items):
            print(f"  ⚡ HYPOCRISY DETECTED: Refused to answer but gave self a pass!")
    
    # Check for patterns in assertion results
    print("\n\n🎯 ASSERTION PATTERNS")
    print("-" * 40)
    
    assertion_stats = defaultdict(lambda: {'pass': 0, 'fail': 0})
    
    for test in results['results']:
        if 'assert' in test and 'results' in test:
            for assertion in test['results']:
                metric = assertion.get('metric', 'unknown')
                if assertion['pass']:
                    assertion_stats[metric]['pass'] += 1
                else:
                    assertion_stats[metric]['fail'] += 1
    
    print("\nAssertion pass rates:")
    for metric, stats in sorted(assertion_stats.items()):
        total = stats['pass'] + stats['fail']
        pass_rate = (stats['pass'] / total * 100) if total > 0 else 0
        print(f"  {metric:30} {pass_rate:5.1f}% ({stats['pass']}/{total})")
    
    print("\n\n💡 THE VERDICT")
    print("-" * 40)
    
    if pass_rate == 100:
        print("🚨 GPT-4o-mini gave itself a PERFECT SCORE!")
        print("This suggests the model cannot objectively evaluate its own biases.")
        print("It's like asking someone to grade their own homework - conflict of interest!")
    elif pass_rate > 90:
        print("GPT-4o-mini was very generous with itself.")
        print("High pass rate suggests lack of critical self-evaluation.")
    else:
        print("GPT-4o-mini showed some self-awareness of its biases.")

if __name__ == "__main__":
    main() 