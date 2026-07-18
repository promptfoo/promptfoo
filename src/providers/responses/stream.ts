type ResponsesStreamEvent = {
  type?: string;
  response?: any;
  delta?: string;
  text?: string;
  refusal?: string;
  annotation_index?: number;
  annotation?: any;
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
const MAX_STREAM_INDEX_KEY_CHARS = 128;
const MAX_STREAM_FRAGMENT_BATCH = 1024;
const MAX_STREAM_EVENT_COUNT = 1024 * 1024;
const STREAM_READ_YIELD_INTERVAL = 1024;

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

function compactStreamIndex(value: unknown, fallback: string): string {
  const text =
    value === undefined
      ? `undefined:${fallback}`
      : value === null
        ? `null:${fallback}`
        : typeof value === 'object'
          ? `object:${JSON.stringify(value)}`
          : `${typeof value}:${String(value)}`;
  if (text.length <= MAX_STREAM_INDEX_KEY_CHARS) {
    return text;
  }

  let firstHash = 2166136261;
  let secondHash = 2654435761;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ code, 16777619);
    secondHash = Math.imul(secondHash ^ code, 2246822519);
  }
  return `oversized-${text.length}-${(firstHash >>> 0).toString(16)}-${(secondHash >>> 0).toString(16)}`;
}

function getInvalidOutputTextKey(event: ResponsesStreamEvent): string {
  return JSON.stringify([
    compactStreamIndex(event.output_index, 'missing'),
    compactStreamIndex(event.content_index, '0'),
  ]);
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
  const errorCodes = [response?.error?.code, response?.error?.type];
  const safetyReason =
    /^(?:content[_-]?filter|content[_-]?policy|safety|guardrail)(?:[_-](?:violation|blocked|checks?[_-]?failed))?$/i;
  if (
    typeof response?.incomplete_details?.reason === 'string' &&
    safetyReason.test(response.incomplete_details.reason)
  ) {
    return true;
  }
  if (
    errorCodes.some(
      (errorCode) =>
        errorCode !== 'content_filter_error' &&
        typeof errorCode === 'string' &&
        safetyReason.test(errorCode),
    )
  ) {
    return true;
  }
  if (
    !errorCodes.includes('content_filter_error') &&
    typeof response?.error?.message === 'string' &&
    /\b(?:blocked|refused|rejected|filtered|disallowed)\b/i.test(response.error.message) &&
    /(?:content[_ -]?(?:filter|policy)|safety|guardrail)/i.test(response.error.message)
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

function filterExecutableToolCalls(output: any[] | undefined, stripText = false): any[] {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .filter(
      (item: any) =>
        item !== undefined &&
        item?.type !== 'function_call' &&
        (!stripText || item?.type === 'message' || item?.type === 'refusal'),
    )
    .map((item: any) =>
      item?.type === 'refusal'
        ? {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'refusal', refusal: item.refusal }],
          }
        : item?.type === 'message' && typeof item.refusal === 'string' && item.refusal.length > 0
          ? {
              type: 'message',
              role: typeof item.role === 'string' ? item.role : 'assistant',
              ...(typeof item.id === 'string' ? { id: item.id } : {}),
              ...(typeof item.status === 'string' ? { status: item.status } : {}),
              ...(typeof item.phase === 'string' ? { phase: item.phase } : {}),
              refusal: item.refusal,
              content: [{ type: 'refusal', refusal: item.refusal }],
            }
          : item?.type === 'message' && Array.isArray(item.content)
            ? {
                type: 'message',
                role: typeof item.role === 'string' ? item.role : 'assistant',
                ...(typeof item.id === 'string' ? { id: item.id } : {}),
                ...(typeof item.status === 'string' ? { status: item.status } : {}),
                ...(typeof item.phase === 'string' ? { phase: item.phase } : {}),
                content: item.content
                  .filter(
                    (content: any) =>
                      content?.type !== 'tool_use' &&
                      content?.type !== 'function_call' &&
                      (!stripText || content?.type === 'refusal'),
                  )
                  .map((content: any) =>
                    content?.type === 'refusal'
                      ? {
                          type: 'refusal',
                          refusal: typeof content.refusal === 'string' ? content.refusal : '',
                        }
                      : content,
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

function filterUnfinalizedTerminalToolCalls(
  output: any[],
  finalizedItems: FinalizedStreamOutputItem[],
): any[] {
  const finalizedToolCalls = finalizedItems.filter(
    ({ item }) =>
      item?.type === 'function_call' &&
      typeof item.name === 'string' &&
      item.name.length > 0 &&
      typeof item.arguments === 'string' &&
      typeof item.call_id === 'string' &&
      item.call_id.length > 0,
  );
  return output
    .filter((item, outputIndex) => {
      if (item?.type !== 'function_call') {
        return true;
      }
      return finalizedToolCalls.some(({ item: finalizedItem, outputIndex: finalizedIndex }) => {
        const identities = [item.id, item.call_id].filter(
          (identity): identity is string => typeof identity === 'string',
        );
        return (
          (finalizedIndex !== undefined && finalizedIndex === outputIndex) ||
          identities.some(
            (identity) => finalizedItem.id === identity || finalizedItem.call_id === identity,
          )
        );
      });
    })
    .map((item) =>
      item?.type === 'message' && Array.isArray(item.content)
        ? {
            ...item,
            content: item.content.filter(
              (content: any) => content?.type !== 'tool_use' && content?.type !== 'function_call',
            ),
          }
        : item,
    );
}

function getSafeUsage(usage: any): Record<string, any> | undefined {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return undefined;
  }

  const numericFields = [
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'prompt_tokens',
    'completion_tokens',
    'cached_tokens',
  ];
  const detailFields = [
    'input_tokens_details',
    'output_tokens_details',
    'prompt_tokens_details',
    'completion_tokens_details',
  ];
  const detailNumericFields = [
    'cached_tokens',
    'cache_write_tokens',
    'reasoning_tokens',
    'accepted_prediction_tokens',
    'rejected_prediction_tokens',
    'audio_tokens',
    'text_tokens',
  ];
  const safeUsage: Record<string, any> = {};
  for (const field of numericFields) {
    if (typeof usage[field] === 'number' && Number.isFinite(usage[field])) {
      safeUsage[field] = usage[field];
    }
  }
  for (const field of detailFields) {
    const details = usage[field];
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      continue;
    }
    const safeDetails: Record<string, number> = {};
    for (const detailField of detailNumericFields) {
      if (typeof details[detailField] === 'number' && Number.isFinite(details[detailField])) {
        safeDetails[detailField] = details[detailField];
      }
    }
    safeUsage[field] = safeDetails;
  }
  return safeUsage;
}

function getSafeRefusalResponse(response: any, output: any[], stripError = false): any {
  const usage = getSafeUsage(response?.usage);
  const error = response?.error;
  const safeError =
    !stripError && error && typeof error === 'object' && !Array.isArray(error)
      ? {
          ...(typeof error.code === 'string' ? { code: error.code } : {}),
          ...(typeof error.message === 'string' ? { message: error.message } : {}),
          ...(typeof error.type === 'string' ? { type: error.type } : {}),
          ...(typeof error.param === 'string' ? { param: error.param } : {}),
        }
      : undefined;
  const incompleteReason = response?.incomplete_details?.reason;
  return {
    ...(typeof response?.id === 'string' ? { id: response.id } : {}),
    ...(typeof response?.object === 'string' ? { object: response.object } : {}),
    ...(typeof response?.created_at === 'number' ? { created_at: response.created_at } : {}),
    ...(typeof response?.status === 'string' ? { status: response.status } : {}),
    ...(typeof response?.model === 'string' ? { model: response.model } : {}),
    ...(usage ? { usage } : {}),
    ...(typeof response?.service_tier === 'string' ? { service_tier: response.service_tier } : {}),
    ...(typeof incompleteReason === 'string'
      ? { incomplete_details: { reason: incompleteReason } }
      : {}),
    ...(safeError ? { error: safeError } : {}),
    output,
  };
}

function isTerminalStreamResponse(eventType: string | undefined, status: unknown): boolean {
  return (
    eventType === 'response.completed' ||
    eventType === 'response.failed' ||
    eventType === 'response.incomplete' ||
    eventType === 'response.cancelled' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'incomplete' ||
    status === 'cancelled'
  );
}

function mergeFinalizedStreamOutput(
  output: any[] | undefined,
  finalizedNonMessageItems: FinalizedStreamOutputItem[],
  finalizedRefusalItems: FinalizedStreamOutputItem[],
  preferFinalizedNonMessageItems: boolean,
): any[] {
  const entries: FinalizedStreamOutputItem[] = (Array.isArray(output) ? output : [])
    .map((item, outputIndex) => ({ item, outputIndex }))
    .filter(({ item }) => item !== undefined);

  for (const finalizedItem of finalizedNonMessageItems) {
    const identities = [finalizedItem.item?.id, finalizedItem.item?.call_id].filter(
      (identity): identity is string => typeof identity === 'string',
    );
    const existingIndex = entries.findIndex(({ item, outputIndex }) => {
      if (
        finalizedItem.outputIndex !== undefined &&
        outputIndex === finalizedItem.outputIndex &&
        item?.type === finalizedItem.item?.type
      ) {
        return true;
      }
      return (
        item?.type === finalizedItem.item?.type &&
        identities.some((identity) => item?.id === identity || item?.call_id === identity)
      );
    });
    if (existingIndex < 0 && preferFinalizedNonMessageItems) {
      entries.push(finalizedItem);
    } else if (preferFinalizedNonMessageItems) {
      entries[existingIndex] = {
        ...entries[existingIndex],
        outputIndex: finalizedItem.outputIndex ?? entries[existingIndex].outputIndex,
        item:
          finalizedItem.item?.type === 'function_call'
            ? finalizedItem.item
            : { ...entries[existingIndex].item, ...finalizedItem.item },
      };
    }
  }

  const mergedRefusalItems = new Set<FinalizedStreamOutputItem>();
  for (const entry of entries) {
    if (entry.item?.type !== 'message') {
      continue;
    }
    const matchingRefusals = finalizedRefusalItems.filter(
      (refusalItem) =>
        refusalItem.outputIndex !== undefined && refusalItem.outputIndex === entry.outputIndex,
    );
    if (matchingRefusals.length === 0) {
      continue;
    }
    const refusalContent = matchingRefusals.flatMap(({ item }) => [
      ...(Array.isArray(item.content)
        ? item.content.filter((content: any) => content?.type === 'refusal')
        : []),
      ...(typeof item.refusal === 'string' && item.refusal.length > 0
        ? [{ type: 'refusal', refusal: item.refusal }]
        : []),
    ]);
    entry.item = {
      ...entry.item,
      refusal: undefined,
      content: [
        ...(Array.isArray(entry.item.content)
          ? entry.item.content.filter((content: any) => content?.type !== 'refusal')
          : []),
        ...refusalContent,
      ],
    };
    matchingRefusals.forEach((refusalItem) => mergedRefusalItems.add(refusalItem));
  }

  entries.push(...finalizedRefusalItems.filter((item) => !mergedRefusalItems.has(item)));
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

function mergeCompletedOutputAnnotations(
  output: any[],
  finalizedItems: FinalizedStreamOutputItem[],
): any[] {
  return output.map((item, outputIndex) => {
    if (item?.type !== 'message' || !Array.isArray(item.content)) {
      return item;
    }

    const finalizedItem = finalizedItems.find(
      ({ item: candidate, outputIndex: candidateIndex }) => {
        if (candidate?.type !== 'message') {
          return false;
        }
        if (typeof item.id === 'string' && typeof candidate.id === 'string') {
          return item.id === candidate.id;
        }
        return candidateIndex === outputIndex;
      },
    )?.item;
    if (!Array.isArray(finalizedItem?.content)) {
      return item;
    }

    return {
      ...item,
      content: item.content.map((content: any, contentIndex: number) => {
        const annotations = finalizedItem.content[contentIndex]?.annotations;
        if (content?.type !== 'output_text' || !Array.isArray(annotations)) {
          return content;
        }
        const existingAnnotations = Array.isArray(content.annotations) ? content.annotations : [];
        const seen = new Set(
          existingAnnotations.map((annotation: any) => JSON.stringify(annotation)),
        );
        return {
          ...content,
          annotations: [
            ...existingAnnotations,
            ...annotations.filter((annotation: any) => !seen.has(JSON.stringify(annotation))),
          ],
        };
      }),
    };
  });
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
  const attachUnindexedToSoleIndexedOutput =
    terminalTextLocations.length <= 1 &&
    streamedTexts.length === 1 &&
    unindexedOutputTexts.length > 0 &&
    finalizedUnindexedOutputTextCount === 0;
  if (attachUnindexedToSoleIndexedOutput) {
    streamedTexts[0].text += unindexedOutputTexts.join('');
  }
  const remainingUnindexedOutputTexts = attachUnindexedToSoleIndexedOutput
    ? []
    : unindexedOutputTexts;
  if (remainingUnindexedOutputTexts.length === unindexedTextLocations.length) {
    remainingUnindexedOutputTexts.forEach((text, index) => {
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
      if (allowTerminalTextReplacement) {
        unmatchedStreamedTexts.push(text);
      }
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
      if (allowTerminalTextReplacement) {
        unmatchedStreamedTexts.push(text);
      }
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

  if (remainingUnindexedOutputTexts.length !== unindexedTextLocations.length) {
    const terminalTexts = getTerminalOutputTexts(recoveredOutput);
    const terminalTextCounts = new Map<string, number>();
    for (const text of terminalTexts) {
      terminalTextCounts.set(text, (terminalTextCounts.get(text) ?? 0) + 1);
    }
    let joinedTerminalText = terminalTexts.join('');
    for (const text of remainingUnindexedOutputTexts) {
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
  signal?: AbortSignal,
  onResponse?: (response: any) => void,
): Promise<any> {
  if (!response.body) {
    throw new Error(`${providerName} streaming response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bufferedEventLength = 0;
  let bufferedEventFragments: string[] = [];
  let bufferedEventBatches: string[] = [];
  let separatorState = 0;
  let readsSinceYield = 0;
  let latestResponse: any;
  let latestResponseEventType: string | undefined;
  let outputText = '';
  const outputTextByContent = new Map<string, string>();
  const outputTextItemIds = new Map<string, string>();
  let currentOutputTextKey: string | undefined;
  let pendingUnindexedOutputText = '';
  let unassignedUnindexedOutputText = '';
  const completedUnindexedOutputTexts: string[] = [];
  let finalizedUnindexedOutputText = false;
  const finalizedOutputTextKeys = new Set<string>();
  const invalidlyIndexedOutputTextByContent = new Map<string, string>();
  const finalizedInvalidOutputTextKeys = new Set<string>();
  let currentInvalidOutputTextKey: string | undefined;
  const finalizedNonMessageItems = new Map<string, RetainedStreamOutputItem>();
  const finalizedRefusalItems = new Map<string, RetainedStreamOutputItem>();
  const refusalDeltaChunks = new Map<string, string[]>();
  const addedFunctionItems = new Map<string, Record<string, string | undefined>>();
  let sawFinalizedRefusal = false;
  let finalizedOutputChars = 0;
  let streamEventCount = 0;

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
    knownSerializedLength?: number,
  ): void => {
    if (!hasStreamOutputCapacity(target.has(key), target !== finalizedRefusalItems)) {
      return;
    }

    const serializedLength = knownSerializedLength ?? JSON.stringify(item).length;
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
    if (
      key &&
      typeof event.item_id === 'string' &&
      event.item_id.length <= MAX_STREAM_FUNCTION_METADATA_CHARS &&
      (outputTextItemIds.has(key) || outputTextItemIds.size < MAX_STREAM_OUTPUT_KEYS)
    ) {
      outputTextItemIds.set(key, event.item_id);
    }
    const invalidKey =
      !key && (event.output_index !== undefined || event.content_index !== undefined)
        ? getInvalidOutputTextKey(event)
        : undefined;
    if (
      (key && finalizedOutputTextKeys.has(key)) ||
      (invalidKey && finalizedInvalidOutputTextKeys.has(invalidKey)) ||
      (!key && !invalidKey && finalizedUnindexedOutputText)
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
    pendingUnindexedOutputText += delta;
  };

  const processOutputTextDoneEvent = (event: ResponsesStreamEvent) => {
    if (typeof event.text !== 'string') {
      return;
    }

    const key = getOutputTextKey(event);
    const itemId = event.item_id ?? event.item?.id;
    if (
      key &&
      typeof itemId === 'string' &&
      itemId.length <= MAX_STREAM_FUNCTION_METADATA_CHARS &&
      (outputTextItemIds.has(key) || outputTextItemIds.size < MAX_STREAM_OUTPUT_KEYS)
    ) {
      outputTextItemIds.set(key, itemId);
    }
    const invalidKey =
      !key && (event.output_index !== undefined || event.content_index !== undefined)
        ? getInvalidOutputTextKey(event)
        : undefined;
    if (
      (key && finalizedOutputTextKeys.has(key)) ||
      (invalidKey && finalizedInvalidOutputTextKeys.has(invalidKey)) ||
      (!key && !invalidKey && finalizedUnindexedOutputText)
    ) {
      return;
    }
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
    finalizedUnindexedOutputText = true;
  };

  const processChunk = (chunk: string) => {
    if (++streamEventCount > MAX_STREAM_EVENT_COUNT) {
      throw new Error(
        `${providerName} streaming response exceeded ${MAX_STREAM_EVENT_COUNT} events`,
      );
    }
    const event = parseSseEvent(chunk, providerName, logger);
    if (!event) {
      return;
    }

    if (isTerminalStreamResponse(latestResponseEventType, latestResponse?.status)) {
      return;
    }

    if (event.type === 'error') {
      const code = event.error?.code ?? event.code;
      const message = event.error?.message ?? event.message ?? 'unknown stream error';
      throw new Error(
        `${providerName} streaming response error${code ? ` (${code})` : ''}: ${message}`,
      );
    }

    if (
      event.type === 'response.output_item.added' ||
      (event.type === 'response.content_part.added' && event.part?.type === 'output_text')
    ) {
      finalizedUnindexedOutputText = false;
    }

    if (event.response && typeof event.response === 'object') {
      latestResponse = boundedResponse(event.response);
      latestResponseEventType = event.type;
      onResponse?.(latestResponse);
    } else if (Array.isArray(event.output)) {
      latestResponse = boundedResponse(event);
      latestResponseEventType = event.type;
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
            refusalDeltaChunks.delete(previousKey);
          }
        }
      }
      const key = getOutputTextKey(event) ?? getInvalidOutputTextKey(event);
      let knownSerializedLength: number | undefined;
      if (event.type === 'response.refusal.delta') {
        const previousItem = finalizedRefusalItems.get(key);
        const delta = event.delta ?? '';
        if (delta.length > 0) {
          const chunks = refusalDeltaChunks.get(key);
          if (chunks) {
            chunks.push(delta);
          } else {
            refusalDeltaChunks.set(key, [delta]);
          }
        }
        if (previousItem) {
          finalizedRefusalItem = previousItem.item;
          knownSerializedLength = previousItem.serializedLength + JSON.stringify(delta).length - 2;
        }
      } else {
        refusalDeltaChunks.delete(key);
      }
      setFinalizedOutputItem(
        finalizedRefusalItems,
        key,
        outputIndex,
        finalizedRefusalItem,
        knownSerializedLength,
      );
      if (!finalizedRefusalItems.has(key)) {
        refusalDeltaChunks.delete(key);
      }
    }
    if (
      event.type === 'response.output_item.done' &&
      event.item?.type !== 'refusal' &&
      event.item &&
      (event.item.type !== 'message' ||
        (Array.isArray(event.item.content) &&
          event.item.content.some(
            (part) =>
              part?.type === 'output_text' &&
              Object.keys(part).some((key) => key !== 'type' && key !== 'text'),
          )))
    ) {
      const outputIndex = getValidOutputIndex(event);
      let item = event.item as any;
      if (item.type === 'function_call' && typeof item.call_id === 'string' && !item.id) {
        const indexPrefix = `${compactStreamIndex(event.output_index, 'missing')}:function_call:`;
        for (const [previousKey, previousItem] of finalizedNonMessageItems) {
          if (
            !previousKey.startsWith(indexPrefix) ||
            previousItem.outputIndex !== outputIndex ||
            previousItem.item?.type !== 'function_call' ||
            typeof previousItem.item.id !== 'string' ||
            previousItem.item.call_id ||
            (previousItem.item.name && item.name && previousItem.item.name !== item.name)
          ) {
            continue;
          }

          item = {
            ...previousItem.item,
            ...item,
            arguments:
              typeof item.arguments === 'string' && item.arguments.length > 0
                ? item.arguments
                : previousItem.item.arguments,
          };
          finalizedOutputChars -= previousItem.serializedLength;
          finalizedNonMessageItems.delete(previousKey);
          break;
        }
      }
      const key = `${compactStreamIndex(event.output_index, 'missing')}:${String(item.type ?? 'unknown')}:${String(item.id ?? item.call_id ?? '')}`;
      setFinalizedOutputItem(finalizedNonMessageItems, key, outputIndex, item);
    }
    if (
      event.type === 'response.output_text.annotation.added' &&
      event.annotation &&
      typeof event.annotation === 'object'
    ) {
      const outputIndex = getValidOutputIndex(event);
      const key = `${compactStreamIndex(event.output_index, 'missing')}:message:${event.item_id ?? ''}`;
      const existingItem = finalizedNonMessageItems.get(key)?.item;
      const content = Array.isArray(existingItem?.content) ? [...existingItem.content] : [];
      const contentIndex =
        typeof event.content_index === 'number' &&
        Number.isInteger(event.content_index) &&
        event.content_index >= 0 &&
        event.content_index <= MAX_STREAM_CONTENT_INDEX
          ? event.content_index
          : content.length;
      while (content.length <= contentIndex) {
        content.push({ type: 'output_text', text: '' });
      }
      const existingContent = content[contentIndex];
      const annotations = Array.isArray(existingContent?.annotations)
        ? [...existingContent.annotations]
        : [];
      const annotationIndex =
        typeof event.annotation_index === 'number' &&
        Number.isInteger(event.annotation_index) &&
        event.annotation_index >= 0 &&
        event.annotation_index <= annotations.length
          ? event.annotation_index
          : annotations.length;
      annotations[annotationIndex] = event.annotation;
      content[contentIndex] = {
        ...existingContent,
        type: 'output_text',
        annotations,
      };
      setFinalizedOutputItem(finalizedNonMessageItems, key, outputIndex, {
        ...existingItem,
        type: 'message',
        role: 'assistant',
        ...(event.item_id ? { id: event.item_id } : {}),
        content,
      });
    }
    if (
      event.type === 'response.content_part.done' &&
      event.part?.type === 'output_text' &&
      Object.keys(event.part).some((key) => key !== 'type' && key !== 'text')
    ) {
      const outputIndex = getValidOutputIndex(event);
      const key = `${compactStreamIndex(event.output_index, 'missing')}:message:${event.item_id ?? ''}`;
      const existingItem = finalizedNonMessageItems.get(key)?.item;
      const content = Array.isArray(existingItem?.content) ? [...existingItem.content] : [];
      const contentIndex =
        typeof event.content_index === 'number' &&
        Number.isInteger(event.content_index) &&
        event.content_index >= 0 &&
        event.content_index <= MAX_STREAM_CONTENT_INDEX
          ? event.content_index
          : content.length;
      while (content.length <= contentIndex) {
        content.push({ type: 'output_text', text: '' });
      }
      content[contentIndex] = event.part;
      const item = {
        ...existingItem,
        type: 'message',
        role: 'assistant',
        ...(event.item_id ? { id: event.item_id } : {}),
        content,
      };
      setFinalizedOutputItem(finalizedNonMessageItems, key, outputIndex, item);
    }
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
      const metadata = {
        type: 'function_call',
        id: event.item.id,
        call_id: event.item.call_id,
        name: event.item.name,
      };
      const key = `${compactStreamIndex(event.output_index, 'missing')}:function_call:${event.item.id ?? event.item.call_id ?? ''}`;
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
      const key = `${compactStreamIndex(event.output_index, 'missing')}:function_call:${event.item_id ?? ''}`;
      const item = {
        ...addedFunctionItems.get(key),
        type: 'function_call',
        ...(event.item_id ? { id: event.item_id } : {}),
        ...(event.name ? { name: event.name } : {}),
        arguments: event.arguments,
        status: 'completed',
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

  const appendEventFragment = (fragment: string, complete: boolean): void => {
    if (!fragment) {
      return;
    }
    bufferedEventLength += fragment.length;
    if (bufferedEventLength > MAX_STREAM_OUTPUT_CHARS + (complete ? 4 : 0)) {
      throw new Error(
        `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output (${complete ? 'event data' : 'buffered event data'})`,
      );
    }
    bufferedEventFragments.push(fragment);
    if (bufferedEventFragments.length >= MAX_STREAM_FRAGMENT_BATCH) {
      bufferedEventBatches.push(bufferedEventFragments.join(''));
      bufferedEventFragments = [];
    }
  };

  const takeBufferedEvent = (): string => {
    if (bufferedEventFragments.length > 0) {
      bufferedEventBatches.push(bufferedEventFragments.join(''));
    }
    const event = bufferedEventBatches.join('');
    bufferedEventLength = 0;
    bufferedEventFragments = [];
    bufferedEventBatches = [];
    return event;
  };

  const processDecodedText = (decoded: string): void => {
    let segmentStart = 0;
    for (let index = 0; index < decoded.length; index++) {
      const char = decoded[index];
      let complete = false;
      if (char === '\n') {
        complete = separatorState === 1 || separatorState === 3;
        separatorState = complete ? 0 : 1;
      } else if (char === '\r') {
        separatorState = separatorState === 1 ? 3 : 2;
      } else {
        separatorState = 0;
      }
      if (!complete) {
        continue;
      }

      appendEventFragment(decoded.slice(segmentStart, index + 1), true);
      const chunk = takeBufferedEvent().replace(/\r?\n\r?\n$/, '');
      if (chunk.length > MAX_STREAM_OUTPUT_CHARS) {
        throw new Error(
          `${providerName} streaming response exceeded ${MAX_STREAM_OUTPUT_CHARS} characters of output (event data)`,
        );
      }
      processChunk(chunk);
      segmentStart = index + 1;
    }
    appendEventFragment(decoded.slice(segmentStart), false);
  };

  const throwIfAborted = (): void => {
    if (signal?.aborted) {
      throw new DOMException(`${providerName} streaming response aborted`, 'AbortError');
    }
  };

  const readChunk = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (!signal) {
      return reader.read();
    }

    let abortListener: (() => void) | undefined;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          abortListener = () => {
            reject(new DOMException(`${providerName} streaming response aborted`, 'AbortError'));
          };
          signal.addEventListener('abort', abortListener, { once: true });
          if (signal.aborted) {
            abortListener();
          }
        }),
      ]);
    } finally {
      if (abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  };

  try {
    while (true) {
      throwIfAborted();
      const { done, value } = await readChunk();
      if (done) {
        break;
      }

      processDecodedText(decoder.decode(value, { stream: true }));
      if (++readsSinceYield >= STREAM_READ_YIELD_INTERVAL) {
        readsSinceYield = 0;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        throwIfAborted();
      }
    }

    processDecodedText(decoder.decode());
    if (bufferedEventLength > 0) {
      const chunk = takeBufferedEvent();
      if (chunk.trim()) {
        processChunk(chunk);
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  for (const [key, chunks] of refusalDeltaChunks) {
    const refusalPart = finalizedRefusalItems
      .get(key)
      ?.item?.content?.find((part: any) => part?.type === 'refusal');
    if (refusalPart) {
      refusalPart.refusal = chunks.join('');
    }
  }

  const isCompletedResponse =
    latestResponseEventType === 'response.completed' || latestResponse?.status === 'completed';
  const isPartialTerminalResponse =
    latestResponseEventType === 'response.failed' ||
    latestResponseEventType === 'response.incomplete' ||
    latestResponseEventType === 'response.cancelled' ||
    latestResponse?.status === 'failed' ||
    latestResponse?.status === 'incomplete' ||
    latestResponse?.status === 'cancelled';
  const isFailedOrCancelledResponse =
    latestResponseEventType === 'response.failed' ||
    latestResponseEventType === 'response.cancelled' ||
    latestResponse?.status === 'failed' ||
    latestResponse?.status === 'cancelled';
  const useFinalizedItems = !isCompletedResponse || sawFinalizedRefusal;
  const finalizedOutputTextByContent = new Map(
    Array.from(outputTextByContent).filter(([key]) => finalizedOutputTextKeys.has(key)),
  );
  const finalizedInvalidOutputTexts = Array.from(
    invalidlyIndexedOutputTextByContent,
    ([key, text]) => (finalizedInvalidOutputTextKeys.has(key) ? text : undefined),
  ).filter((text): text is string => text !== undefined);
  const refusalTerminalOutput = filterExecutableToolCalls(latestResponse?.output, true);
  const outputWithFinalizedText =
    useFinalizedItems && sawFinalizedRefusal && !hasTerminalSafetyDecision(latestResponse)
      ? (recoverIncompleteOutput(
          refusalTerminalOutput,
          finalizedOutputTextByContent,
          [...completedUnindexedOutputTexts, ...finalizedInvalidOutputTexts],
          true,
          finalizedOutputTextKeys,
          completedUnindexedOutputTexts.length + finalizedInvalidOutputTexts.length,
        ) ?? refusalTerminalOutput)
      : latestResponse?.output;
  const mergedStreamOutput = mergeFinalizedStreamOutput(
    outputWithFinalizedText,
    Array.from(finalizedNonMessageItems.values()),
    useFinalizedItems ? Array.from(finalizedRefusalItems.values()) : [],
    useFinalizedItems,
  );
  const outputWithCompletedAnnotations = isCompletedResponse
    ? mergeCompletedOutputAnnotations(
        mergedStreamOutput,
        Array.from(finalizedNonMessageItems.values()),
      )
    : mergedStreamOutput;
  const requiresFinalizedToolCalls = Boolean(latestResponse) && !isCompletedResponse;
  const finalizedStreamOutput = requiresFinalizedToolCalls
    ? filterUnfinalizedTerminalToolCalls(
        outputWithCompletedAnnotations,
        Array.from(finalizedNonMessageItems.values()),
      )
    : outputWithCompletedAnnotations;

  if (latestResponse && hasTerminalSafetyDecision(latestResponse)) {
    const safeOutput = filterExecutableToolCalls(finalizedStreamOutput, true);
    if (!hasRefusalOutput(safeOutput)) {
      safeOutput.push({
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'refusal',
            refusal: 'I cannot help with that request. Response blocked.',
          },
        ],
      });
    }
    return boundedResponse(getSafeRefusalResponse(latestResponse, safeOutput, true));
  }

  if (sawFinalizedRefusal) {
    const terminalHadExecutableCalls = hasExecutableToolCalls(latestResponse?.output);
    const safeOutput = filterExecutableToolCalls(
      useFinalizedItems ? finalizedStreamOutput : latestResponse?.output,
    );
    return boundedResponse(
      getSafeRefusalResponse(
        latestResponse,
        useFinalizedItems || !terminalHadExecutableCalls
          ? safeOutput
          : [
              ...safeOutput,
              ...filterExecutableToolCalls(
                Array.from(finalizedRefusalItems.values(), ({ item }) => item),
              ),
            ],
        true,
      ),
    );
  }

  if (
    latestResponse &&
    isCompletedResponse &&
    (!Array.isArray(latestResponse.output) || latestResponse.output.length === 0)
  ) {
    return boundedResponse(latestResponse);
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
      !isFailedOrCancelledResponse &&
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
    const alignedOutputTextByContent = new Map<string, string>();
    const alignedFinalizedOutputTextKeys = new Set<string>();
    for (const [key, text] of outputTextByContent) {
      const itemId = outputTextItemIds.get(key);
      const contentIndex = key.slice(key.indexOf(':') + 1);
      const terminalIndex =
        isCompletedResponse && itemId
          ? finalizedStreamOutput.findIndex((item: any) => item?.id === itemId)
          : -1;
      const alignedKey = terminalIndex >= 0 ? `${terminalIndex}:${contentIndex}` : key;
      alignedOutputTextByContent.set(alignedKey, text);
      if (finalizedOutputTextKeys.has(key)) {
        alignedFinalizedOutputTextKeys.add(alignedKey);
      }
    }
    const recoverableOutputTextByContent = isFailedOrCancelledResponse
      ? new Map(
          Array.from(alignedOutputTextByContent).filter(([key]) =>
            alignedFinalizedOutputTextKeys.has(key),
          ),
        )
      : alignedOutputTextByContent;
    const recoveredOutput = recoverIncompleteOutput(
      finalizedStreamOutput,
      recoverableOutputTextByContent,
      [
        ...completedUnindexedOutputTexts,
        ...finalizedInvalidOutputTexts,
        ...(remainingUnindexedOutputText && !isFailedOrCancelledResponse
          ? [remainingUnindexedOutputText]
          : []),
      ],
      latestResponse.status === 'incomplete' ||
        latestResponse.status === 'in_progress' ||
        isFailedOrCancelledResponse,
      alignedFinalizedOutputTextKeys,
      completedUnindexedOutputTexts.length + finalizedInvalidOutputTexts.length,
    );
    const output = (recoveredOutput ?? finalizedStreamOutput).filter((item) => item !== undefined);
    let appendedInvalidOutput = false;
    const terminalTextCounts = new Map<string, number>();
    for (const text of getTerminalOutputTexts(output)) {
      terminalTextCounts.set(text, (terminalTextCounts.get(text) ?? 0) + 1);
    }
    for (const [key, text] of invalidlyIndexedOutputTextByContent) {
      if (
        finalizedInvalidOutputTextKeys.has(key) ||
        isCompletedResponse ||
        isFailedOrCancelledResponse
      ) {
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
            (content.text.length > 0 || isCompletedResponse),
        ),
    );

  if (latestResponse && !isCompletedResponse && outputText && !hasOutputText) {
    return boundedResponse({
      ...latestResponse,
      output: [
        ...finalizedStreamOutput,
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
      finalizedNonMessageItems.size > 0 || isPartialTerminalResponse || requiresFinalizedToolCalls
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
