# Agent Conversation Replay from Logs - Implementation Plan

## Overview

This feature enables replaying multi-turn conversations from evaluation logs, allowing users to:
1. **Replay exact conversations** step-by-step from stored evaluation results
2. **Resume conversations** from any point in the conversation history
3. **Extract and reuse** conversation patterns for testing
4. **Debug conversation flows** by stepping through historical interactions

## Current State Analysis

### Available Data in Logs
From `evalResultsTable` and SimulatedUser metadata:

```typescript
// Available in metadata.messages
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Available in metadata.redteamHistory
interface RedteamHistory {
  prompt: string;
  output: string;
}

// Complete conversation context
interface ConversationLog {
  evalId: string;
  testIdx: number;
  promptIdx: number;
  metadata: {
    messages: Message[];           // Full conversation
    redteamHistory?: RedteamHistory[];  // Simplified format
    redteamFinalPrompt?: string;   // Last user input
  };
  testCase: AtomicTestCase;        // Original test context
  provider: ProviderOptions;       // Agent configuration
}
```

### Existing Infrastructure
- ✅ `SimulatedUser` class supports multi-turn conversations
- ✅ Complete conversation history stored in `metadata.messages`
- ✅ Database queries via `EvalResult.findManyByEvalId()`
- ✅ Message format standardized across all providers

## Implementation Plan

### Phase 1: Conversation Replay Provider (Week 1)

#### 1.1 ConversationReplayProvider
**File**: `src/providers/conversationReplay.ts`

```typescript
export class ConversationReplayProvider implements ApiProvider {
  private conversation: Message[];
  private currentTurn: number;
  private mode: 'step' | 'full' | 'from-turn';

  constructor(private config: ConversationReplayConfig) {
    this.conversation = config.messages;
    this.currentTurn = config.startFromTurn || 0;
    this.mode = config.mode || 'full';
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    switch (this.mode) {
      case 'step':
        return this.replayNextStep();
      case 'from-turn':
        return this.replayFromTurn(this.currentTurn);
      case 'full':
      default:
        return this.replayFullConversation();
    }
  }

  private replayNextStep(): ProviderResponse {
    const currentMessage = this.conversation[this.currentTurn];
    this.currentTurn++;

    return {
      output: currentMessage.content,
      metadata: {
        replayTurn: this.currentTurn - 1,
        totalTurns: this.conversation.length,
        isComplete: this.currentTurn >= this.conversation.length,
        originalRole: currentMessage.role,
      }
    };
  }

  private replayFromTurn(startTurn: number): ProviderResponse {
    const remainingMessages = this.conversation.slice(startTurn);
    const conversationText = remainingMessages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n---\n');

    return {
      output: conversationText,
      metadata: {
        replayMode: 'from-turn',
        startTurn,
        totalTurns: this.conversation.length,
        messages: remainingMessages,
      }
    };
  }

  private replayFullConversation(): ProviderResponse {
    const conversationText = this.conversation
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n---\n');

    return {
      output: conversationText,
      metadata: {
        replayMode: 'full',
        totalTurns: this.conversation.length,
        messages: this.conversation,
      }
    };
  }

  id(): string {
    return `conversation-replay:${this.config.source}`;
  }
}

interface ConversationReplayConfig {
  source: string; // evalId:testIdx or conversationId
  messages: Message[];
  mode?: 'step' | 'full' | 'from-turn';
  startFromTurn?: number;
}
```

#### 1.2 Conversation Loader
**File**: `src/util/conversationLoader.ts`

```typescript
export class ConversationLoader {
  /**
   * Load conversation from evaluation result
   */
  static async loadFromEvalResult(evalId: string, testIdx: number): Promise<ConversationData | null> {
    const results = await EvalResult.findManyByEvalId(evalId, { testIdx });
    if (results.length === 0) return null;

    const result = results[0];
    const messages = result.metadata?.messages as Message[];

    if (!messages || messages.length === 0) {
      throw new Error(`No conversation messages found for eval ${evalId}, test ${testIdx}`);
    }

    return {
      id: `${evalId}:${testIdx}`,
      evalId,
      testIdx,
      messages,
      metadata: result.metadata,
      testCase: result.testCase,
      provider: result.provider,
      createdAt: new Date(),
    };
  }

  /**
   * Search conversations by content
   */
  static async searchConversations(query: string, limit = 10): Promise<ConversationSearchResult[]> {
    const db = getDb();

    // Search in metadata.messages content
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        sql`json_extract(${evalResultsTable.metadata}, '$.messages') LIKE ${`%${query}%`}`
      )
      .limit(limit);

    return results.map(result => ({
      id: `${result.evalId}:${result.testIdx}`,
      evalId: result.evalId,
      testIdx: result.testIdx,
      preview: this.extractConversationPreview(result.metadata?.messages as Message[]),
      matchScore: this.calculateRelevanceScore(result.metadata?.messages as Message[], query),
    }));
  }

  /**
   * List conversations from evaluation
   */
  static async listConversations(evalId: string): Promise<ConversationSummary[]> {
    const results = await EvalResult.findManyByEvalId(evalId);

    return results
      .filter(result => result.metadata?.messages)
      .map(result => ({
        id: `${result.evalId}:${result.testIdx}`,
        evalId: result.evalId,
        testIdx: result.testIdx,
        turns: (result.metadata?.messages as Message[]).length,
        preview: this.extractConversationPreview(result.metadata?.messages as Message[]),
        success: result.success,
        score: result.score,
      }));
  }

  private static extractConversationPreview(messages: Message[]): string {
    if (!messages || messages.length === 0) return '';

    const firstUser = messages.find(m => m.role === 'user')?.content || '';
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop()?.content || '';

    return `User: ${firstUser.slice(0, 50)}... → Assistant: ${lastAssistant.slice(0, 50)}...`;
  }

  private static calculateRelevanceScore(messages: Message[], query: string): number {
    const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
    const queryLower = query.toLowerCase();
    const matches = (conversationText.match(new RegExp(queryLower, 'g')) || []).length;
    return matches / conversationText.length * 1000; // Normalized score
  }
}

interface ConversationData {
  id: string;
  evalId: string;
  testIdx: number;
  messages: Message[];
  metadata: Record<string, any>;
  testCase: AtomicTestCase;
  provider: ProviderOptions;
  createdAt: Date;
}

interface ConversationSearchResult {
  id: string;
  evalId: string;
  testIdx: number;
  preview: string;
  matchScore: number;
}

interface ConversationSummary {
  id: string;
  evalId: string;
  testIdx: number;
  turns: number;
  preview: string;
  success: boolean;
  score: number;
}
```

### Phase 2: CLI Commands (Week 2)

#### 2.1 Replay Command
**File**: `src/commands/replay.ts`

```typescript
import { Command } from 'commander';
import { ConversationLoader } from '../util/conversationLoader';
import { ConversationReplayProvider } from '../providers/conversationReplay';

export function replayCommand(program: Command) {
  const replayCmd = program
    .command('replay')
    .description('Replay conversations from evaluation logs');

  // Replay specific conversation
  replayCmd
    .command('conversation')
    .description('Replay a specific conversation')
    .option('--eval <evalId>', 'Evaluation ID')
    .option('--test <testIdx>', 'Test index', parseInt)
    .option('--from-turn <turn>', 'Start from specific turn', parseInt)
    .option('--step', 'Replay step by step')
    .option('--interactive', 'Interactive replay mode')
    .action(async (options) => {
      await replayConversation(options);
    });

  // List conversations
  replayCmd
    .command('list')
    .description('List conversations from evaluation')
    .option('--eval <evalId>', 'Evaluation ID')
    .option('--limit <limit>', 'Maximum results', parseInt, 20)
    .action(async (options) => {
      await listConversations(options);
    });

  // Search conversations
  replayCmd
    .command('search')
    .description('Search conversations by content')
    .argument('<query>', 'Search query')
    .option('--limit <limit>', 'Maximum results', parseInt, 10)
    .action(async (query, options) => {
      await searchConversations(query, options);
    });
}

async function replayConversation(options: any) {
  const { eval: evalId, test: testIdx, fromTurn, step, interactive } = options;

  if (!evalId || testIdx === undefined) {
    console.error('Both --eval and --test are required');
    process.exit(1);
  }

  const conversation = await ConversationLoader.loadFromEvalResult(evalId, testIdx);
  if (!conversation) {
    console.error(`No conversation found for eval ${evalId}, test ${testIdx}`);
    process.exit(1);
  }

  if (interactive) {
    await interactiveReplay(conversation, fromTurn);
  } else if (step) {
    await stepReplay(conversation, fromTurn);
  } else {
    await fullReplay(conversation, fromTurn);
  }
}

async function interactiveReplay(conversation: ConversationData, startTurn = 0) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n🎬 Interactive Replay: ${conversation.id}`);
  console.log(`📊 Total turns: ${conversation.messages.length}`);
  console.log(`🚀 Starting from turn: ${startTurn}\n`);

  let currentTurn = startTurn;

  while (currentTurn < conversation.messages.length) {
    const message = conversation.messages[currentTurn];

    console.log(`\n[Turn ${currentTurn + 1}/${conversation.messages.length}]`);
    console.log(`${message.role.toUpperCase()}: ${message.content}`);

    if (currentTurn < conversation.messages.length - 1) {
      const answer = await new Promise(resolve => {
        rl.question('\nPress Enter for next turn, "q" to quit, or turn number to jump: ', resolve);
      });

      if (answer === 'q') break;
      if (!isNaN(Number(answer))) {
        currentTurn = Math.max(0, Math.min(Number(answer) - 1, conversation.messages.length - 1));
        continue;
      }
    }

    currentTurn++;
  }

  rl.close();
  console.log('\n✅ Replay complete');
}

async function stepReplay(conversation: ConversationData, startTurn = 0) {
  console.log(`\n🎬 Step Replay: ${conversation.id}`);
  console.log(`📊 Total turns: ${conversation.messages.length}`);
  console.log(`🚀 Starting from turn: ${startTurn}\n`);

  for (let i = startTurn; i < conversation.messages.length; i++) {
    const message = conversation.messages[i];
    console.log(`[Turn ${i + 1}] ${message.role.toUpperCase()}: ${message.content}`);
    console.log('---');
  }
}

async function fullReplay(conversation: ConversationData, startTurn = 0) {
  console.log(`\n🎬 Full Replay: ${conversation.id}`);
  console.log(`📊 Total turns: ${conversation.messages.length}`);
  if (startTurn > 0) {
    console.log(`🚀 Starting from turn: ${startTurn}`);
  }
  console.log('');

  const messagesToReplay = conversation.messages.slice(startTurn);
  const output = messagesToReplay
    .map((msg, idx) => `[Turn ${startTurn + idx + 1}] ${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n---\n');

  console.log(output);
  console.log('\n✅ Replay complete');
}

async function listConversations(options: any) {
  const { eval: evalId, limit } = options;

  if (!evalId) {
    console.error('--eval is required');
    process.exit(1);
  }

  const conversations = await ConversationLoader.listConversations(evalId);

  console.log(`\n📋 Conversations in evaluation ${evalId}:\n`);

  conversations.slice(0, limit).forEach(conv => {
    const status = conv.success ? '✅' : '❌';
    console.log(`${status} Test ${conv.testIdx} (${conv.turns} turns, score: ${conv.score})`);
    console.log(`   ${conv.preview}`);
    console.log(`   Replay: promptfoo replay conversation --eval ${evalId} --test ${conv.testIdx}\n`);
  });
}

async function searchConversations(query: string, options: any) {
  const { limit } = options;

  const results = await ConversationLoader.searchConversations(query, limit);

  console.log(`\n🔍 Search results for "${query}":\n`);

  if (results.length === 0) {
    console.log('No conversations found matching your query.');
    return;
  }

  results.forEach((result, idx) => {
    console.log(`${idx + 1}. Eval ${result.evalId}, Test ${result.testIdx} (relevance: ${result.matchScore.toFixed(2)})`);
    console.log(`   ${result.preview}`);
    console.log(`   Replay: promptfoo replay conversation --eval ${result.evalId} --test ${result.testIdx}\n`);
  });
}
```

### Phase 3: Configuration Support (Week 3)

#### 3.1 Provider Configuration
**File**: Integration with `src/providers/registry.ts`

```typescript
// Add to provider registry
case 'conversation-replay':
case 'replay':
  const replayConfig = await ConversationLoader.loadFromEvalResult(
    providerOptions.config.evalId,
    providerOptions.config.testIdx
  );
  return new ConversationReplayProvider({
    source: `${providerOptions.config.evalId}:${providerOptions.config.testIdx}`,
    messages: replayConfig.messages,
    mode: providerOptions.config.mode,
    startFromTurn: providerOptions.config.startFromTurn,
  });
```

#### 3.2 YAML Configuration Support
```yaml
# promptfooconfig.yaml
providers:
  - id: 'conversation-replay'
    config:
      evalId: 'eval-abc123'
      testIdx: 5
      mode: 'full'  # or 'step', 'from-turn'
      startFromTurn: 3  # optional

tests:
  - description: 'Replay conversation and test modifications'
    vars:
      newInput: 'What if the user asked this instead?'
    assert:
      - type: llm-rubric
        value: 'Does the replayed conversation provide context for the test?'
```

## Example Usage

### 1. CLI Commands
```bash
# List conversations from an evaluation
promptfoo replay list --eval eval-abc123

# Replay specific conversation
promptfoo replay conversation --eval eval-abc123 --test 5

# Interactive step-through
promptfoo replay conversation --eval eval-abc123 --test 5 --interactive

# Start from specific turn
promptfoo replay conversation --eval eval-abc123 --test 5 --from-turn 3

# Search conversations
promptfoo replay search "password reset"
```

### 2. Programmatic Usage
```typescript
// Load and replay conversation
const conversation = await ConversationLoader.loadFromEvalResult('eval-123', 5);
const replayProvider = new ConversationReplayProvider({
  source: 'eval-123:5',
  messages: conversation.messages,
  mode: 'step'
});

// Use in evaluation
const result = await replayProvider.callApi('');
console.log(result.output); // Replayed conversation
```

### 3. Testing with Replayed Conversations
```yaml
# Use replayed conversation as context for new tests
providers:
  - id: 'openai:gpt-4'
    config:
      temperature: 0.1

prompts:
  - |
    Given this previous conversation:
    {{replayedConversation}}

    How would you handle this new request: {{newRequest}}

tests:
  - vars:
      replayedConversation: '{{replay:eval-123:5}}'
      newRequest: 'I want to cancel my order'
```

## Implementation Benefits

### 1. Debug Agent Behavior
- Step through exact conversation history
- Identify failure points in multi-turn interactions
- Understand context dependency issues

### 2. Extract Conversation Patterns
- Reuse successful conversation flows
- Create test cases from real interactions
- Build training data from evaluation logs

### 3. Context-Aware Testing
- Test new scenarios with historical context
- Validate agent consistency across similar conversations
- Compare agent responses to past interactions

### 4. Minimal Implementation Complexity
- ✅ Leverages existing `metadata.messages` format
- ✅ Uses existing database infrastructure
- ✅ Integrates with current provider system
- ✅ No new data storage requirements

## Success Criteria

### Functional Requirements
- ✅ Replay any conversation from evaluation logs
- ✅ Support step-by-step and full replay modes
- ✅ Interactive conversation browsing
- ✅ Search conversations by content
- ✅ Integration with existing promptfoo configuration

### Performance Requirements
- Conversation loading: <1 second for conversations with <100 turns
- Search performance: <2 seconds for database queries
- Memory usage: Efficient streaming for large conversations

### Quality Requirements
- 100% fidelity to original conversation content
- Preserves original message order and timing context
- Clear error handling for missing or corrupted conversation data

This focused implementation provides immediate value for debugging and understanding agent behavior while building on promptfoo's existing robust infrastructure.