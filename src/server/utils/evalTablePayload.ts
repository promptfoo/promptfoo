import { FILE_METADATA_KEY } from '../../providers/constants';
import { ResultFailureReason } from '../../types';
import { DEFAULT_OVERSIZED_STRING_LIMIT, stripOversizedStrings } from './safeJsonResponse';

import type {
  AtomicTestCase,
  CompletedPrompt,
  EvaluateTable,
  EvaluateTableOutput,
  EvaluateTableRow,
  ProviderResponse,
  UnifiedConfig,
} from '../../types';

const DETAIL_ONLY_METADATA_KEYS = new Set([
  'inputVars',
  'messages',
  'redteamHistory',
  'redteamTreeHistory',
  'redteamFinalPrompt',
  'citations',
]);

const DETAIL_OMITTED_FIELDS = ['prompt', 'response', 'testCase', 'metadata'] as const;
const CONFIG_DETAIL_ONLY_FIELDS = ['tests', 'defaultTest', 'scenarios'] as const;

type ConfigDetailOnlyField = (typeof CONFIG_DETAIL_ONLY_FIELDS)[number];

type TrimOptions = {
  maxStringLength?: number;
};

function trimForTable<T>(value: T, maxStringLength: number): T {
  return stripOversizedStrings(value, { maxStringLength });
}

function trimTextForTable(value: string | undefined, maxStringLength: number): string {
  return trimForTable(value ?? '', maxStringLength);
}

function isExternalMediaRef(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    value.startsWith('blob:') ||
    value.startsWith('blobref:') ||
    value.startsWith('storageRef:')
  );
}

function trimMediaData(value: string | undefined, maxStringLength: number) {
  if (!value) {
    return { value, omitted: false };
  }
  if (value.length <= maxStringLength || isExternalMediaRef(value)) {
    return { value, omitted: false };
  }
  return { value: undefined, omitted: true };
}

function trimAudioForTable(
  audio: EvaluateTableOutput['audio'] | NonNullable<ProviderResponse['audio']> | undefined,
  maxStringLength: number,
) {
  if (!audio) {
    return { value: undefined, omitted: false };
  }

  const data = trimMediaData(audio.data, maxStringLength);
  return {
    value: {
      id: audio.id,
      expiresAt: audio.expiresAt,
      data: data.value,
      blobRef: audio.blobRef,
      transcript: trimForTable(audio.transcript, maxStringLength),
      format: audio.format,
      sampleRate: audio.sampleRate,
      channels: audio.channels,
      duration: audio.duration,
    },
    omitted: data.omitted,
  };
}

function trimVideoForTable(
  video: EvaluateTableOutput['video'] | NonNullable<ProviderResponse['video']> | undefined,
  maxStringLength: number,
) {
  if (!video) {
    return { value: undefined, omitted: false };
  }

  return {
    value: trimForTable(video, maxStringLength),
    omitted: false,
  };
}

function trimImagesForTable(images: EvaluateTableOutput['images'], maxStringLength: number) {
  if (!images) {
    return { value: undefined, omitted: false };
  }

  let omitted = false;
  const value = images.map((image) => {
    const data = trimMediaData(image.data, maxStringLength);
    omitted ||= data.omitted;
    return {
      data: data.value,
      blobRef: image.blobRef,
      mimeType: image.mimeType,
    };
  });

  return { value, omitted };
}

function trimMetadataForTable(
  metadata: EvaluateTableOutput['metadata'] | undefined,
  maxStringLength: number,
) {
  if (!metadata) {
    return undefined;
  }

  const leanMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (DETAIL_ONLY_METADATA_KEYS.has(key)) {
      continue;
    }
    if (key === FILE_METADATA_KEY || key === 'transformDisplayVars' || key === 'comment') {
      leanMetadata[key] = trimForTable(value, maxStringLength);
      continue;
    }
    leanMetadata[key] = trimForTable(value, maxStringLength);
  }

  return leanMetadata;
}

function trimProviderResponseForTable(
  response: ProviderResponse | undefined,
  maxStringLength: number,
) {
  if (!response) {
    return undefined;
  }

  const audio = trimAudioForTable(response.audio, maxStringLength);
  const video = trimVideoForTable(response.video, maxStringLength);
  const images = trimImagesForTable(response.images, maxStringLength);

  return {
    ...(response.cached != null && { cached: response.cached }),
    ...(response.tokenUsage && { tokenUsage: response.tokenUsage }),
    ...(response.isRefusal != null && { isRefusal: response.isRefusal }),
    ...(response.finishReason && { finishReason: response.finishReason }),
    ...(response.conversationEnded != null && { conversationEnded: response.conversationEnded }),
    ...(response.conversationEndReason && {
      conversationEndReason: response.conversationEndReason,
    }),
    ...(response.sessionId && { sessionId: response.sessionId }),
    ...(response.guardrails && { guardrails: trimForTable(response.guardrails, maxStringLength) }),
    ...(audio.value && { audio: audio.value }),
    ...(video.value && { video: video.value }),
    ...(images.value && { images: images.value }),
  } as ProviderResponse;
}

function trimTestCaseForTable(testCase: AtomicTestCase, maxStringLength: number): AtomicTestCase {
  const {
    vars: _vars,
    providerOutput: _providerOutput,
    assert: _assert,
    options: _options,
    ...rest
  } = testCase;
  return trimForTable(rest, maxStringLength) as AtomicTestCase;
}

function trimPromptForTable(prompt: CompletedPrompt, maxStringLength: number): CompletedPrompt {
  return {
    ...trimForTable(prompt, maxStringLength),
    raw: trimTextForTable(prompt.raw, maxStringLength),
  };
}

export function trimTableCellForApi(
  cell: EvaluateTableOutput | null | undefined,
  { maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT }: TrimOptions = {},
): EvaluateTableOutput | null | undefined {
  if (!cell) {
    return cell;
  }

  const audio = trimAudioForTable(cell.audio, maxStringLength);
  const video = trimVideoForTable(cell.video, maxStringLength);
  const images = trimImagesForTable(cell.images, maxStringLength);
  const mediaWasOmitted = audio.omitted || video.omitted || images.omitted;

  return {
    id: cell.id,
    evalId: cell.evalId,
    text: trimTextForTable(cell.text, maxStringLength),
    prompt: '',
    provider: cell.provider,
    pass: cell.pass,
    score: cell.score,
    cost: cell.cost ?? 0,
    latencyMs: cell.latencyMs ?? 0,
    failureReason: cell.failureReason ?? ResultFailureReason.NONE,
    namedScores: cell.namedScores ?? {},
    gradingResult: trimForTable(cell.gradingResult, maxStringLength),
    tokenUsage: cell.tokenUsage,
    metadata: trimMetadataForTable(cell.metadata, maxStringLength),
    error: trimForTable(cell.error, maxStringLength),
    testCase: trimTestCaseForTable(cell.testCase ?? {}, maxStringLength),
    response: trimProviderResponseForTable(cell.response, maxStringLength),
    audio: audio.value,
    video: video.value,
    images: images.value,
    detail: {
      available: Boolean(cell.id),
      omittedFields: mediaWasOmitted
        ? [...DETAIL_OMITTED_FIELDS, 'media']
        : [...DETAIL_OMITTED_FIELDS],
    },
  };
}

function trimTableRowForApi(row: EvaluateTableRow, maxStringLength: number): EvaluateTableRow {
  return {
    ...row,
    description: trimForTable(row.description, maxStringLength),
    vars: row.vars.map((value) => trimTextForTable(value, maxStringLength)),
    test: trimTestCaseForTable(row.test, maxStringLength),
    outputs: row.outputs.map((output) => trimTableCellForApi(output, { maxStringLength })),
  } as EvaluateTableRow;
}

export function trimEvalTableForApi(
  table: EvaluateTable,
  { maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT }: TrimOptions = {},
): EvaluateTable {
  return {
    ...table,
    head: {
      ...table.head,
      prompts: table.head.prompts.map((prompt) => trimPromptForTable(prompt, maxStringLength)),
    },
    body: table.body.map((row) => trimTableRowForApi(row, maxStringLength)),
  };
}

export function trimEvalConfigForTableApi(
  config: Partial<UnifiedConfig>,
  { maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT }: TrimOptions = {},
): {
  config: Partial<UnifiedConfig>;
  detail?: {
    available: boolean;
    omittedFields: ConfigDetailOnlyField[];
  };
} {
  const leanConfig: Record<string, unknown> = { ...config };
  const omittedFields: ConfigDetailOnlyField[] = [];

  for (const field of CONFIG_DETAIL_ONLY_FIELDS) {
    if (field in leanConfig) {
      delete leanConfig[field];
      omittedFields.push(field);
    }
  }

  return {
    config: trimForTable(leanConfig, maxStringLength) as Partial<UnifiedConfig>,
    ...(omittedFields.length > 0 && {
      detail: {
        available: true,
        omittedFields,
      },
    }),
  };
}
