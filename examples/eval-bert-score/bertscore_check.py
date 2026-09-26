"""Measure semantic similarity with a cached BERTScore model."""

from functools import lru_cache

from bert_score import BERTScorer


@lru_cache(maxsize=1)
def get_scorer(model_type=None, num_layers=None):
    """Reuse the model between assertions executed by the same Python worker."""
    return BERTScorer(lang="en", model_type=model_type, num_layers=num_layers)


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
        scorer = get_scorer(
            variables.get("bertScoreModel"), variables.get("bertScoreLayers")
        )
        _, _, f1 = scorer.score([output], [references])
        return f1.item()
    except Exception as error:  # noqa: BLE001 - Surface package failures in the result.
        return {
            "pass": False,
            "score": 0,
            "reason": f"BERTScore calculation failed: {error}",
        }
