from typing import Dict, Any, Optional, Union

def calculate_score(named_scores: Dict[str, float], context: Optional[Dict[str, Any]] = None) -> Dict[str, Union[bool, float, str]]:
    print("Override scoring function (Python):", named_scores)

    # Focus only on accuracy, ignore style metrics
    accuracy_score = named_scores.get("accuracy", 0) * 2

    # Simplified scoring that only cares about accuracy
    total_score = min(accuracy_score, 1.0)

    return {
        "pass": total_score >= 0.7,
        "score": total_score,
        "reason": f"Accuracy-focused score (2x weight): {accuracy_score}",
    }
