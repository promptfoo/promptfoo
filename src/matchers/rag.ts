import { serializeContext } from '../assertions/contextUtils';
import {
  ANSWER_RELEVANCY_GENERATE,
  CITATION_FAITHFULNESS_PROMPT,
  CONTEXT_FAITHFULNESS_LONGFORM,
  CONTEXT_FAITHFULNESS_NLI_STATEMENTS,
  CONTEXT_RECALL,
  CONTEXT_RECALL_ATTRIBUTED_TOKEN,
  CONTEXT_RECALL_NOT_ATTRIBUTED_TOKEN,
  CONTEXT_RELEVANCE,
  CONTEXT_RELEVANCE_BAD,
} from '../prompts/index';
import { getDefaultProviders } from '../providers/defaults';
import invariant from '../util/invariant';
import { extractJsonObjects } from '../util/json';
import { accumulateTokenUsage } from '../util/tokenUsageUtils';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import { loadRubricPrompt, renderLlmRubricPrompt } from './rubric';
import {
  cosineSimilarity,
  fail,
  normalizeMatcherTokenUsage,
  splitIntoSentences,
  splitTextIntoSentences,
  tryParse,
} from './shared';

import type { CallApiContextParams, GradingConfig, GradingResult, VarValue } from '../types/index';

export async function matchesAnswerRelevance(
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const defaults = await getDefaultProviders();
  const embeddingProvider = await getAndCheckProvider(
    'embedding',
    grading?.provider,
    defaults.embeddingProvider,
    'answer relevancy check',
  );
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    defaults.gradingProvider,
    'answer relevancy check',
  );

  const tokensUsed = normalizeMatcherTokenUsage(undefined);

  // Hoist rubric loading and output parsing out of the loop
  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, ANSWER_RELEVANCY_GENERATE);
  const parsedOutput = tryParse(output);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, { answer: parsedOutput });

  const candidateQuestions: string[] = [];
  for (let i = 0; i < 3; i++) {
    // TODO(ian): Parallelize
    const resp = await callProviderWithContext(
      textProvider,
      promptText,
      'answer-relevance',
      { answer: parsedOutput },
      providerCallContext,
    );
    accumulateTokenUsage(tokensUsed, resp.tokenUsage);
    if (resp.error || !resp.output) {
      return fail(resp.error || 'No output', tokensUsed);
    }

    invariant(
      typeof resp.output === 'string',
      'answer relevancy check produced malformed response',
    );
    candidateQuestions.push(resp.output);
  }

  invariant(
    typeof embeddingProvider.callEmbeddingApi === 'function',
    `Provider ${embeddingProvider.id()} must implement callEmbeddingApi for similarity check`,
  );

  const inputEmbeddingResp = await embeddingProvider.callEmbeddingApi(input);
  accumulateTokenUsage(tokensUsed, inputEmbeddingResp.tokenUsage);
  if (inputEmbeddingResp.error || !inputEmbeddingResp.embedding) {
    return fail(inputEmbeddingResp.error || 'No embedding', tokensUsed);
  }
  const inputEmbedding = inputEmbeddingResp.embedding;

  const similarities: number[] = [];
  const questionsWithScores: { question: string; similarity: number }[] = [];

  for (const question of candidateQuestions) {
    const resp = await embeddingProvider.callEmbeddingApi(question);
    accumulateTokenUsage(tokensUsed, resp.tokenUsage);
    if (resp.error || !resp.embedding) {
      return fail(resp.error || 'No embedding', tokensUsed);
    }
    const questionSimilarity = cosineSimilarity(inputEmbedding, resp.embedding);
    similarities.push(questionSimilarity);
    questionsWithScores.push({ question, similarity: questionSimilarity });
  }

  const similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pass = similarity >= threshold - Number.EPSILON;
  const greaterThanReason = `Relevance ${similarity.toFixed(
    2,
  )} is greater than threshold ${threshold}`;
  const lessThanReason = `Relevance ${similarity.toFixed(2)} is less than threshold ${threshold}`;

  const metadata = {
    generatedQuestions: questionsWithScores,
    averageSimilarity: similarity,
    threshold,
  };

  if (pass) {
    return {
      pass: true,
      score: similarity,
      reason: greaterThanReason,
      tokensUsed,
      metadata,
    };
  }
  return {
    pass: false,
    score: similarity,
    reason: lessThanReason,
    tokensUsed,
    metadata,
  };
}

export async function matchesContextRecall(
  context: string | string[],
  groundTruth: string,
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context recall check',
  );

  const contextString = serializeContext(context);

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RECALL);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context: contextString,
    groundTruth,
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-recall',
    {
      context: contextString,
      groundTruth,
      ...(vars || {}),
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-recall produced malformed response');

  // Filter to only include lines that contain attribution markers.
  // This handles cases where LLMs add preamble text before the classification list.
  // See: https://github.com/promptfoo/promptfoo/issues/1506
  const attributedTokenLower = CONTEXT_RECALL_ATTRIBUTED_TOKEN.toLowerCase();
  const notAttributedTokenLower = CONTEXT_RECALL_NOT_ATTRIBUTED_TOKEN.toLowerCase();
  const sentences = splitIntoSentences(resp.output).filter((line) => {
    const lowerLine = line.toLowerCase();
    return lowerLine.includes(attributedTokenLower) || lowerLine.includes(notAttributedTokenLower);
  });

  const sentenceAttributions: { sentence: string; attributed: boolean }[] = [];
  let numerator = 0;

  for (const sentence of sentences) {
    // Case-insensitive check for attribution - handles [ATTRIBUTED], [Attributed], etc.
    const lowerSentence = sentence.toLowerCase();
    const isAttributed =
      !lowerSentence.includes(notAttributedTokenLower) &&
      lowerSentence.includes(attributedTokenLower);
    if (isAttributed) {
      numerator++;
    }
    // Extract the actual sentence content without the classification part
    const sentenceMatch = sentence.match(/^\d+\.\s*([^\.]+\.)/);
    const cleanSentence = sentenceMatch ? sentenceMatch[1].trim() : sentence.split('.')[0].trim();
    sentenceAttributions.push({
      sentence: cleanSentence,
      attributed: isAttributed,
    });
  }

  const score = sentences.length > 0 ? numerator / sentences.length : 0;
  const pass = score >= threshold - Number.EPSILON;

  const metadata = {
    sentenceAttributions,
    totalSentences: sentences.length,
    attributedSentences: numerator,
    score,
  };

  return {
    pass,
    score,
    reason: pass
      ? `Recall ${score.toFixed(2)} is >= ${threshold}`
      : `Recall ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage),
    metadata,
  };
}

export async function matchesContextRelevance(
  question: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context relevance check',
  );

  const contextString = serializeContext(context);

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RELEVANCE);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context: contextString,
    query: question,
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-relevance',
    {
      context: contextString,
      query: question,
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-relevance produced malformed response');

  // The context is segmented into "units": chunks if provided, otherwise — for a
  // string — by line when it is already segmented (multiple non-empty lines) or by
  // sentence when it is a single prose block. A retrieved context is typically a
  // single paragraph with no newlines; splitting on newlines alone would yield one
  // unit, forcing the score to ~1.0 regardless of relevance.
  const contextIsPreSegmented =
    Array.isArray(context) || context.split('\n').filter((line) => line.trim() !== '').length > 1;
  const contextUnits = Array.isArray(context)
    ? context.filter((chunk) => chunk.trim().length > 0)
    : splitTextIntoSentences(context);
  const totalContextUnits = contextUnits.length;

  // Numerator (relevant units): segment the grader output into the SAME kind of
  // units as the context so the two are comparable — by line when the context is
  // pre-segmented (chunk array or multi-line), otherwise by sentence. The grader
  // echoes relevant sentences verbatim; for a prose context that is continuous
  // text with no newlines, so counting by line alone would treat a multi-sentence
  // answer as one unit and undercount relevance (e.g. echoing the whole context
  // would score 1/N instead of 1.0).
  const insufficientInformation = resp.output.includes(CONTEXT_RELEVANCE_BAD);
  const segmentRelevant = contextIsPreSegmented ? splitIntoSentences : splitTextIntoSentences;
  const relevantSentences = insufficientInformation
    ? []
    : [...new Set(segmentRelevant(resp.output))];
  // Cap at the total so the score never exceeds 1.
  const numerator = Math.min(relevantSentences.length, totalContextUnits);

  // RAGAS CONTEXT RELEVANCE FORMULA: relevant units / total context units
  const score = totalContextUnits > 0 ? numerator / totalContextUnits : 0;
  const pass = score >= threshold - Number.EPSILON;

  const metadata = {
    graderOutputs: {
      final: resp.output,
    },
    extractedSentences: relevantSentences,
    totalContextUnits,
    totalContextSentences: totalContextUnits, // Backward compatibility
    contextUnits,
    relevantSentenceCount: numerator,
    insufficientInformation,
    score,
  };

  return {
    pass,
    score,
    reason: pass
      ? `Context relevance ${score.toFixed(2)} is >= ${threshold}`
      : `Context relevance ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage),
    metadata,
  };
}

export async function matchesContextFaithfulness(
  query: string,
  output: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'faithfulness check',
  );

  const tokensUsed = normalizeMatcherTokenUsage(undefined);

  if (grading?.rubricPrompt) {
    invariant(Array.isArray(grading.rubricPrompt), 'rubricPrompt must be an array');
  }
  // Load rubric prompts using loadRubricPrompt to support file:// references with templates
  const rawLongformPrompt =
    typeof grading?.rubricPrompt?.[0] === 'string'
      ? grading?.rubricPrompt?.[0]
      : grading?.rubricPrompt?.[0]?.content;
  const rawNliPrompt =
    typeof grading?.rubricPrompt?.[1] === 'string'
      ? grading?.rubricPrompt?.[1]
      : grading?.rubricPrompt?.[1]?.content;
  const longformPrompt = await loadRubricPrompt(rawLongformPrompt, CONTEXT_FAITHFULNESS_LONGFORM);
  const nliPrompt = await loadRubricPrompt(rawNliPrompt, CONTEXT_FAITHFULNESS_NLI_STATEMENTS);

  let promptText = await renderLlmRubricPrompt(longformPrompt, {
    question: query,
    answer: tryParse(output),
    ...(vars || {}),
  });

  let resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-faithfulness-longform',
    {
      question: query,
      answer: tryParse(output),
      ...(vars || {}),
    },
    providerCallContext,
  );
  accumulateTokenUsage(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  const contextString = serializeContext(context);

  const statements = splitIntoSentences(resp.output);
  promptText = await renderLlmRubricPrompt(nliPrompt, {
    context: contextString,
    statements,
    ...(vars || {}),
  });

  resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-faithfulness-nli',
    {
      context: contextString,
      statements,
      ...(vars || {}),
    },
    providerCallContext,
  );
  accumulateTokenUsage(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  let finalAnswer = 'Final verdict for each statement in order:';
  finalAnswer = finalAnswer.toLowerCase();
  let verdicts = resp.output.toLowerCase().trim();
  let score = 0;
  if (statements.length > 0) {
    if (verdicts.includes(finalAnswer)) {
      verdicts = verdicts.slice(verdicts.indexOf(finalAnswer) + finalAnswer.length);
      const parsedVerdicts = verdicts.split('.').filter((answer) => answer.trim() !== '');
      if (parsedVerdicts.length > 0) {
        score =
          1 - parsedVerdicts.filter((answer) => !answer.includes('yes')).length / statements.length;
      }
    } else {
      const noVerdictCount = verdicts.split('verdict: no').length - 1;
      const yesVerdictCount = verdicts.split('verdict: yes').length - 1;
      if (noVerdictCount + yesVerdictCount > 0) {
        score = 1 - noVerdictCount / statements.length;
      }
    }
  }
  score = Math.min(1, Math.max(0, score));
  const pass = score >= threshold - Number.EPSILON;
  return {
    pass,
    score,
    reason: pass
      ? `Faithfulness ${score.toFixed(2)} is >= ${threshold}`
      : `Faithfulness ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed,
  };
}

/**
 * Numbers retrieved passages so the grader can resolve `[N]` citation markers.
 *
 * When context is provided as an array, each entry becomes a numbered passage
 * (`[1] ...`, `[2] ...`). When it is a single string, it is returned unchanged
 * so callers that already embed `[N]` markers keep working.
 */
function numberCitationPassages(context: string | string[]): string {
  if (Array.isArray(context)) {
    return context.map((passage, index) => `[${index + 1}] ${passage}`).join('\n\n');
  }
  return context;
}

/**
 * Checks citation-attribution faithfulness: whether every `[N]` citation marker
 * in the answer points to a passage that actually supports the specific claim
 * the marker is attached to.
 *
 * This is distinct from {@link matchesContextFaithfulness}, which checks whether
 * a claim is supported by the context *somewhere*. This matcher catches
 * misattribution: a claim cited to passage [A] that does not support it, even
 * when some other passage [B] in the context would.
 *
 * The grader returns a binary verdict. A "faithful" verdict scores 1.0 and a
 * "unfaithful" verdict scores 0.0. With the default threshold of 1.0, only a
 * faithful answer passes.
 */
export async function matchesCitationFaithfulness(
  query: string,
  output: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'citation-faithfulness check',
  );

  const tokensUsed = normalizeMatcherTokenUsage(undefined);

  // Deterministic precheck: an answer with no [N] citation markers has nothing to
  // attribute, so it cannot be citation-faithful. Fail it directly rather than
  // letting the grader pass it vacuously (and save an API call).
  if (!/\[\d+\]/.test(output)) {
    return fail('Answer contains no [N] citation markers to evaluate.', tokensUsed);
  }

  if (grading?.rubricPrompt) {
    invariant(
      typeof grading.rubricPrompt === 'string' || Array.isArray(grading.rubricPrompt),
      'rubricPrompt must be a string or array',
    );
  }
  // Pass the rubricPrompt through as-is (string or ChatMessage[]); loadRubricPrompt
  // handles both. Selecting element 0 would drop the user message carrying the
  // {{question}}/{{context}}/{{answer}} placeholders from a custom chat rubric.
  const citationPrompt = await loadRubricPrompt(
    grading?.rubricPrompt,
    CITATION_FAITHFULNESS_PROMPT,
  );

  const numberedContext = numberCitationPassages(context);

  // Spread caller vars first so the explicit numbered context (and question/answer)
  // win: a `vars.context` array must not overwrite the numbered [1]..[N] passages.
  const promptVars = {
    ...(vars || {}),
    question: query,
    answer: tryParse(output),
    context: numberedContext,
  };
  const promptText = await renderLlmRubricPrompt(citationPrompt, promptVars);

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'citation-faithfulness',
    promptVars,
    providerCallContext,
  );
  accumulateTokenUsage(tokensUsed, resp.tokenUsage);
  // Hard grader failures are tagged graderError so callers (e.g. the inverse
  // not-citation-faithfulness assertion) can avoid treating an outage or parse
  // failure as a meaningful verdict.
  if (resp.error || !resp.output) {
    return { ...fail(resp.error || 'No output', tokensUsed), metadata: { graderError: true } };
  }

  invariant(typeof resp.output === 'string', 'citation-faithfulness produced malformed response');

  const parsed = extractJsonObjects(resp.output)[0] as
    | { verdict?: string; reasoning?: string }
    | undefined;
  if (!parsed || typeof parsed.verdict !== 'string') {
    // Do not echo the raw grader output in the reason: it can contain the
    // candidate answer and the retrieved passages.
    return {
      ...fail('citation-faithfulness grader did not return a valid verdict.', tokensUsed),
      metadata: { graderError: true },
    };
  }

  const verdict = parsed.verdict.trim().toLowerCase();
  if (verdict !== 'faithful' && verdict !== 'unfaithful') {
    // An unrecognized verdict is a grader failure, not a real "unfaithful" result;
    // tag it so the inverse assertion does not invert it into a pass.
    return {
      ...fail('citation-faithfulness grader returned an unrecognized verdict.', tokensUsed),
      metadata: { graderError: true },
    };
  }
  const faithful = verdict === 'faithful';
  const score = faithful ? 1 : 0;
  const pass = score >= threshold - Number.EPSILON;
  const reasoning =
    typeof parsed.reasoning === 'string' && parsed.reasoning.trim().length > 0
      ? parsed.reasoning.trim()
      : faithful
        ? 'All citations point to passages that support their claims.'
        : 'At least one citation does not point to a passage that supports its claim.';

  return {
    pass,
    score,
    reason: reasoning,
    tokensUsed,
  };
}
