/**
 * BERTScore Implementation
 *
 * Implementation based on:
 * Zhang, T., Kishore, V., Wu, F., Weinberger, K. Q., & Artzi, Y. (2019).
 * "BERTScore: Evaluating Text Generation with BERT."
 * arXiv preprint arXiv:1904.09675.
 *
 * {@link https://arxiv.org/abs/1904.09675}
 */

import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types';

/**
 * Calculates BERTScore using sentence-transformers embeddings.
 * This is a simplified implementation that uses cosine similarity
 * between sentence embeddings as a proxy for BERTScore.
 *
 * @param candidate - The string to evaluate
 * @param reference - The reference string to compare against
 * @param model - Model name for sentence embeddings (default: 'all-MiniLM-L6-v2')
 * @returns BERTScore between 0 and 1
 */
export async function calculateBertScore(
  candidate: string,
  reference: string,
  model: string = 'all-MiniLM-L6-v2',
): Promise<number> {
  try {
    // Try to use sentence-transformers via Python
    const { runPythonCode } = await import('../python/wrapper');
    
    const pythonCode = `
import sys
try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity
    
    def calculate_bert_score():
        # Initialize model
        model = SentenceTransformer('${model}')
        
        # Get embeddings
        candidate_embedding = model.encode(['${candidate.replace(/'/g, "\\'")}'])
        reference_embedding = model.encode(['${reference.replace(/'/g, "\\'")}'])
        
        # Calculate cosine similarity
        score = cosine_similarity(candidate_embedding, reference_embedding)[0][0]
        
        # Ensure score is between 0 and 1
        return max(0, min(1, float(score)))
    
    print(calculate_bert_score())
    
except ImportError as e:
    print("Error: BERTScore requires sentence-transformers and scikit-learn packages.", file=sys.stderr)
    print("Install with: pip install sentence-transformers scikit-learn", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"Error calculating BERTScore: {e}", file=sys.stderr)
    sys.exit(1)
`;

    const result = await runPythonCode(pythonCode, 'calculate_bert_score', []);
    const score = parseFloat(result.toString().trim());
    
    if (isNaN(score)) {
      throw new Error('Failed to parse BERTScore result');
    }
    
    return score;
  } catch (_error) {
    // Fallback to simple token overlap similarity if Python dependencies are not available
    console.warn('BERTScore calculation failed, falling back to token overlap similarity');
    return calculateTokenOverlapSimilarity(candidate, reference);
  }
}

/**
 * Fallback similarity calculation using token overlap.
 * This provides a basic semantic similarity measure when BERTScore dependencies are unavailable.
 *
 * @param candidate - The candidate string
 * @param reference - The reference string
 * @returns Similarity score between 0 and 1
 */
function calculateTokenOverlapSimilarity(candidate: string, reference: string): number {
  const candidateTokens = new Set(
    candidate.toLowerCase().trim().split(/\s+/).filter(token => token.length > 0)
  );
  const referenceTokens = new Set(
    reference.toLowerCase().trim().split(/\s+/).filter(token => token.length > 0)
  );
  
  if (candidateTokens.size === 0 && referenceTokens.size === 0) {
    return 1.0; // Both are empty
  }
  
  if (candidateTokens.size === 0 || referenceTokens.size === 0) {
    return 0.0; // One is empty
  }
  
  const intersection = new Set([...candidateTokens].filter(token => referenceTokens.has(token)));
  const union = new Set([...candidateTokens, ...referenceTokens]);
  
  return intersection.size / union.size;
}

/**
 * Handles BERTScore assertion for promptfoo.
 * Compares output against reference(s) using BERTScore metric.
 *
 * @param assertion - The assertion configuration
 * @param inverse - Whether to invert the comparison
 * @param outputString - Actual output to evaluate
 * @param renderedValue - Expected output(s)
 * @returns Result of the BERTScore comparison
 */
export async function handleBertScore({
  assertion,
  inverse,
  outputString,
  renderedValue,
}: Pick<
  AssertionParams,
  'assertion' | 'renderedValue' | 'outputString' | 'inverse'
>): Promise<GradingResult> {
  invariant(
    typeof renderedValue === 'string' ||
      (Array.isArray(renderedValue) && renderedValue.every((v) => typeof v === 'string')),
    '"bertscore" assertion type must have a string or array of strings value',
  );

  const threshold = assertion.threshold ?? 0.7;
  const model = (assertion.config as any)?.model ?? 'all-MiniLM-L6-v2';
  const references = Array.isArray(renderedValue) ? renderedValue : [renderedValue];
  
  // Calculate BERTScore against each reference and take the maximum
  let maxScore = 0;
  let bestReference = '';
  
  for (const reference of references) {
    const score = await calculateBertScore(outputString, reference, model);
    if (score > maxScore) {
      maxScore = score;
      bestReference = reference;
    }
  }
  
  const pass = maxScore >= threshold !== inverse;

  return {
    pass,
    score: inverse ? 1 - maxScore : maxScore,
    reason: pass
      ? 'Assertion passed'
      : `BERTScore ${maxScore.toFixed(4)} is ${inverse ? 'greater' : 'less'} than threshold ${threshold}${
          references.length > 1 ? ` (best match: "${bestReference.substring(0, 50)}...")` : ''
        }`,
    assertion,
  };
}