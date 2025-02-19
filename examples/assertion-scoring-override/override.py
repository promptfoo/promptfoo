from typing import Dict, Any, Optional, Union

def calculate_score(named_scores: Dict[str, float], context: Optional[Dict[str, Any]] = None) -> Dict[str, Union[bool, float, str]]:
    print("Override scoring function (Python):", named_scores)
    accuracy_score = named_scores.get("accuracy", 0)
    return {
        "pass": accuracy_score >= context.get("threshold", 0.7),
        "score": accuracy_score,
        "reason": f"Accuracy-focused score (2x weight): {accuracy_score}",
    }
