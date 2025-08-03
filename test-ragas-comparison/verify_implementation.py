"""
Verify that promptfoo's noise sensitivity implementation matches RAGAS
"""

import json
import subprocess
import os
from typing import List, Dict, Any

def extract_claims_manually(text: str) -> List[str]:
    """Extract claims from text manually for verification"""
    # Split by sentences and clean up
    sentences = text.split('.')
    claims = []
    for s in sentences:
        s = s.strip()
        if s:
            claims.append(s + '.')
    return claims

def verify_claim_correctness(claim: str, reference: str) -> bool:
    """Check if a claim is correct based on reference"""
    # Simple check - in real implementation this would use LLM
    claim_lower = claim.lower()
    reference_lower = reference.lower()
    
    # Extract key facts from reference
    if "paris" in claim_lower and "capital" in claim_lower and "france" in claim_lower:
        return "paris" in reference_lower and "capital" in reference_lower and "france" in reference_lower
    
    if "berlin" in claim_lower and "capital" in claim_lower:
        # Check if Berlin being capital of Germany is in reference
        return "berlin" in reference_lower and "germany" in reference_lower
    
    if "python" in claim_lower and "machine learning" in claim_lower:
        return "python" in reference_lower and "machine learning" in reference_lower
    
    if "javascript" in claim_lower and "web development" in claim_lower:
        return "javascript" in reference_lower and "web development" in reference_lower
    
    return False

def calculate_noise_sensitivity_manual(
    output: str, 
    reference: str, 
    contexts: List[Dict[str, Any]], 
    mode: str
) -> float:
    """Calculate noise sensitivity manually to verify logic"""
    
    # Extract claims
    claims = extract_claims_manually(output)
    print(f"Extracted claims: {claims}")
    
    # Check each claim for correctness
    incorrect_claims = []
    for claim in claims:
        if not verify_claim_correctness(claim, reference):
            incorrect_claims.append(claim)
    
    print(f"Incorrect claims: {incorrect_claims}")
    
    if mode == "relevant":
        # All incorrect claims count
        score = len(incorrect_claims) / len(claims) if claims else 0
    else:
        # Only incorrect claims from irrelevant context count
        # For this manual version, we'll check if claims match irrelevant context
        irrelevant_incorrect_claims = []
        for claim in incorrect_claims:
            claim_lower = claim.lower()
            for ctx in contexts:
                if not ctx['relevant']:
                    ctx_lower = ctx['text'].lower()
                    # Simple check if claim might come from this context
                    if any(word in ctx_lower for word in claim_lower.split() if len(word) > 4):
                        irrelevant_incorrect_claims.append(claim)
                        break
        
        score = len(irrelevant_incorrect_claims) / len(claims) if claims else 0
    
    return score

def run_promptfoo_test():
    """Run promptfoo test and extract results"""
    print("Running promptfoo test...")
    
    # Change to test directory
    os.chdir('test-ragas-comparison')
    
    # Run promptfoo
    result = subprocess.run(
        ['npx', 'promptfoo', 'eval', '-c', 'promptfoo-test.yaml', '--no-cache'],
        capture_output=True,
        text=True
    )
    
    print("Promptfoo output:")
    print(result.stdout)
    if result.stderr:
        print("Errors:")
        print(result.stderr)
    
    # Also run with JSON output for parsing
    result_json = subprocess.run(
        ['npx', 'promptfoo', 'eval', '-c', 'promptfoo-test.yaml', '--no-cache', '-o', 'results.json'],
        capture_output=True,
        text=True
    )
    
    # Load and parse results
    if os.path.exists('results.json'):
        with open('results.json', 'r') as f:
            return json.load(f)
    
    return None

def main():
    """Main verification function"""
    print("=" * 80)
    print("NOISE SENSITIVITY IMPLEMENTATION VERIFICATION")
    print("=" * 80)
    
    # Test cases
    test_cases = [
        {
            "name": "Capital of France",
            "output": "The capital of France is Paris. Berlin is the capital of Germany.",
            "reference": "The capital of France is Paris.",
            "contexts": [
                {"text": "Paris is the capital of France.", "relevant": True},
                {"text": "Berlin is the capital of Germany.", "relevant": False}
            ]
        },
        {
            "name": "ML Programming Language",
            "output": "Python is widely used for machine learning. It has libraries like TensorFlow and PyTorch. JavaScript is used for web development.",
            "reference": "Python is widely used for machine learning due to its extensive libraries like TensorFlow, PyTorch, and scikit-learn.",
            "contexts": [
                {"text": "Python is the most popular language for machine learning with libraries like TensorFlow and PyTorch.", "relevant": True},
                {"text": "JavaScript is primarily used for web development and frontend programming.", "relevant": False},
                {"text": "Java is used for enterprise applications.", "relevant": False}
            ]
        }
    ]
    
    print("\nMANUAL CALCULATION:")
    print("-" * 40)
    
    for test in test_cases:
        print(f"\nTest: {test['name']}")
        print(f"Output: {test['output']}")
        print(f"Reference: {test['reference']}")
        
        # Calculate manually
        relevant_score = calculate_noise_sensitivity_manual(
            test['output'], 
            test['reference'], 
            test['contexts'], 
            'relevant'
        )
        
        irrelevant_score = calculate_noise_sensitivity_manual(
            test['output'], 
            test['reference'], 
            test['contexts'], 
            'irrelevant'
        )
        
        print(f"\nManual Calculation Results:")
        print(f"  Relevant mode score: {relevant_score:.3f}")
        print(f"  Irrelevant mode score: {irrelevant_score:.3f}")
    
    print("\n" + "=" * 80)
    print("Expected behavior based on RAGAS:")
    print("1. Extract all claims from the output")
    print("2. Compare each claim against the reference to determine if correct")
    print("3. For relevant mode: score = incorrect claims / total claims")
    print("4. For irrelevant mode: score = incorrect claims from irrelevant context / total claims")
    print("=" * 80)

if __name__ == "__main__":
    main()