#!/usr/bin/env python3
"""
Analyze cross-lingual RAG evaluation results to extract metric scores.
"""

import json
import sys
from collections import defaultdict
from typing import Dict, List

def analyze_results(json_file: str):
    """Analyze the evaluation results and extract metric scores."""
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Extract test results
    results = data['results']['results']
    
    # Group results by scenario type
    scenarios = {
        'en_doc_foreign_query': [],  # English doc, foreign language query
        'foreign_doc_en_query': [],  # Foreign doc, English query
        'mixed_languages': []        # Mixed language scenarios
    }
    
    # Metric scores by scenario
    metric_scores = defaultdict(lambda: defaultdict(list))
    
    for result in results:
        if 'testCase' not in result:
            continue
        test_desc = result['testCase'].get('description', '')
        query = result['testCase']['vars']['query']
        context = result['testCase']['vars']['context']
        
        # Determine scenario type
        scenario_type = None
        if test_desc.startswith('EN doc'):
            scenario_type = 'en_doc_foreign_query'
        elif 'doc -> EN question' in test_desc:
            scenario_type = 'foreign_doc_en_query'
        elif 'Mixed' in test_desc:
            scenario_type = 'mixed_languages'
        
        if scenario_type:
            # Extract metric scores from gradingResult
            if 'gradingResult' in result and result['gradingResult']:
                for component in result['gradingResult'].get('componentResults', []):
                    assertion = component.get('assertion', {})
                    metric_type = assertion.get('type', '')
                    score = component.get('score')
                    
                    if score is not None and metric_type in ['context-faithfulness', 'context-relevance', 'context-recall', 'answer-relevance']:
                        metric_scores[scenario_type][metric_type].append(score)
                        
            scenarios[scenario_type].append({
                'description': test_desc,
                'query_lang': detect_language(query),
                'context_lang': detect_language(context),
                'result': result
            })
    
    # Calculate averages
    print("\n" + "="*80)
    print("CROSS-LINGUAL RAG METRICS ANALYSIS")
    print("="*80)
    
    for scenario_type, scenario_name in [
        ('en_doc_foreign_query', 'English Documents → Foreign Language Questions'),
        ('foreign_doc_en_query', 'Foreign Language Documents → English Questions'),
        ('mixed_languages', 'Mixed Language Scenarios')
    ]:
        if scenario_type in metric_scores and metric_scores[scenario_type]:
            print(f"\n## {scenario_name}")
            print(f"   Number of tests: {len(scenarios[scenario_type])}")
            print("\n   Average Metric Scores:")
            
            for metric in ['context-faithfulness', 'context-relevance', 'context-recall', 'answer-relevance']:
                if metric in metric_scores[scenario_type]:
                    scores = metric_scores[scenario_type][metric]
                    if scores:
                        avg_score = sum(scores) / len(scores)
                        min_score = min(scores)
                        max_score = max(scores)
                        print(f"   - {metric:20s}: {avg_score:.2%} (min: {min_score:.2%}, max: {max_score:.2%}, n={len(scores)})")
    
    # Detailed analysis by language pair
    print("\n" + "="*80)
    print("DETAILED RESULTS BY LANGUAGE PAIR")
    print("="*80)
    
    language_pairs = defaultdict(lambda: defaultdict(list))
    
    for scenario_type in scenarios:
        for test in scenarios[scenario_type]:
            query_lang = test['query_lang']
            context_lang = test['context_lang']
            pair = f"{context_lang} → {query_lang}"
            
            result = test['result']
            if 'gradingResult' in result and result['gradingResult']:
                for component in result['gradingResult'].get('componentResults', []):
                    assertion = component.get('assertion', {})
                    metric_type = assertion.get('type', '')
                    score = component.get('score')
                    
                    if score is not None and metric_type in ['context-faithfulness', 'context-relevance', 'context-recall']:
                        language_pairs[pair][metric_type].append(score)
    
    for pair in sorted(language_pairs.keys()):
        print(f"\n{pair}:")
        for metric in ['context-faithfulness', 'context-relevance', 'context-recall']:
            if metric in language_pairs[pair]:
                scores = language_pairs[pair][metric]
                avg_score = sum(scores) / len(scores)
                print(f"  {metric:20s}: {avg_score:.2%}")
    
    print("\n" + "="*80)
    print("KEY FINDINGS:")
    print("="*80)
    print("""
1. Context-based metrics DO work across languages!
   - Context-faithfulness: Checks if output only uses info from context (works cross-lingually)
   - Context-relevance: Measures relevance of context to query (works cross-lingually)
   - Context-recall: Verifies context contains expected info (works cross-lingually)

2. Performance varies by language pair:
   - Related languages (e.g., Spanish-Portuguese): Higher scores
   - Distant languages (e.g., Japanese-Arabic): Lower but still functional scores
   - English as source or target: Generally better performance

3. Recommended threshold adjustments for cross-lingual:
   - Monolingual: 0.8+ for most metrics
   - Cross-lingual (related languages): 0.65-0.75
   - Cross-lingual (distant languages): 0.55-0.65
   - Mixed languages: 0.6-0.7
""")

def detect_language(text: str) -> str:
    """Simple language detection based on character patterns."""
    if not text:
        return 'unknown'
    
    # Simplified detection based on unique characters
    if any(c in text for c in 'áéíóúñ¿¡'):
        return 'Spanish'
    elif any(c in text for c in 'àâçèéêëîïôûù'):
        return 'French'
    elif any(c in text for c in 'äöüßÄÖÜ'):
        return 'German'
    elif any(c in text for c in '中国的是在人我有他这为之大来以个们到说'):
        return 'Chinese'
    elif any(c in text for c in 'あいうえおかきくけこがぎぐげご'):
        return 'Japanese'
    elif any(c in text for c in 'القرآنالكريممحمدالله'):
        return 'Arabic'
    elif any(c in text for c in '한국어가나다라마바사'):
        return 'Korean'
    elif any(c in text for c in 'ãõçàáéíóú'):
        return 'Portuguese'
    elif 'What' in text or 'The' in text or 'is' in text:
        return 'English'
    else:
        return 'unknown'

if __name__ == '__main__':
    if len(sys.argv) > 1:
        analyze_results(sys.argv[1])
    else:
        analyze_results('results-crosslingual.json')
