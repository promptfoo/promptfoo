import type {
  ContentBlock,
  ConverseCommandOutput,
  ConverseStreamCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

/** Model-level failures can still carry partial output and billable usage. */
export function getConverseStopReasonError(stopReason: string | undefined): string | undefined {
  switch (stopReason) {
    case 'malformed_model_output':
      return 'Model produced invalid output. The response could not be parsed correctly.';
    case 'malformed_tool_use':
      return 'Model produced a malformed tool use request. Check tool configuration and input schema.';
    // Nova's model-specific response contract also defines built-in tool failures.
    case 'service_unavailable':
      return 'Bedrock built-in tool failed (service_unavailable): the tool service could not be reached.';
    case 'invalid_query':
      return 'Bedrock built-in tool failed (invalid_query): the query was invalid.';
    case 'max_tool_invocations':
      return 'Bedrock built-in tool failed (max_tool_invocations): retries were exhausted.';
    default:
      return undefined;
  }
}

/** A completed stream can fail validation while still reporting billable usage. */
export class ConverseStreamValidationError extends Error {
  constructor(
    message: string,
    readonly response: ConverseCommandOutput,
  ) {
    super(message);
    this.name = 'ConverseStreamValidationError';
  }
}

/** Collect SDK events before executing any tools: a failed stream must never dispatch a tool. */
export async function collectConverseStream(
  response: ConverseStreamCommandOutput,
): Promise<ConverseCommandOutput> {
  if (!response.stream) {
    throw new Error('Bedrock returned no response stream');
  }
  const blocks = new Map<number, ContentBlock>();
  const toolInputs = new Map<number, string>();
  const imageChunks = new Map<number, Uint8Array[]>();
  const openBlocks = new Set<number>();
  let receivedMetadata = false;
  const result: ConverseCommandOutput = {
    $metadata: response.$metadata,
    output: undefined,
    stopReason: undefined,
    usage: undefined,
    metrics: undefined,
  };
  for await (const event of response.stream) {
    for (const key of [
      'internalServerException',
      'modelStreamErrorException',
      'serviceUnavailableException',
      'throttlingException',
      'validationException',
    ] as const) {
      if (event[key]) {
        throw new Error(`${key}: ${event[key].message ?? 'Bedrock stream failed'}`);
      }
    }
    if (event.contentBlockStart) {
      const { contentBlockIndex, start } = event.contentBlockStart;
      const index = contentBlockIndex ?? 0;
      openBlocks.add(index);
      if (start?.toolUse) {
        blocks.set(index, { toolUse: { ...start.toolUse, input: {} } });
        toolInputs.set(index, '');
      } else if (start?.toolResult) {
        blocks.set(index, { toolResult: { ...start.toolResult, content: [] } });
      } else if (start?.image) {
        blocks.set(index, { image: { ...start.image, source: undefined } });
      }
    }
    if (event.contentBlockDelta?.delta) {
      const { delta, contentBlockIndex } = event.contentBlockDelta;
      const index = contentBlockIndex ?? 0;
      openBlocks.add(index);
      const block = blocks.get(index);
      if (delta.text !== undefined) {
        if (block?.citationsContent) {
          const text =
            block.citationsContent.content?.map((part) => part.text ?? '').join('') ?? '';
          block.citationsContent.content = [{ text: text + delta.text }];
        } else {
          blocks.set(index, { text: (block?.text ?? '') + delta.text });
        }
      } else if (delta.toolUse) {
        if (!block?.toolUse) {
          throw new Error('Bedrock streamed tool arguments without a tool start');
        }
        toolInputs.set(index, (toolInputs.get(index) ?? '') + (delta.toolUse.input ?? ''));
      } else if (delta.reasoningContent) {
        const reasoning = delta.reasoningContent;
        if (reasoning.redactedContent) {
          blocks.set(index, {
            reasoningContent: {
              redactedContent: Buffer.concat([
                block?.reasoningContent?.redactedContent ?? new Uint8Array(),
                reasoning.redactedContent,
              ]),
            },
          });
        } else {
          const previous = block?.reasoningContent?.reasoningText;
          blocks.set(index, {
            reasoningContent: {
              reasoningText: {
                text: (previous?.text ?? '') + (reasoning.text ?? ''),
                ...(previous?.signature || reasoning.signature
                  ? { signature: (previous?.signature ?? '') + (reasoning.signature ?? '') }
                  : {}),
              },
            },
          });
        }
      } else if (delta.citation) {
        blocks.set(index, {
          citationsContent: {
            content:
              block?.citationsContent?.content ?? (block?.text ? [{ text: block.text }] : []),
            citations: [
              ...(block?.citationsContent?.citations ?? []),
              {
                ...delta.citation,
                sourceContent: delta.citation.sourceContent?.flatMap((part) =>
                  part.text === undefined ? [] : [{ text: part.text }],
                ),
              },
            ],
          },
        });
      } else if (delta.image) {
        if (delta.image.error) {
          throw new Error(`Bedrock image generation failed: ${JSON.stringify(delta.image.error)}`);
        }
        if (!block?.image) {
          throw new Error('Bedrock streamed image data without an image start');
        }
        const source = delta.image.source;
        if (source?.bytes) {
          const chunks = imageChunks.get(index) ?? [];
          chunks.push(source.bytes);
          imageChunks.set(index, chunks);
        } else if (source) {
          imageChunks.delete(index);
          block.image.source = source;
        }
      } else if (delta.toolResult) {
        if (!block?.toolResult) {
          throw new Error('Bedrock streamed a tool result without a tool result start');
        }
        for (const part of delta.toolResult) {
          if (part.text !== undefined) {
            const content = block.toolResult.content ?? (block.toolResult.content = []);
            const last = content[content.length - 1];
            if (last?.text === undefined) {
              content.push({ text: part.text });
            } else {
              last.text += part.text;
            }
          } else if (part.json !== undefined) {
            block.toolResult.content?.push({ json: part.json });
          }
        }
      }
    }
    if (event.contentBlockStop) {
      const index = event.contentBlockStop.contentBlockIndex ?? 0;
      const block = blocks.get(index);
      const chunks = imageChunks.get(index);
      if (block?.image && chunks) {
        block.image.source = { bytes: Buffer.concat(chunks) };
      }
      imageChunks.delete(index);
      openBlocks.delete(index);
    }
    if (event.messageStop) {
      if (openBlocks.size) {
        throw new Error('Bedrock response stream ended before contentBlockStop');
      }
      result.stopReason = event.messageStop.stopReason;
      result.additionalModelResponseFields = event.messageStop.additionalModelResponseFields;
    }
    if (event.metadata) {
      if (!result.stopReason) {
        throw new Error('Bedrock response stream returned metadata before messageStop');
      }
      receivedMetadata = true;
      Object.assign(result, event.metadata);
    }
  }
  if (!result.stopReason) {
    throw new Error('Bedrock response stream ended before messageStop');
  }
  if (!receivedMetadata || openBlocks.size) {
    throw new Error('Bedrock response stream ended before terminal metadata or contentBlockStop');
  }
  result.output = {
    message: {
      role: 'assistant',
      content: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block),
    },
  };
  if (getConverseStopReasonError(result.stopReason)) {
    throw new ConverseStreamValidationError(
      `Bedrock response stream stopped with ${result.stopReason}`,
      result,
    );
  }
  if (result.stopReason === 'tool_use' && toolInputs.size === 0) {
    throw new ConverseStreamValidationError(
      'Bedrock response stream stopped with tool_use without a tool request',
      result,
    );
  }
  if (
    result.stopReason !== 'tool_use' &&
    [...blocks.values()].some((block) => block.toolUse && block.toolUse.type !== 'server_tool_use')
  ) {
    throw new ConverseStreamValidationError(
      `Bedrock response stream stopped with ${result.stopReason} before completing a client tool request`,
      result,
    );
  }
  for (const [index, raw] of toolInputs) {
    try {
      const input: unknown = JSON.parse(raw || '{}');
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Expected an object');
      }
      blocks.get(index)!.toolUse!.input = input as NonNullable<ContentBlock['toolUse']>['input'];
    } catch {
      throw new ConverseStreamValidationError(
        'Bedrock model emitted invalid JSON arguments for a tool',
        result,
      );
    }
  }
  return result;
}
