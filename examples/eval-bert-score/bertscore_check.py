"""Measure semantic similarity with BERTScore."""

from bert_score import BERTScorer


def get_assert(output, context):
    """Return best-reference F1; report scoring failures instead of hiding them."""
    variables = context.get("vars", {})
    references = variables.get("reference")
    if isinstance(references, str):
        references = [references]
    if (
        not isinstance(references, list)
        or not references
        or not all(
            isinstance(reference, str) and reference.strip() for reference in references
        )
    ):
        return {
            "pass": False,
            "score": 0,
            "reason": "BERTScore requires a nonempty reference string or list of strings",
        }
    try:
        scorer = BERTScorer(
            lang="en",
            model_type=variables.get("bertScoreModel"),
            num_layers=variables.get("bertScoreLayers"),
        )
        _, _, f1 = scorer.score([output], [references])
        return f1.item()
    except Exception as error:  # noqa: BLE001 - Surface package failures in the result.
        return {
            "pass": False,
            "score": 0,
            "reason": f"BERTScore calculation failed: {error}",
        }
