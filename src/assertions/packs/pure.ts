import { handleBleuScore } from '../bleu';
import {
  handleContains,
  handleContainsAll,
  handleContainsAny,
  handleIContains,
  handleIContainsAll,
  handleIContainsAny,
} from '../contains';
import { handleCost } from '../cost';
import { handleEquals } from '../equals';
import { handleFinishReason } from '../finishReason';
import { handleGleuScore } from '../gleu';
import { handleLatency } from '../latency';
import { handlePerplexity, handlePerplexityScore } from '../perplexity';
import { handleRegex } from '../regex';
import { handleStartsWith } from '../startsWith';
import { handleToolCallF1 } from '../toolCallF1';
import { handleWordCount } from '../wordCount';

import type { AssertionCapabilityPack } from '../registryTypes';

export const pureAssertionPack = {
  name: 'pure',
  handlers: {
    bleu: handleBleuScore,
    contains: handleContains,
    'contains-all': handleContainsAll,
    'contains-any': handleContainsAny,
    cost: handleCost,
    equals: handleEquals,
    'finish-reason': handleFinishReason,
    gleu: handleGleuScore,
    icontains: handleIContains,
    'icontains-all': handleIContainsAll,
    'icontains-any': handleIContainsAny,
    latency: handleLatency,
    perplexity: handlePerplexity,
    'perplexity-score': handlePerplexityScore,
    regex: handleRegex,
    'starts-with': handleStartsWith,
    'tool-call-f1': handleToolCallF1,
    'word-count': handleWordCount,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleContains>[0],
  Awaited<ReturnType<typeof handleContains>>
>;
