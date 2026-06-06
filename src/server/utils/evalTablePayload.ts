import {
  DEFAULT_OVERSIZED_STRING_LIMIT,
  type OversizedStringStats,
  stripOversizedStrings,
} from './safeJsonResponse';

const RESULT_FAILURE_NONE = 0;
const EVAL_CONFIG_DETAIL_FIELDS = ['tests', 'defaultTest', 'scenarios'] as const;
const EVAL_TABLE_CELL_DETAIL_FIELDS = [
  'prompt',
  'response',
  'testCase',
  'metadata',
  'gradingResult',
  'media',
] as const;

type EvalConfigDetailField = (typeof EVAL_CONFIG_DETAIL_FIELDS)[number];

type AudioLike = {
  id?: string;
  expiresAt?: number;
  data?: string;
  blobRef?: unknown;
  transcript?: string;
  format?: string;
  sampleRate?: number;
  channels?: number;
  duration?: number;
};

type ImageLike = {
  data?: string;
  blobRef?: unknown;
  mimeType?: string;
};

type ProviderResponseLike = {
  cached?: boolean;
  tokenUsage?: unknown;
  isRefusal?: boolean;
  finishReason?: string;
  conversationEnded?: boolean;
  conversationEndReason?: string;
  sessionId?: string;
  guardrails?: unknown;
  audio?: AudioLike;
  video?: object;
  images?: ImageLike[];
};

type TestCaseLike = object & {
  vars?: unknown;
  providerOutput?: unknown;
  assert?: unknown;
  options?: unknown;
};

type PromptLike = object & { raw: string };

type TableCellLike = {
  id?: string;
  evalId?: string;
  text?: string;
  prompt?: string;
  provider?: string;
  pass?: boolean;
  score?: number;
  cost?: number;
  latencyMs?: number;
  failureReason?: number;
  namedScores?: Record<string, number>;
  gradingResult?: unknown;
  tokenUsage?: unknown;
  metadata?: Record<string, unknown>;
  error?: unknown;
  testCase?: TestCaseLike;
  response?: ProviderResponseLike;
  audio?: AudioLike;
  video?: object;
  images?: ImageLike[];
  detail?: unknown;
};

type TableRowLike = object & {
  description?: unknown;
  vars: string[];
  test: TestCaseLike;
  outputs: Array<TableCellLike | null | undefined>;
};

type TableLike = object & {
  head: object & { prompts: PromptLike[] };
  body: TableRowLike[];
};

const DETAIL_ONLY_METADATA_KEYS = new Set([
  'inputVars',
  'messages',
  'redteamHistory',
  'redteamTreeHistory',
  'redteamFinalPrompt',
  'citations',
]);

// 'media' is appended at runtime only when media content was actually trimmed.
const BASE_CELL_DETAIL_OMITTED_FIELDS = EVAL_TABLE_CELL_DETAIL_FIELDS.filter(
  (field) => field !== 'media',
);

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

function trimAudioForTable(audio: AudioLike | undefined, maxStringLength: number) {
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

function trimVideoForTable(video: object | undefined, maxStringLength: number) {
  if (!video) {
    return { value: undefined, omitted: false };
  }

  const stats: OversizedStringStats = { oversizedStrings: 0, omittedCharacters: 0 };
  const value = stripOversizedStrings(video, { maxStringLength, stats });
  return {
    value,
    omitted: stats.oversizedStrings > 0,
  };
}

function trimImagesForTable(images: ImageLike[] | undefined, maxStringLength: number) {
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
  metadata: Record<string, unknown> | undefined,
  maxStringLength: number,
) {
  if (!metadata) {
    return undefined;
  }

  const leanMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'redteamHistory' || key === 'redteamTreeHistory') {
      if (Array.isArray(value)) {
        const lastTurn = value[value.length - 1];
        const outputAudio =
          lastTurn && typeof lastTurn === 'object'
            ? (lastTurn as { outputAudio?: AudioLike }).outputAudio
            : undefined;
        const audio = trimAudioForTable(outputAudio, maxStringLength);
        if (audio.value) {
          leanMetadata[key] = [{ outputAudio: audio.value }];
        }
      }
      continue;
    }
    if (DETAIL_ONLY_METADATA_KEYS.has(key)) {
      continue;
    }
    leanMetadata[key] = trimForTable(value, maxStringLength);
  }

  return leanMetadata;
}

function trimProviderResponseForTable(
  response: ProviderResponseLike | undefined,
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
    ...(response.tokenUsage !== undefined && { tokenUsage: response.tokenUsage }),
    ...(response.isRefusal != null && { isRefusal: response.isRefusal }),
    ...(response.finishReason && { finishReason: response.finishReason }),
    ...(response.conversationEnded != null && { conversationEnded: response.conversationEnded }),
    ...(response.conversationEndReason && {
      conversationEndReason: response.conversationEndReason,
    }),
    ...(response.sessionId && { sessionId: response.sessionId }),
    ...(response.guardrails !== undefined && {
      guardrails: trimForTable(response.guardrails, maxStringLength),
    }),
    ...(audio.value && { audio: audio.value }),
    ...(video.value && { video: video.value }),
    ...(images.value && { images: images.value }),
  } as ProviderResponseLike;
}

function trimTestCaseForTable(testCase: TestCaseLike, maxStringLength: number): TestCaseLike {
  const {
    vars: _vars,
    providerOutput: _providerOutput,
    assert: _assert,
    options: _options,
    ...rest
  } = testCase;
  return trimForTable(rest, maxStringLength) as TestCaseLike;
}

function trimPromptForTable<T extends PromptLike>(prompt: T, maxStringLength: number): T {
  return {
    ...trimForTable(prompt, maxStringLength),
    raw: trimTextForTable(prompt.raw, maxStringLength),
  } as T;
}

export function trimTableCellForApi<T extends TableCellLike>(
  cell: T | null | undefined,
  { maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT }: TrimOptions = {},
): T | null | undefined {
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
    failureReason: cell.failureReason ?? RESULT_FAILURE_NONE,
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
        ? [...BASE_CELL_DETAIL_OMITTED_FIELDS, 'media']
        : [...BASE_CELL_DETAIL_OMITTED_FIELDS],
    },
  } as T;
}

function trimTableRowForApi<T extends TableRowLike>(row: T, maxStringLength: number): T {
  return {
    ...row,
    description: trimForTable(row.description, maxStringLength),
    vars: row.vars.map((value) => trimTextForTable(value, maxStringLength)),
    test: trimTestCaseForTable(row.test, maxStringLength),
    outputs: row.outputs.map((output) => trimTableCellForApi(output, { maxStringLength })),
  } as T;
}

export function trimEvalTableForApi<T extends TableLike>(
  table: T,
  { maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT }: TrimOptions = {},
): T {
  return {
    ...table,
    head: {
      ...table.head,
      prompts: table.head.prompts.map((prompt) => trimPromptForTable(prompt, maxStringLength)),
    },
    body: table.body.map((row) => trimTableRowForApi(row, maxStringLength)),
  } as T;
}

export function trimEvalConfigForTableApi<T extends object>(
  config: T,
  { maxStringLength = DEFAULT_OVERSIZED_STRING_LIMIT }: TrimOptions = {},
): {
  config: T;
  detail?: {
    available: boolean;
    omittedFields: EvalConfigDetailField[];
  };
} {
  const leanConfig = { ...config } as Record<string, unknown>;
  const omittedFields: EvalConfigDetailField[] = [];

  for (const field of EVAL_CONFIG_DETAIL_FIELDS) {
    if (field in leanConfig) {
      delete leanConfig[field];
      omittedFields.push(field);
    }
  }

  return {
    config: trimForTable(leanConfig, maxStringLength) as T,
    ...(omittedFields.length > 0 && {
      detail: {
        available: true,
        omittedFields,
      },
    }),
  };
}
