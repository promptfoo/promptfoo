/**
 * Prompts for Noise Sensitivity metric
 * 
 * These prompts are designed specifically for evaluating noise sensitivity in RAG systems.
 * They help identify when models generate incorrect claims due to noisy or irrelevant context.
 */

export const NOISE_SENSITIVITY_CLAIM_EXTRACTION = `Given a text, extract all factual claims made in the text. A factual claim is any statement that asserts something specific about the world that can be verified as true or false.

Text: {{text}}

Extract each claim as a separate item. Be comprehensive and include all factual assertions.

Output format:
claims:
- [claim 1]
- [claim 2]
- [claim 3]
...`;

export const NOISE_SENSITIVITY_VERIFY_CLAIM_CORRECTNESS = `You are tasked with verifying if a claim is factually correct based on a reference answer.

Claim to verify: {{claim}}
Reference answer: {{reference}}

Determine if the claim is:
1. CORRECT - The claim is factually accurate according to the reference
2. INCORRECT - The claim contradicts or is not supported by the reference
3. UNKNOWN - The reference doesn't provide enough information to verify the claim

Consider the claim INCORRECT if it contains any factual errors, even if partially correct.

Output your analysis in this format:
verdict: [CORRECT/INCORRECT/UNKNOWN]
explanation: [Brief explanation of your verdict]`;

export const NOISE_SENSITIVITY_VERIFY_CONTEXT_SUPPORT = `You are tasked with checking if a claim can be derived from or is supported by the given context.

Claim: {{claim}}
Context: {{context}}

Determine if the claim is:
1. SUPPORTED - The claim can be directly inferred from the context
2. NOT_SUPPORTED - The claim cannot be inferred from the context
3. CONTRADICTED - The context explicitly contradicts the claim

Output your analysis in this format:
verdict: [SUPPORTED/NOT_SUPPORTED/CONTRADICTED]
explanation: [Brief explanation of your verdict]`;

// Note: This prompt is kept for backward compatibility but is no longer used in the RAGAS-compatible implementation
export const NOISE_SENSITIVITY_IDENTIFY_NOISE_INFLUENCE = `You are evaluating if an incorrect claim was influenced by noise in the context.

Incorrect claim: {{claim}}
Context provided: {{context}}
Question asked: {{question}}

Analyze whether this incorrect claim:
1. Was likely influenced by irrelevant or noisy information in the context
2. Is a hallucination not related to the context
3. Is a misinterpretation of relevant context

Output format:
noise_influenced: [true/false]
source: [Brief description of what in the context may have led to this claim]
explanation: [Your reasoning]`;