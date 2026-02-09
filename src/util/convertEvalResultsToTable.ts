import { type EvaluateTable, type EvaluateTableRow, type ResultsFile } from '../types/index';
import invariant from '../util/invariant';
import { getActualPrompt } from '../util/providerResponse';

/**
 * Converts evaluation results from a ResultsFile into a table format for display.
 * Processes test results, formats variables (including pretty-printing objects/arrays as JSON),
 * handles redteam prompts, and structures data for console table and HTML output.
 *
 * @param eval_ - The results file containing evaluation data (requires version >= 4)
 * @returns An EvaluateTable with formatted headers and body rows for display
 */
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
              const varValue = result.vars?.[varName] ?? '';
              if (typeof varValue === 'string') {
                return varValue;
              }
              return JSON.stringify(varValue, null, 2);
            })
            .flat()
        : [],
      test: result.testCase,
    };

    // Get the actual prompt from response.prompt (provider-reported) or legacy redteamFinalPrompt
    // Check both result.response.metadata and result.metadata for legacy compatibility
    const actualPrompt =
      getActualPrompt(result.response) || (result.metadata?.redteamFinalPrompt as string);

    if (result.vars && actualPrompt) {
      const varKeys = Object.keys(result.vars);
      if (varKeys.length === 1 && varKeys[0] !== 'harmCategory') {
        result.vars[varKeys[0]] = actualPrompt;
      } else if (varKeys.length > 1) {
        // NOTE: This is a hack. We should use config.redteam.injectVar to determine which key to update but we don't have access to the config here
        const targetKeys = ['prompt', 'query', 'question'];
        const keyToUpdate = targetKeys.find((key) => result.vars[key]);
        if (keyToUpdate) {
          result.vars[keyToUpdate] = actualPrompt;
        }
      }
    }

    // Copy sessionId from metadata to vars for display if not already present
    if (result.metadata?.sessionId && !result.vars?.sessionId) {
      result.vars = result.vars || {};
      result.vars.sessionId = result.metadata.sessionId;
      varsForHeader.add('sessionId');
    }

    // Copy transformDisplayVars from response metadata to vars for display
    // This handles layer mode where embeddedInjection is set at runtime, not in test case vars
    const transformDisplayVars = result.response?.metadata?.transformDisplayVars as
      | Record<string, string>
      | undefined;
    if (transformDisplayVars) {
      result.vars = result.vars || {};
      for (const [key, value] of Object.entries(transformDisplayVars)) {
        if (!result.vars[key]) {
          result.vars[key] = value;
          varsForHeader.add(key);
        }
      }
    }

    varValuesForRow.set(result.testIdx, result.vars as Record<string, string>);
    rowMap[result.testIdx] = row;

    // format text
    let resultText: string | undefined;

    const rawOutput = result.response?.output;
    let outputTextDisplay: string;
    if (rawOutput !== null && typeof rawOutput === 'object') {
      outputTextDisplay = JSON.stringify(rawOutput);
    } else if (rawOutput == null || rawOutput === '') {
      outputTextDisplay = result.error || '';
    } else {
      outputTextDisplay = String(rawOutput);
    }
    if (result.testCase.assert) {
      if (result.success) {
        resultText = `${outputTextDisplay || result.error || ''}`;
      } else {
        resultText = `${outputTextDisplay}`;
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
            blobRef: result.response.audio.blobRef,
            transcript: result.response.audio.transcript,
            format: result.response.audio.format,
            sampleRate: result.response.audio.sampleRate,
            channels: result.response.audio.channels,
            duration: result.response.audio.duration,
          }
        : undefined,
      video: result.response?.video
        ? {
            id: result.response.video.id,
            blobRef: result.response.video.blobRef,
            storageRef: result.response.video.storageRef,
            url: result.response.video.url,
            format: result.response.video.format,
            size: result.response.video.size,
            duration: result.response.video.duration,
            thumbnail: result.response.video.thumbnail,
            spritesheet: result.response.video.spritesheet,
            model: result.response.video.model,
            aspectRatio: result.response.video.aspectRatio,
            resolution: result.response.video.resolution,
          }
        : undefined,
    };
    invariant(result.promptId, 'Prompt ID is required');

    row.testIdx = result.testIdx;
  }

  const rows = Object.values(rowMap);
  const sortedVars = [...varsForHeader].sort();
  for (const row of rows) {
    row.vars = sortedVars.map((varName) => {
      const varValue = varValuesForRow.get(row.testIdx)?.[varName] ?? '';
      if (typeof varValue === 'string') {
        return varValue;
      }
      return JSON.stringify(varValue, null, 2);
    });
  }

  return {
    head: {
      prompts: eval_.prompts,
      vars: [...varsForHeader].sort(),
    },
    body: rows,
  };
}
