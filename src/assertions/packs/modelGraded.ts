import { handleConversationRelevance } from '../../external/assertions/deepeval';
import { handleAgentRubric } from '../agentRubric';
import { handleAnswerRelevance } from '../answerRelevance';
import { handleClassifier } from '../classifier';
import { handleContextFaithfulness } from '../contextFaithfulness';
import { handleContextRecall } from '../contextRecall';
import { handleContextRelevance } from '../contextRelevance';
import { handleFactuality } from '../factuality';
import { handleGEval } from '../geval';
import { handleLlmRubric } from '../llmRubric';
import { handleModelGradedClosedQa } from '../modelGradedClosedQa';
import { handleModeration } from '../moderation';
import { handlePiScorer } from '../pi';
import { handleSearchRubric } from '../searchRubric';
import { handleSimilar } from '../similar';

import type { AssertionCapabilityPack } from '../registryTypes';

export const modelGradedAssertionPack = {
  name: 'model-graded',
  handlers: {
    'agent-rubric': handleAgentRubric,
    'answer-relevance': handleAnswerRelevance,
    classifier: handleClassifier,
    'context-faithfulness': handleContextFaithfulness,
    'context-recall': handleContextRecall,
    'context-relevance': handleContextRelevance,
    'conversation-relevance': handleConversationRelevance,
    factuality: handleFactuality,
    'g-eval': handleGEval,
    'llm-rubric': handleLlmRubric,
    'model-graded-closedqa': handleModelGradedClosedQa,
    'model-graded-factuality': handleFactuality,
    moderation: handleModeration,
    pi: handlePiScorer,
    'search-rubric': handleSearchRubric,
    similar: handleSimilar,
    'similar:cosine': handleSimilar,
    'similar:dot': handleSimilar,
    'similar:euclidean': handleSimilar,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleAgentRubric>[0],
  Awaited<ReturnType<typeof handleAgentRubric>>
>;
