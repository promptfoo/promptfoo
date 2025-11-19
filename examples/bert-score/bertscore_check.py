"""
BERTScore - measure semantic similarity between generated and reference text.
"""

from bert_score import score


def get_assert(output, context):
    """
    Returns BERTScore F1 as a number (0-1).
    Promptfoo will compare against threshold automatically.
    """
    reference = context.get("vars", {}).get("reference", "")
    if not reference:
        return 0

    try:
        _, _, F1 = score([output], [reference], lang="en", verbose=False)
        return F1.item()
    except:
        return 0
