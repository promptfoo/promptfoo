/**
 * Prompts for claim-level context faithfulness analysis
 * These prompts implement the RAGAS approach for fine-grained faithfulness evaluation
 */

export const CLAIM_EXTRACTION_PROMPT = `Given a question and answer, extract all atomic claims made in the answer.
An atomic claim is a single, verifiable statement of fact that cannot be further broken down.

Question: {{question}}
Answer: {{answer}}

Extract each claim on a new line. Be comprehensive and include all factual assertions made in the answer.

Output format:
claims:
[claim 1]
[claim 2]
...`;

export const CLAIM_VERIFICATION_PROMPT = `You are tasked with performing natural language inference to verify if claims are supported by the given context.

Context: {{context}}

For each of the following claims, determine if it can be inferred from the context:
{{#each claims}}
{{@index}}. {{this}}
{{/each}}

For each claim:
1. Provide a brief explanation of your reasoning
2. Give a verdict: "Yes" if the claim is supported by the context, "No" if it is not

Output format:
{{#each claims}}
{{@index}}. {{this}}
Explanation: [Your reasoning]
Verdict: [Yes/No]
{{/each}}`;
