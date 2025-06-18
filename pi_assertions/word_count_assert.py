from typing import Any

def score(
    response_text: str,
    input_text: str,
    kwargs: dict[str, Any],
) -> dict:

    def evaluate_response(response):
        """
        Check if the summary is between 50 and 150 words.
        
        Args:
            response (str): The LLM's response text
        
        Returns:
            float: 1.0 if the summary is between 50 and 150 words, 0.0 otherwise
        """
        # Split the response into words
        words = response.split()
        
        # Count the number of words
        word_count = len(words)
        
        # Check if the word count is between 50 and 150 (inclusive)
        if 50 <= word_count <= 150:
            return 1.0
        return 0.0

    final_score = evaluate_response(response_text)
    return {"score": final_score, "explanation": ""}


def do_assert(output:str, context):
  pi_score = score(output, context["prompt"], {})["score"]
  return {
      "score": pi_score,
      "pass": pi_score >= context["config"].get("threshold", 0.0),
      "reason": context["config"]["question"]
  }

