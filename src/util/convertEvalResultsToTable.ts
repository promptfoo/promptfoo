import { type EvaluateTable, type EvaluateTableRow, type ResultsFile } from '../types/index';
import invariant from '../util/invariant';

// Types for normalized conversation data
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ConversationData {
  messages: Message[];
  finalPrompt: string;
  strategy: string;
  turnCount: number;
  summary: string;
}

// Helper function to normalize conversation data from various sources
function normalizeConversationData(result: any): ConversationData {
  const metadata = result.metadata || {};
  const responseMetadata = result.response?.metadata || {};

  // Merge metadata from both sources, with responseMetadata taking precedence
  const allMetadata = { ...metadata, ...responseMetadata };

  let messages: Message[] = [];
  let strategy = 'Unknown';

  // Extract messages from various sources
  if (allMetadata.messages) {
    try {
      // Handle both string and array formats
      if (typeof allMetadata.messages === 'string') {
        messages = JSON.parse(allMetadata.messages);
      } else if (Array.isArray(allMetadata.messages)) {
        messages = allMetadata.messages;
      }
    } catch (_e) {
      // If parsing fails, leave messages empty
    }
  } else if (allMetadata.redteamHistory) {
    // Convert redteamHistory format to standard message format
    strategy = 'Iterative';
    messages = allMetadata.redteamHistory.flatMap((entry: any) => [
      { role: 'user' as const, content: entry.prompt || '' },
      { role: 'assistant' as const, content: entry.output || '' },
    ]);
  } else if (allMetadata.redteamTreeHistory) {
    // Convert tree history format
    strategy = 'Tree Search';
    messages = allMetadata.redteamTreeHistory.flatMap((entry: any) => [
      { role: 'user' as const, content: entry.prompt || '' },
      { role: 'assistant' as const, content: entry.output || '' },
    ]);
  }

  // Detect strategy from metadata if not already set
  if (strategy === 'Unknown') {
    if (allMetadata.crescendoConfidence !== undefined) {
      strategy = 'Crescendo';
    } else if (allMetadata.customConfidence !== undefined) {
      strategy = 'Custom';
    } else if (messages.length > 0) {
      strategy = 'Chat';
    }
  }

  const turnCount = Math.floor(messages.filter(m => m.role === 'user').length);
  const summary = generateConversationSummary(messages);

  return {
    messages,
    finalPrompt: allMetadata.redteamFinalPrompt || '',
    strategy,
    turnCount,
    summary,
  };
}

// Helper function to generate conversation summary
function generateConversationSummary(messages: Message[]): string {
  if (messages.length === 0) {
    return '';
  }

  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  const systemMessages = messages.filter(m => m.role === 'system').length;

  const parts = [];
  if (userMessages > 0) {
    parts.push(`${userMessages} user`);
  }
  if (assistantMessages > 0) {
    parts.push(`${assistantMessages} assistant`);
  }
  if (systemMessages > 0) {
    parts.push(`${systemMessages} system`);
  }

  return parts.length > 0 ? `${parts.join(', ')} messages` : '';
}

export function convertResultsToTable(eval_: ResultsFile): EvaluateTable {
  invariant(
    eval_.prompts,
    `Prompts are required in this version of the results file, this needs to be results file version >= 4, version: ${eval_.version}`,
  );
  // first we need to get our prompts, we can get that from any of the results in each column
  const results = eval_.results;
  const varsForHeader = new Set<string>();
  const varValuesForRow = new Map<number, Record<string, string>>();

  const rowMap: Record<number, EvaluateTableRow> = {};
  for (const result of results.results) {
    // vars
    for (const varName of Object.keys(result.vars || {})) {
      varsForHeader.add(varName);
    }

    const row = rowMap[result.testIdx] || {
      description: result.description || undefined,
      outputs: [],
      vars: result.vars
        ? Object.values(varsForHeader)
            .map((varName) => {
              const varValue = result.vars?.[varName] || '';
              if (typeof varValue === 'string') {
                return varValue;
              }
              return JSON.stringify(varValue);
            })
            .flat()
        : [],
      test: result.testCase,
    };

    if (result.vars && result.metadata?.redteamFinalPrompt) {
      const varKeys = Object.keys(result.vars);
      if (varKeys.length === 1 && varKeys[0] !== 'harmCategory') {
        result.vars[varKeys[0]] = result.metadata.redteamFinalPrompt;
      } else if (varKeys.length > 1) {
        // NOTE: This is a hack. We should use config.redteam.injectVar to determine which key to update but we don't have access to the config here
        const targetKeys = ['prompt', 'query', 'question'];
        const keyToUpdate = targetKeys.find((key) => result.vars[key]);
        if (keyToUpdate) {
          result.vars[keyToUpdate] = result.metadata.redteamFinalPrompt;
        }
      }
    }
    varValuesForRow.set(result.testIdx, result.vars as Record<string, string>);
    rowMap[result.testIdx] = row;

    // format text
    let resultText: string | undefined;
    const failReasons = (result.gradingResult?.componentResults || [])
      .filter((result) => (result ? !result.pass : false))
      .map((result) => result.reason)
      .join(' --- ');
    const outputTextDisplay = (
      typeof result.response?.output === 'object'
        ? JSON.stringify(result.response.output)
        : result.response?.output || result.error || ''
    ) as string;
    if (result.testCase.assert) {
      if (result.success) {
        resultText = `${outputTextDisplay || result.error || ''}`;
      } else {
        resultText = `${result.error || failReasons}\n---\n${outputTextDisplay}`;
      }
    } else if (result.error) {
      resultText = `${result.error}`;
    } else {
      resultText = outputTextDisplay;
    }

    row.outputs[result.promptIdx] = {
      id: result.id || `${result.testIdx}-${result.promptIdx}`,
      ...result,
      text: resultText || '',
      prompt: result.prompt.raw,
      provider: result.provider?.label || result.provider?.id || 'unknown provider',
      pass: result.success,
      failureReason: result.failureReason,
      cost: result.cost || 0,
      tokenUsage: result.tokenUsage,
      audio: result.response?.audio
        ? {
            id: result.response.audio.id,
            expiresAt: result.response.audio.expiresAt,
            data: result.response.audio.data,
            transcript: result.response.audio.transcript,
            format: result.response.audio.format,
          }
        : undefined,
      // Add normalized conversation data
      conversationData: normalizeConversationData(result),
    };
    invariant(result.promptId, 'Prompt ID is required');

    row.testIdx = result.testIdx;
  }

  const rows = Object.values(rowMap);
  const sortedVars = [...varsForHeader].sort();
  for (const row of rows) {
    row.vars = sortedVars.map((varName) => varValuesForRow.get(row.testIdx)?.[varName] || '');
  }

  return {
    head: {
      prompts: eval_.prompts,
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}
