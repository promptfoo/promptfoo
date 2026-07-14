type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
  text?: string;
  refusal?: string;
  arguments?: string;
  item_id?: string;
  name?: string;
  output_text?: { delta?: string };
  output_index?: number;
  content_index?: number;
  part?: { type?: string; text?: string; refusal?: string };
  item?: {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    refusal?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  };
  output?: any[];
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
};

type ResponsesStreamLogger = {
  debug(message: string, context?: Record<string, unknown>): unknown;
};

type FinalizedStreamOutputItem = {
  outputIndex?: number;
  item: any;
};

type RetainedStreamOutputItem = FinalizedStreamOutputItem & {
  serializedLength: number;
};

const MAX_STREAM_OUTPUT_INDEX = 1024;
const MAX_STREAM_CONTENT_INDEX = 1024;
const MAX_STREAM_OUTPUT_KEYS = 1024;
const MAX_STREAM_OUTPUT_CHARS = 16 * 1024 * 1024;
const MAX_STREAM_FUNCTION_METADATA_CHARS = 4096;

function getOutputTextDelta(event: ResponsesStreamEvent): string | undefined {
  if (typeof event.delta === 'string') {
    return event.delta;
  }
  return typeof event.output_text?.delta === 'string' ? event.output_text.delta : undefined;
}

function getOutputTextKey(event: ResponsesStreamEvent): string | undefined {
  if (
    typeof event.output_index !== 'number' ||
    !Number.isInteger(event.output_index) ||
    event.output_index < 0 ||
    event.output_index > MAX_STREAM_OUTPUT_INDEX
  ) {
    return undefined;
  }
  if (
    event.content_index !== undefined &&
    (typeof event.content_index !== 'number' ||
      !Number.isInteger(event.content_index) ||
      event.content_index < 0 ||
      event.content_index > MAX_STREAM_CONTENT_INDEX)
  ) {
    return undefined;
  }
  const contentIndex = event.content_index ?? 0;
  return `${event.output_index}:${contentIndex}`;
}

function getInvalidOutputTextKey(event: ResponsesStreamEvent): string {
  return `${String(event.output_index ?? 'missing')}:${String(event.content_index ?? 0)}`;
}

function getValidOutputIndex(event: ResponsesStreamEvent): number | undefined {
  return typeof event.output_index === 'number' &&
    Number.isInteger(event.output_index) &&
    event.output_index >= 0 &&
    event.output_index <= MAX_STREAM_OUTPUT_INDEX
    ? event.output_index
    : undefined;
}

function getOutputTextDoneEvents(event: ResponsesStreamEvent): ResponsesStreamEvent[] {
  if (event.type === 'response.output_text.done') {
    return [event];
  }
  if (event.type === 'response.content_part.done' && event.part?.type === 'output_text') {
    return [{ ...event, text: event.part.text }];
  }
  if (
    event.type === 'response.output_item.done' &&
    event.item?.type === 'message' &&
    Array.isArray(event.item.content)
  ) {
    return event.item.content.flatMap((part, contentIndex) =>
      part?.type === 'output_text'
        ? [{ ...event, content_index: contentIndex, text: part.text }]
        : [],
    );
  }
  return [];
}

function getOutputRefusalItem(event: ResponsesStreamEvent): any | undefined {
  if (event.type === 'response.refusal.delta' && typeof event.delta === 'string') {
    return {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'refusal', refusal: event.delta }],
    };
  }
  if (event.type === 'response.refusal.done' && typeof event.refusal === 'string') {
    return {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'refusal', refusal: event.refusal }],
    };
  }
  if (event.type === 'response.content_part.done' && event.part?.type === 'refusal') {
    return { type: 'message', role: 'assistant', content: [event.part] };
  }
  if (
    event.type === 'response.output_item.done' &&
    (event.item?.type === 'refusal' ||
      (event.item?.type === 'message' &&
        typeof event.item.refusal === 'string' &&
        event.item.refusal.length > 0) ||
      (Array.isArray(event.item?.content) &&
        event.item.content.some((part) => part?.type === 'refusal')))
  ) {
    return event.item?.type === 'refusal'
      ? {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'refusal', refusal: event.item.refusal }],
        }
      : event.item;
  }
  return undefined;
}

function getTerminalOutputTexts(output: any[] | undefined): string[] {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .flatMap((item: any) =>
      item?.type === 'message' && Array.isArray(item.content)
        ? item.content
            .filter((content: any) => content?.type === 'output_text')
            .map((content: any) => (typeof content.text === 'string' ? content.text : ''))
        : [],
    )
    .filter(Boolean);
}

function hasTerminalSafetyDecision(response: any): boolean {
  if (
    [response?.incomplete_details?.reason, response?.error?.code, response?.error?.message].some(
      (reason) =>
        typeof reason === 'string' &&
        /(?:content[_-]?filter|content[_-]?policy|safety|guardrail)/i.test(reason),
    )
  ) {
    return true;
  }
  return (
    Array.isArray(response?.output) &&
    response.output.some(
      (item: any) =>
        item?.type === 'refusal' ||
        (item?.type === 'message' &&
          ((typeof item.refusal === 'string' && item.refusal.length > 0) ||
            (Array.isArray(item.content) &&
              item.content.some((content: any) => content?.type === 'refusal')))),
    )
  );
}

function filterExecutableToolCalls(output: any[] | undefined): any[] {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .filter((item: any) => item !== undefined && item?.type !== 'function_call')
    .map((item: any) =>
      item?.type === 'refusal'
        ? {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'refusal', refusal: item.refusal }],
          }
        : item?.type === 'message' && Array.isArray(item.content)
          ? {
              ...item,
              content: item.content.filter(
                (content: any) => content?.type !== 'tool_use' && content?.type !== 'function_call',
              ),
            }
          : item,
    );
}

function hasExecutableToolCalls(output: any[] | undefined): boolean {
  return (
    Array.isArray(output) &&
    output.some(
      (item: any) =>
        item?.type === 'function_call' ||
        (item?.type === 'message' &&
          Array.isArray(item.content) &&
          item.content.some(
            (content: any) => content?.type === 'tool_use' || content?.type === 'function_call',
          )),
    )
  );
}

function hasRefusalOutput(output: any[] | undefined): boolean {
  return (
    Array.isArray(output) &&
    output.some(
      (item: any) =>
        item?.type === 'refusal' ||
        (item?.type === 'message' &&
          ((typeof item.refusal === 'string' && item.refusal.length > 0) ||
            (Array.isArray(item.content) &&
              item.content.some((content: any) => content?.type === 'refusal')))),
    )
  );
}

function mergeFinalizedStreamOutput(
  output: any[] | undefined,
  finalizedNonMessageItems: FinalizedStreamOutputItem[],
  finalizedRefusalItems: FinalizedStreamOutputItem[],
  preferFinalizedNonMessageItems: boolean,
): any[] {
  const refusalIndexes = new Set(
    finalizedRefusalItems
      .map(({ outputIndex }) => outputIndex)
      .filter((outputIndex): outputIndex is number => outputIndex !== undefined),
  );
  const hasUnindexedRefusal = finalizedRefusalItems.some(
    ({ outputIndex }) => outputIndex === undefined,
  );
  const entries: FinalizedStreamOutputItem[] = (Array.isArray(output) ? output : [])
    .map((item, outputIndex) => ({ item, outputIndex }))
    .filter(
      ({ item, outputIndex }) =>
        item !== undefined &&
        !(item?.type === 'message' && (hasUnindexedRefusal || refusalIndexes.has(outputIndex))),
    );

  for (const finalizedItem of finalizedNonMessageItems) {
    const identity = finalizedItem.item?.id ?? finalizedItem.item?.call_id;
    const existingIndex = entries.findIndex(({ item, outputIndex }) => {
      if (
        finalizedItem.outputIndex !== undefined &&
        outputIndex === finalizedItem.outputIndex &&
        item?.type === finalizedItem.item?.type
      ) {
        return true;
      }
      return (
        typeof identity === 'string' &&
        item?.type === finalizedItem.item?.type &&
        (item?.id === identity || item?.call_id === identity)
      );
    });
    if (existingIndex < 0 && preferFinalizedNonMessageItems) {
      entries.push(finalizedItem);
    } else if (preferFinalizedNonMessageItems) {
      entries[existingIndex] = {
        ...entries[existingIndex],
        item: { ...entries[existingIndex].item, ...finalizedItem.item },
      };
    }
  }

  entries.push(...finalizedRefusalItems);
  const indexedOutput: any[] = [];
  const appendedOutput: any[] = [];
  for (const { item, outputIndex } of entries.sort(
    (left, right) => (left.outputIndex ?? Infinity) - (right.outputIndex ?? Infinity),
  )) {
    if (outputIndex !== undefined && indexedOutput[outputIndex] === undefined) {
      indexedOutput[outputIndex] = item;
    } else {
      appendedOutput.push(item);
    }
  }
  return [...indexedOutput, ...appendedOutput];
}

function recoverIncompleteOutput(
  output: any[] | undefined,
  outputTextByContent: Map<string, string>,
  unindexedOutputTexts: string[],
  allowTerminalTextReplacement: boolean,
  finalizedOutputTextKeys: ReadonlySet<string>,
  finalizedUnindexedOutputTextCount = 0,
): any[] | undefined {
  const recoveredOutput = Array.isArray(output)
    ? output.map((item: any) =>
        item?.type === 'message' && Array.isArray(item.content)
          ? { ...item, content: [...item.content] }
          : item,
      )
    : [];
  const terminalTextLocations = recoveredOutput.flatMap((item: any, outputIndex: number) =>
    item?.type === 'message' && Array.isArray(item.content)
      ? item.content.flatMap((content: any, contentIndex: number) =>
          content?.type === 'output_text' ? [{ outputIndex, contentIndex }] : [],
        )
      : [],
  );
  const unindexedTextLocations = terminalTextLocations.filter(
    ({ outputIndex, contentIndex }) => !outputTextByContent.has(`${outputIndex}:${contentIndex}`),
  );
  const streamedTexts = Array.from(outputTextByContent, ([key, text]) => {
    const [outputIndex, contentIndex] = key.split(':').map(Number);
    return {
      outputIndex,
      contentIndex,
      text,
      finalized: finalizedOutputTextKeys.has(key),
    };
  }).sort(
    (left, right) => left.outputIndex - right.outputIndex || left.contentIndex - right.contentIndex,
  );
  if (unindexedOutputTexts.length === unindexedTextLocations.length) {
    unindexedOutputTexts.forEach((text, index) => {
      streamedTexts.push({
        ...unindexedTextLocations[index],
        text,
        finalized: index < finalizedUnindexedOutputTextCount,
      });
    });
  }

  let recoveredText = false;
  const unmatchedStreamedTexts: string[] = [];
  const appendedOutputItems = new Map<number, any>();
  for (const { outputIndex, contentIndex, text, finalized } of streamedTexts) {
    let item = recoveredOutput[outputIndex] ?? appendedOutputItems.get(outputIndex);
    if (!item) {
      item = { type: 'message', role: 'assistant', content: [] };
      if (outputIndex < recoveredOutput.length) {
        recoveredOutput[outputIndex] = item;
      } else {
        recoveredOutput.push(item);
        appendedOutputItems.set(outputIndex, item);
      }
    }
    if (item.type !== 'message') {
      unmatchedStreamedTexts.push(text);
      continue;
    }
    if (!Array.isArray(item.content)) {
      item.content = [];
    }
    const targetContentIndex = Math.min(contentIndex, item.content.length);
    const createdContent = item.content.length === targetContentIndex;
    if (createdContent) {
      item.content.push({ type: 'output_text', text: '' });
    }
    const content = item.content[targetContentIndex];
    if (content?.type !== 'output_text') {
      unmatchedStreamedTexts.push(text);
      continue;
    }
    if (
      typeof content.text !== 'string' ||
      (content.text.length === 0 && (createdContent || allowTerminalTextReplacement)) ||
      (allowTerminalTextReplacement &&
        (finalized ? text !== content.text : text.length > content.text.length))
    ) {
      item.content[targetContentIndex] = { ...content, text };
      recoveredText = true;
    }
  }

  for (const text of unmatchedStreamedTexts) {
    recoveredOutput.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
    });
    recoveredText = true;
  }

  if (unindexedOutputTexts.length !== unindexedTextLocations.length) {
    const terminalTexts = getTerminalOutputTexts(recoveredOutput);
    const terminalTextCounts = new Map<string, number>();
    for (const text of terminalTexts) {
      terminalTextCounts.set(text, (terminalTextCounts.get(text) ?? 0) + 1);
    }
    let joinedTerminalText = terminalTexts.join('');
    for (const text of unindexedOutputTexts) {
      const remainingMatches = terminalTextCounts.get(text) ?? 0;
      if (remainingMatches > 0) {
        terminalTextCounts.set(text, remainingMatches - 1);
        continue;
      }
      if (joinedTerminalText && joinedTerminalText === text) {
        joinedTerminalText = '';
        continue;
      }
      recoveredOutput.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      });
      recoveredText = true;
    }
  }

  return recoveredText ? recoveredOutput : undefined;
}

function parseSseEvent(
  chunk: string,
  providerName: string,
  logger: ResponsesStreamLogger,
): ResponsesStreamEvent | undefined {
  const data = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') {
    return undefined;
  }

  try {
    return JSON.parse(data) as ResponsesStreamEvent;
  } catch {
    logger.debug(`[${providerName} Responses] Ignoring malformed SSE payload`, {
      dataLength: data.length,
    });
    return undefined;
  }
}

export async function readResponsesStream(
  response: Response,
  providerName: string,
  logger: ResponsesStreamLogger,
): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let latestResponse: any;
  let outputText = '';
  const outputTextByContent = new Map<string, string>();
  let currentOutputTextKey: string | undefined;
  let pendingUnindexedOutputText = '';
  let unassignedUnindexedOutputText = '';
  const completedUnindexedOutputTexts: string[] = [];
  const finalizedOutputTextKeys = new Set<string>();
  const invalidlyIndexedOutputTextByContent = new Map<string, string>();
  const finalizedInvalidOutputTextKeys = new Set<string>();
  let currentInvalidOutputTextKey: string | undefined;
  const finalizedNonMessageItems = new Map<string, RetainedStreamOutputItem>();
  const finalizedRefusalItems = new Map<string, RetainedStreamOutputItem>();
  const addedFunctionItems = new Map<string, Record<string, string | undefined>>();
  let sawFinalizedRefusal = false;
  let finalizedOutputChars = 0;

  const appendOutputText = (text: string): void => {
    if (text.length > MAX_STREAM_OUTPUT_CHARS - outputText.length - finalizedOutputChars) {
      throw new Error(
        `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output`,
      );
    }
    outputText += text;
  };

  const boundedResponse = (value: any): any => {
    if (
      Array.isArray(value?.output) &&
      JSON.stringify(value.output).length > MAX_STREAM_OUTPUT_CHARS
    ) {
      throw new Error(
        `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output`,
      );
    }
    return value;
  };

  const setFinalizedOutputItem = (
    target: Map<string, RetainedStreamOutputItem>,
    key: string,
    outputIndex: number | undefined,
    item: any,
  ): void => {
    if (!hasStreamOutputCapacity(target.has(key), target !== finalizedRefusalItems)) {
      return;
    }

    const serializedLength = JSON.stringify(item).length;
    const previousLength = target.get(key)?.serializedLength ?? 0;
    const growth = serializedLength - previousLength;
    if (growth > MAX_STREAM_OUTPUT_CHARS - outputText.length - finalizedOutputChars) {
      throw new Error(
        `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output`,
      );
    }

    finalizedOutputChars += growth;
    target.set(key, { outputIndex, item, serializedLength });
  };

  const hasStreamOutputCapacity = (existing: boolean, reserveForRefusal = true): boolean =>
    existing ||
    outputTextByContent.size +
      invalidlyIndexedOutputTextByContent.size +
      completedUnindexedOutputTexts.length +
      finalizedNonMessageItems.size +
      finalizedRefusalItems.size <
      MAX_STREAM_OUTPUT_KEYS - (reserveForRefusal ? 1 : 0);

  const processOutputTextEvent = (event: ResponsesStreamEvent) => {
    const delta = getOutputTextDelta(event);
    if (!delta) {
      return;
    }

    const key = getOutputTextKey(event);
    const invalidKey =
      !key && (event.output_index !== undefined || event.content_index !== undefined)
        ? getInvalidOutputTextKey(event)
        : undefined;
    if (
      (key && finalizedOutputTextKeys.has(key)) ||
      (invalidKey && finalizedInvalidOutputTextKeys.has(invalidKey))
    ) {
      return;
    }

    appendOutputText(delta);
    if (key) {
      if (!hasStreamOutputCapacity(outputTextByContent.has(key))) {
        currentOutputTextKey = undefined;
        currentInvalidOutputTextKey = undefined;
        pendingUnindexedOutputText = '';
        return;
      }
      const prependPending =
        event.output_index === 0 &&
        (event.content_index ?? 0) === 0 &&
        !outputTextByContent.has(key);
      if (!prependPending) {
        unassignedUnindexedOutputText += pendingUnindexedOutputText;
      }
      outputTextByContent.set(
        key,
        (outputTextByContent.get(key) ?? '') +
          (prependPending ? pendingUnindexedOutputText : '') +
          delta,
      );
      currentOutputTextKey = key;
      pendingUnindexedOutputText = '';
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (event.output_index !== undefined || event.content_index !== undefined) {
      const invalidKey = getInvalidOutputTextKey(event);
      if (!hasStreamOutputCapacity(invalidlyIndexedOutputTextByContent.has(invalidKey))) {
        currentOutputTextKey = undefined;
        currentInvalidOutputTextKey = undefined;
        pendingUnindexedOutputText = '';
        return;
      }
      invalidlyIndexedOutputTextByContent.set(
        invalidKey,
        (invalidlyIndexedOutputTextByContent.get(invalidKey) ?? '') +
          pendingUnindexedOutputText +
          delta,
      );
      currentOutputTextKey = undefined;
      pendingUnindexedOutputText = '';
      currentInvalidOutputTextKey = invalidKey;
      return;
    }
    if (currentInvalidOutputTextKey) {
      invalidlyIndexedOutputTextByContent.set(
        currentInvalidOutputTextKey,
        (invalidlyIndexedOutputTextByContent.get(currentInvalidOutputTextKey) ?? '') + delta,
      );
      return;
    }
    if (currentOutputTextKey) {
      outputTextByContent.set(
        currentOutputTextKey,
        (outputTextByContent.get(currentOutputTextKey) ?? '') + delta,
      );
      return;
    }

    pendingUnindexedOutputText += delta;
  };

  const processOutputTextDoneEvent = (event: ResponsesStreamEvent) => {
    if (typeof event.text !== 'string') {
      return;
    }

    const key = getOutputTextKey(event);
    if (key) {
      if (!hasStreamOutputCapacity(outputTextByContent.has(key))) {
        currentOutputTextKey = undefined;
        currentInvalidOutputTextKey = undefined;
        pendingUnindexedOutputText = '';
        return;
      }
      if (pendingUnindexedOutputText) {
        if (event.output_index !== 0 || (event.content_index ?? 0) !== 0) {
          unassignedUnindexedOutputText += pendingUnindexedOutputText;
        }
        pendingUnindexedOutputText = '';
      }
      const previous = outputTextByContent.get(key) ?? '';
      appendOutputText(
        event.text.startsWith(previous) ? event.text.slice(previous.length) : event.text,
      );
      outputTextByContent.set(key, event.text);
      finalizedOutputTextKeys.add(key);
      currentOutputTextKey = undefined;
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (event.output_index !== undefined || event.content_index !== undefined) {
      pendingUnindexedOutputText = '';
      const invalidKey = getInvalidOutputTextKey(event);
      if (!hasStreamOutputCapacity(invalidlyIndexedOutputTextByContent.has(invalidKey))) {
        currentOutputTextKey = undefined;
        currentInvalidOutputTextKey = undefined;
        return;
      }
      const previous = invalidlyIndexedOutputTextByContent.get(invalidKey) ?? '';
      appendOutputText(
        event.text.startsWith(previous) ? event.text.slice(previous.length) : event.text,
      );
      invalidlyIndexedOutputTextByContent.set(invalidKey, event.text);
      finalizedInvalidOutputTextKeys.add(invalidKey);
      currentOutputTextKey = undefined;
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (currentInvalidOutputTextKey) {
      const previous = invalidlyIndexedOutputTextByContent.get(currentInvalidOutputTextKey) ?? '';
      appendOutputText(
        event.text.startsWith(previous) ? event.text.slice(previous.length) : event.text,
      );
      invalidlyIndexedOutputTextByContent.set(currentInvalidOutputTextKey, event.text);
      finalizedInvalidOutputTextKeys.add(currentInvalidOutputTextKey);
      currentInvalidOutputTextKey = undefined;
      return;
    }
    if (currentOutputTextKey) {
      const previous = outputTextByContent.get(currentOutputTextKey) ?? '';
      appendOutputText(
        event.text.startsWith(previous) ? event.text.slice(previous.length) : event.text,
      );
      outputTextByContent.set(currentOutputTextKey, event.text);
      finalizedOutputTextKeys.add(currentOutputTextKey);
      currentOutputTextKey = undefined;
      return;
    }

    if (!hasStreamOutputCapacity(false)) {
      pendingUnindexedOutputText = '';
      return;
    }

    appendOutputText(
      event.text.startsWith(pendingUnindexedOutputText)
        ? event.text.slice(pendingUnindexedOutputText.length)
        : event.text,
    );
    completedUnindexedOutputTexts.push(event.text);
    pendingUnindexedOutputText = '';
  };

  const processChunk = (chunk: string) => {
    const event = parseSseEvent(chunk, providerName, logger);
    if (!event) {
      return;
    }

    if (event.type === 'error') {
      const code = event.error?.code ?? event.code;
      const message = event.error?.message ?? event.message ?? 'unknown stream error';
      throw new Error(
        `${providerName} streaming response error${code ? ` (${code})` : ''}: ${message}`,
      );
    }

    if (event.response && typeof event.response === 'object') {
      latestResponse = boundedResponse(event.response);
    } else if (Array.isArray(event.output)) {
      latestResponse = boundedResponse(event);
    }

    let finalizedRefusalItem = getOutputRefusalItem(event);
    if (finalizedRefusalItem) {
      sawFinalizedRefusal = true;
      const outputIndex = getValidOutputIndex(event);
      if (event.type === 'response.output_item.done' && outputIndex !== undefined) {
        for (const [previousKey, previousItem] of finalizedRefusalItems) {
          if (previousItem.outputIndex === outputIndex) {
            finalizedOutputChars -= previousItem.serializedLength;
            finalizedRefusalItems.delete(previousKey);
          }
        }
      }
      const key = getOutputTextKey(event) ?? getInvalidOutputTextKey(event);
      if (event.type === 'response.refusal.delta') {
        const previousRefusal = finalizedRefusalItems
          .get(key)
          ?.item?.content?.find((part: any) => part?.type === 'refusal')?.refusal;
        if (typeof previousRefusal === 'string') {
          finalizedRefusalItem = {
            ...finalizedRefusalItem,
            content: [
              {
                type: 'refusal',
                refusal: `${previousRefusal}${finalizedRefusalItem.content[0].refusal}`,
              },
            ],
          };
        }
      }
      setFinalizedOutputItem(finalizedRefusalItems, key, outputIndex, finalizedRefusalItem);
    }
    if (
      event.type === 'response.output_item.done' &&
      event.item?.type !== 'message' &&
      event.item?.type !== 'refusal' &&
      event.item
    ) {
      const outputIndex = getValidOutputIndex(event);
      const item = event.item as any;
      const key = `${String(event.output_index ?? 'missing')}:${String(item.type ?? 'unknown')}:${String(item.id ?? item.call_id ?? '')}`;
      setFinalizedOutputItem(finalizedNonMessageItems, key, outputIndex, item);
    }
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
      const metadata = {
        type: 'function_call',
        id: event.item.id,
        call_id: event.item.call_id,
        name: event.item.name,
      };
      const key = `${String(event.output_index ?? 'missing')}:function_call:${event.item.id ?? event.item.call_id ?? ''}`;
      if (
        JSON.stringify(metadata).length <= MAX_STREAM_FUNCTION_METADATA_CHARS &&
        (addedFunctionItems.has(key) || addedFunctionItems.size < MAX_STREAM_OUTPUT_KEYS)
      ) {
        addedFunctionItems.set(key, metadata);
      }
    }
    if (
      event.type === 'response.function_call_arguments.done' &&
      typeof event.arguments === 'string'
    ) {
      const outputIndex = getValidOutputIndex(event);
      const key = `${String(event.output_index ?? 'missing')}:function_call:${event.item_id ?? ''}`;
      const item = {
        ...addedFunctionItems.get(key),
        type: 'function_call',
        ...(event.item_id ? { id: event.item_id } : {}),
        ...(event.name ? { name: event.name } : {}),
        arguments: event.arguments,
      };
      setFinalizedOutputItem(finalizedNonMessageItems, key, outputIndex, item);
    }

    if (event.type === 'response.output_text.delta') {
      processOutputTextEvent(event);
    } else {
      for (const outputTextDoneEvent of getOutputTextDoneEvents(event)) {
        processOutputTextDoneEvent(outputTextDoneEvent);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() || '';
      if (buffer.length > MAX_STREAM_OUTPUT_CHARS) {
        throw new Error(
          `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output (buffered event data)`,
        );
      }
      for (const chunk of chunks) {
        if (chunk.length > MAX_STREAM_OUTPUT_CHARS) {
          throw new Error(
            `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output (event data)`,
          );
        }
        processChunk(chunk);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processChunk(buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const useFinalizedItems = latestResponse?.status !== 'completed';
  const finalizedStreamOutput = mergeFinalizedStreamOutput(
    latestResponse?.output,
    Array.from(finalizedNonMessageItems.values()),
    useFinalizedItems ? Array.from(finalizedRefusalItems.values()) : [],
    useFinalizedItems,
  );

  if (latestResponse && hasTerminalSafetyDecision(latestResponse)) {
    const safeOutput = filterExecutableToolCalls(finalizedStreamOutput);
    const hasMeaningfulSafeOutput = safeOutput.some(
      (item: any) =>
        item?.type !== 'message' ||
        (Array.isArray(item.content) && item.content.length > 0) ||
        (typeof item.refusal === 'string' && item.refusal.length > 0),
    );
    if (!hasRefusalOutput(safeOutput) && !hasMeaningfulSafeOutput) {
      const reason = [
        latestResponse.incomplete_details?.reason,
        latestResponse.error?.code,
        latestResponse.error?.message,
      ].find((value) => typeof value === 'string' && value.length > 0);
      safeOutput.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'refusal', refusal: `Response blocked${reason ? `: ${reason}` : '.'}` }],
      });
    }
    return boundedResponse({
      ...latestResponse,
      output: safeOutput,
    });
  }

  if (sawFinalizedRefusal) {
    const terminalHadExecutableCalls = hasExecutableToolCalls(latestResponse?.output);
    const safeOutput = filterExecutableToolCalls(
      useFinalizedItems ? finalizedStreamOutput : latestResponse?.output,
    );
    return boundedResponse({
      ...(latestResponse ?? {}),
      output:
        useFinalizedItems || !terminalHadExecutableCalls
          ? safeOutput
          : [
              ...safeOutput,
              ...filterExecutableToolCalls(
                Array.from(finalizedRefusalItems.values(), ({ item }) => item),
              ),
            ],
    });
  }

  if (
    latestResponse &&
    (outputText ||
      finalizedOutputTextKeys.size > 0 ||
      completedUnindexedOutputTexts.length > 0 ||
      finalizedInvalidOutputTextKeys.size > 0 ||
      finalizedNonMessageItems.size > 0)
  ) {
    if (
      unassignedUnindexedOutputText &&
      (!Array.isArray(latestResponse.output) || latestResponse.output.length === 0) &&
      invalidlyIndexedOutputTextByContent.size === 0 &&
      finalizedOutputTextKeys.size === 0 &&
      finalizedNonMessageItems.size === 0
    ) {
      return boundedResponse({
        ...latestResponse,
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: outputText }],
          },
        ],
      });
    }

    const remainingUnindexedOutputText = unassignedUnindexedOutputText + pendingUnindexedOutputText;
    const finalizedInvalidOutputTexts = Array.from(
      invalidlyIndexedOutputTextByContent,
      ([key, text]) => (finalizedInvalidOutputTextKeys.has(key) ? text : undefined),
    ).filter((text): text is string => text !== undefined);
    const recoveredOutput = recoverIncompleteOutput(
      finalizedStreamOutput,
      outputTextByContent,
      [
        ...completedUnindexedOutputTexts,
        ...finalizedInvalidOutputTexts,
        ...(remainingUnindexedOutputText ? [remainingUnindexedOutputText] : []),
      ],
      latestResponse.status === 'incomplete' || latestResponse.status === 'in_progress',
      finalizedOutputTextKeys,
      completedUnindexedOutputTexts.length + finalizedInvalidOutputTexts.length,
    );
    const output = (recoveredOutput ?? finalizedStreamOutput).filter((item) => item !== undefined);
    let appendedInvalidOutput = false;
    const terminalTextCounts = new Map<string, number>();
    for (const text of getTerminalOutputTexts(output)) {
      terminalTextCounts.set(text, (terminalTextCounts.get(text) ?? 0) + 1);
    }
    for (const [key, text] of invalidlyIndexedOutputTextByContent) {
      if (finalizedInvalidOutputTextKeys.has(key)) {
        continue;
      }
      const remainingMatches = terminalTextCounts.get(text) ?? 0;
      if (remainingMatches > 0) {
        terminalTextCounts.set(text, remainingMatches - 1);
        continue;
      }
      output.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      });
      appendedInvalidOutput = true;
    }
    if (recoveredOutput || appendedInvalidOutput || finalizedNonMessageItems.size > 0) {
      return boundedResponse({ ...latestResponse, output });
    }
  }

  const hasOutputText =
    Array.isArray(latestResponse?.output) &&
    latestResponse.output.some(
      (item: any) =>
        item?.type === 'message' &&
        Array.isArray(item.content) &&
        item.content.some(
          (content: any) =>
            content?.type === 'output_text' &&
            typeof content.text === 'string' &&
            (content.text.length > 0 || latestResponse.status === 'completed'),
        ),
    );

  if (latestResponse && outputText && !hasOutputText) {
    return boundedResponse({
      ...latestResponse,
      output: [
        ...(Array.isArray(latestResponse.output) ? latestResponse.output : []),
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: outputText }],
        },
      ],
    });
  }

  if (latestResponse) {
    return boundedResponse(
      finalizedNonMessageItems.size > 0
        ? {
            ...latestResponse,
            output: finalizedStreamOutput.filter((item) => item !== undefined),
          }
        : latestResponse,
    );
  }

  if (outputText) {
    const remainingUnindexedOutputText = unassignedUnindexedOutputText + pendingUnindexedOutputText;
    const recoveredOutput = recoverIncompleteOutput(
      finalizedStreamOutput,
      outputTextByContent,
      [
        ...completedUnindexedOutputTexts,
        ...(remainingUnindexedOutputText ? [remainingUnindexedOutputText] : []),
      ],
      true,
      finalizedOutputTextKeys,
    );
    const output = (recoveredOutput ?? finalizedStreamOutput).filter((item) => item !== undefined);
    for (const text of invalidlyIndexedOutputTextByContent.values()) {
      output.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      });
    }
    if (output.length > 0) {
      return boundedResponse({ output });
    }

    return boundedResponse({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: outputText }],
        },
      ],
    });
  }

  if (finalizedStreamOutput.length > 0) {
    return boundedResponse({
      output: finalizedStreamOutput.filter((item) => item !== undefined),
    });
  }

  throw new Error(`${providerName} streaming response did not include output content`);
}
