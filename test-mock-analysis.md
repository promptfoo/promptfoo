# Jest Mock Analysis for test/matchers/*.test.ts

## Global Mocks (jest.setup.ts)
- `./src/logger`
- `./src/globalConfig/globalConfig`

## Mock Analysis by File

### 1. answer-relevance.test.ts

**Mocks:**
- `../../src/database` - Not used (no database imports)
- `../../src/esm` - Listed twice, not used (no esm imports beyond mock)
- `../../src/cliState` - Not used (no cliState imports)
- `../../src/remoteGrading` - Not used (no remoteGrading imports)
- `../../src/redteam/remoteGeneration` - Not used (no remoteGeneration imports)
- `proxy-agent` - Not used (no proxy-agent imports)
- `glob` - Not used (no glob imports)
- `better-sqlite3` - Not used (no better-sqlite3 imports)
- `fs` - Not used (no fs imports)

**Actually Used Imports:**
- `matchesAnswerRelevance` from '../../src/matchers'
- `ANSWER_RELEVANCY_GENERATE` from '../../src/prompts'
- `DefaultEmbeddingProvider, DefaultGradingProvider` from '../../src/providers/openai/defaults'
- type `OpenAiEmbeddingProvider` from '../../src/providers/openai/embedding'

**Can Remove:** All mocks except potentially the global ones

### 2. classification.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/esm` - Listed twice, not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used
- `glob` - Not used
- `better-sqlite3` - Not used
- `fs` - Not used

**Actually Used Imports:**
- `matchesClassification` from '../../src/matchers'
- `HuggingfaceTextClassificationProvider` from '../../src/providers/huggingface'
- types from '../../src/types'

**Can Remove:** All mocks except potentially the global ones

### 3. closed-qa.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/esm` - Listed twice, not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used
- `glob` - Not used
- `better-sqlite3` - Not used
- `fs` - Not used

**Actually Used Imports:**
- `matchesClosedQa` from '../../src/matchers'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'
- type `GradingConfig` from '../../src/types'

**Can Remove:** All mocks except potentially the global ones

### 4. context-faithfulness.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used

**Actually Used Imports:**
- `matchesContextFaithfulness` from '../../src/matchers'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'

**Can Remove:** All mocks except potentially the global ones

### 5. context-recall.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used

**Actually Used Imports:**
- `matchesContextRecall` from '../../src/matchers'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'

**Can Remove:** All mocks except potentially the global ones

### 6. context-relevance.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/esm` - Listed twice, not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used
- `glob` - Not used
- `better-sqlite3` - Not used
- `fs` - Not used

**Actually Used Imports:**
- `matchesContextRelevance` from '../../src/matchers'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'

**Can Remove:** All mocks except potentially the global ones

### 7. factuality.test.ts

**Mocks:**
- None! (Only comment: "No additional mocks needed for matchesFactuality tests")

**Actually Used Imports:**
- `matchesFactuality` from '../../src/matchers'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'
- type `GradingConfig` from '../../src/types'

**Can Remove:** N/A - already clean!

### 8. g-eval.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used

**Actually Used Imports:**
- `matchesGEval` from '../../src/matchers'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'

**Can Remove:** All mocks except potentially the global ones

### 9. llm-rubric.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/esm` - USED (importModule is imported and used)
- `../../src/cliState` - USED (cliState is imported and used)
- `../../src/remoteGrading` - USED (remoteGrading is imported and used)
- `../../src/redteam/remoteGeneration` - USED (shouldGenerateRemote is used via jest.requireMock)
- `proxy-agent` - Not used
- `glob` - Not used
- `better-sqlite3` - Not used
- `fs` - USED (fs is imported and used)

**Actually Used Imports:**
- `fs` from 'fs'
- `path` from 'path'
- `loadFromJavaScriptFile` from '../../src/assertions/utils'
- `cliState` from '../../src/cliState'
- `importModule` from '../../src/esm'
- `matchesLlmRubric, renderLlmRubricPrompt` from '../../src/matchers'
- `OpenAiChatCompletionProvider` from '../../src/providers/openai/chat'
- `DefaultGradingProvider` from '../../src/providers/openai/defaults'
- `remoteGrading` from '../../src/remoteGrading'
- types from '../../src/types'
- `TestGrader` from '../util/utils'

**Can Remove:** `../../src/database`, `proxy-agent`, `glob`, `better-sqlite3`

### 10. moderation.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used

**Actually Used Imports:**
- `matchesModeration` from '../../src/matchers'
- `OpenAiModerationProvider` from '../../src/providers/openai/moderation'
- `ReplicateModerationProvider` from '../../src/providers/replicate'
- `LLAMA_GUARD_REPLICATE_PROVIDER` from '../../src/redteam/constants'

**Can Remove:** All mocks except potentially the global ones

### 11. similarity.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/esm` - Listed twice, not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used
- `glob` - Not used
- `better-sqlite3` - Not used
- `fs` - Not used

**Actually Used Imports:**
- `matchesSimilarity` from '../../src/matchers'
- type `OpenAiChatCompletionProvider` from '../../src/providers/openai/chat'
- `DefaultEmbeddingProvider` from '../../src/providers/openai/defaults'
- `OpenAiEmbeddingProvider` from '../../src/providers/openai/embedding'
- type `GradingConfig` from '../../src/types'

**Can Remove:** All mocks except potentially the global ones

### 12. utils.test.ts

**Mocks:**
- `../../src/database` - Not used
- `../../src/esm` - Listed twice, not used
- `../../src/cliState` - Not used
- `../../src/remoteGrading` - Not used
- `../../src/redteam/remoteGeneration` - Not used
- `proxy-agent` - Not used
- `glob` - Not used
- `better-sqlite3` - Not used
- `fs` - Not used

**Actually Used Imports:**
- `getAndCheckProvider, getGradingProvider, renderLlmRubricPrompt` from '../../src/matchers'
- `DefaultEmbeddingProvider, DefaultGradingProvider` from '../../src/providers/openai/defaults'
- types from '../../src/types'

**Can Remove:** All mocks except potentially the global ones

## Summary

Most test files have excessive mocks that are not actually used. Only `llm-rubric.test.ts` actually uses most of its mocks. The `factuality.test.ts` file is the cleanest with no unnecessary mocks.

### Common Unused Mocks Across Files:
- `../../src/database` - Never used in any file
- `proxy-agent` - Never used in any file
- `glob` - Never used in any file
- `better-sqlite3` - Never used in any file
- `../../src/esm` - Only used in llm-rubric.test.ts
- `../../src/cliState` - Only used in llm-rubric.test.ts
- `../../src/remoteGrading` - Only used in llm-rubric.test.ts
- `../../src/redteam/remoteGeneration` - Only used in llm-rubric.test.ts
- `fs` - Only used in llm-rubric.test.ts