import { serializeContext } from '../assertions/contextUtils';
import {
  ANSWER_RELEVANCY_GENERATE,
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

type FaithfulnessVerdict = 'yes' | 'no' | 'unknown';

interface ParsedFaithfulnessVerdict {
  ordinal?: number;
  verdict: FaithfulnessVerdict;
}

const faithfulnessEntryPrefix =
  /^(?:(?:(?:statement\s+)?\d+\s*[-\u2013\u2014.):\]]|verdict\s*:)\s*)+/;

function parseFaithfulnessVerdict(
  value: string,
  requireExplicitEntry = false,
): FaithfulnessVerdict | undefined {
  const trimmed = value.trim();
  const hasBulletPrefix = /^(?:[-+*\u2013\u2014\u2022]\s+)/u.test(trimmed);
  let normalized = trimmed.replace(/^[^\p{L}\p{N}]*/u, '');
  const hasEntryPrefix = hasBulletPrefix || faithfulnessEntryPrefix.test(normalized);
  normalized = normalized.replace(faithfulnessEntryPrefix, '').replace(/^[^\p{L}]*/u, '');

  const verdict = /^(yes|no)(?![\p{L}\p{N}])/u.exec(normalized)?.[1] as 'yes' | 'no' | undefined;
  if (verdict && !requireExplicitEntry) {
    return verdict;
  }
  const suffix = verdict ? normalized.slice(verdict.length).trim() : '';
  if (
    verdict &&
    (hasEntryPrefix || /^(?:$|[^\p{L}\p{N}]+$|because\b|[:(\[\-\u2013\u2014])/u.test(suffix))
  ) {
    return verdict;
  }
  const unwrapped = normalized.match(/^.*\p{L}/su)?.[0] ?? '';
  const unknownMatch =
    /^(?:maybe|perhaps|unknown|unclear|undetermined|n\/a|not sure)(?![\p{L}\p{N}])/u.exec(
      unwrapped,
    );
  const unknownSuffix = unknownMatch ? unwrapped.slice(unknownMatch[0].length).trim() : '';
  const isKnownUnknown = Boolean(
    unknownMatch && /^(?:$|[:(\[\-\u2013\u2014])/u.test(unknownSuffix),
  );
  if (requireExplicitEntry) {
    return hasEntryPrefix || isKnownUnknown ? 'unknown' : undefined;
  }

  // A labelled or compact value is still an ordered slot, even when it is unknown.
  const isCompactUnknown =
    !/^.$/u.test(unwrapped) && /^(?=.*\p{L})[\p{L}\p{N}]+(?:[/_-][\p{L}\p{N}]+)*$/u.test(unwrapped);
  return hasEntryPrefix || isCompactUnknown ? 'unknown' : undefined;
}

function getFaithfulnessOrdinal(value: string): number | undefined {
  const trimmed = value.trim();
  if (/^[^\p{L}\p{N}]*[+\-\u2212]\d+\s*[-\u2013\u2014.):\]]/u.test(trimmed)) {
    return Number.NaN;
  }
  const normalized = trimmed.replace(/^[^\p{L}\p{N}]*/u, '');
  const ordinal = /^(?:statement\s+)?(\d+)\s*[-\u2013\u2014.):\]]/u.exec(normalized)?.[1];
  return ordinal ? Number(ordinal) : undefined;
}

function parseCommaSeparatedFaithfulnessVerdicts(
  chunk: string,
  expectedCount: number,
): ParsedFaithfulnessVerdict[] | null | undefined {
  if (!chunk.includes(',') && !chunk.includes(' and ')) {
    return undefined;
  }

  const parsedVerdicts: ParsedFaithfulnessVerdict[] = [];
  let hasConjunction = false;
  for (const match of chunk.matchAll(/[^,]+/g)) {
    const value = match[0].trim();
    const values = value.startsWith('and ') ? [value.slice(4)] : [value];
    hasConjunction ||= values[0] !== value;
    if (values[0] === value && !parseFaithfulnessVerdict(value, true)) {
      const conjunctionIndex = value.lastIndexOf(' and ');
      if (conjunctionIndex >= 0) {
        values.splice(0, 1, value.slice(0, conjunctionIndex), value.slice(conjunctionIndex + 5));
        hasConjunction = true;
      }
    }
    for (const entry of values) {
      const verdict = parseFaithfulnessVerdict(entry, true);
      if (!verdict) {
        return hasConjunction ? null : undefined;
      }
      parsedVerdicts.push({ ordinal: getFaithfulnessOrdinal(entry), verdict });
      if (parsedVerdicts.length > expectedCount) {
        return null;
      }
    }
  }
  if (hasConjunction && parsedVerdicts.length !== expectedCount) {
    return null;
  }
  return parsedVerdicts.length > 1 ? parsedVerdicts : undefined;
}

function parseFinalFaithfulnessVerdicts(
  output: string,
  marker: string,
  expectedCount: number,
): FaithfulnessVerdict[] | undefined {
  const markerIndex = output.indexOf(marker);
  if (markerIndex < 0 || output.indexOf(marker, markerIndex + marker.length) >= 0) {
    return undefined;
  }

  const finalVerdicts = output
    .slice(markerIndex + marker.length)
    .replace(
      /\s((?:statement\s+)?\d+\s*[-\u2013\u2014.):\]]\s*)(?=[^\p{L}\p{N}]*(?:yes|no|maybe|perhaps|unknown|unclear|undetermined|n\/a|not sure)(?![\p{L}\p{N}]))/gu,
      '\n$1',
    );
  const parsedVerdicts: FaithfulnessVerdict[] = [];
  const seenOrdinals = new Set<number>();
  let pendingOrdinal: string | undefined;
  const addOrdinal = (explicitOrdinal: number | undefined): boolean => {
    if (explicitOrdinal === undefined) {
      return true;
    }
    if (
      !Number.isSafeInteger(explicitOrdinal) ||
      explicitOrdinal < 1 ||
      explicitOrdinal > expectedCount ||
      seenOrdinals.has(explicitOrdinal)
    ) {
      return false;
    }
    seenOrdinals.add(explicitOrdinal);
    return true;
  };

  // Keep ordered slots and only accept a comma list when every item looks like an entry.
  // Duplicate markers or ordinals and excess entries are ambiguous, so fail closed.
  for (const match of finalVerdicts.matchAll(/[^.\r\n]+/g)) {
    const ordinal = /^\s*((?:statement\s+)?\d+)\s*$/.exec(match[0])?.[1];
    if (ordinal) {
      pendingOrdinal = ordinal;
      continue;
    }

    const chunk = pendingOrdinal ? `${pendingOrdinal}) ${match[0]}` : match[0];
    pendingOrdinal = undefined;
    const commaVerdicts = parseCommaSeparatedFaithfulnessVerdicts(chunk, expectedCount);
    if (commaVerdicts === null) {
      return undefined;
    }
    if (commaVerdicts) {
      for (const { ordinal: explicitOrdinal, verdict } of commaVerdicts) {
        if (!addOrdinal(explicitOrdinal)) {
          return undefined;
        }
        parsedVerdicts.push(verdict);
        if (parsedVerdicts.length > expectedCount) {
          return undefined;
        }
      }
    } else {
      if (!addOrdinal(getFaithfulnessOrdinal(chunk))) {
        return undefined;
      }
      const verdict = parseFaithfulnessVerdict(chunk);
      if (verdict) {
        parsedVerdicts.push(verdict);
      }
    }
    if (parsedVerdicts.length > expectedCount) {
      return undefined;
    }
  }
  return parsedVerdicts;
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

  const finalAnswer = 'final verdict for each statement in order:';
  const verdicts = resp.output
    .toLowerCase()
    .trim()
    .replace(/final verdict for each statement in order\s*:/gu, finalAnswer);
  let score = 0;
  if (statements.length > 0) {
    if (verdicts.includes(finalAnswer)) {
      const parsedVerdicts = parseFinalFaithfulnessVerdicts(
        verdicts,
        finalAnswer,
        statements.length,
      );
      if (parsedVerdicts) {
        score = parsedVerdicts.filter((verdict) => verdict === 'yes').length / statements.length;
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
