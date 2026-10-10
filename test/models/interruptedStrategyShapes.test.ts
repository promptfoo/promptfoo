import { createHash, randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBlobByHash } from '../../src/blobs';
import { collectBlobHashes } from '../../src/blobs/blobRefs';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult, {
  getStripFlags,
  sanitizeResultForJsonlArtifact,
} from '../../src/models/evalResult';
import { safeJsonStringify } from '../../src/util/json';
import { createEvaluateResult } from '../factories/eval';

import type { BlobRef } from '../../src/contracts/blobs';
import type { EvaluateResult } from '../../src/types';

const bytes = Buffer.alloc(2048, 81);
const outputHash = createHash('sha256').update(bytes).digest('hex');
const outputRef: BlobRef = {
  hash: outputHash,
  uri: `promptfoo://blob/${outputHash}`,
  mimeType: 'image/png',
  sizeBytes: bytes.length,
  provider: 'filesystem',
};
const outputData = `data:image/png;base64,${bytes.toString('base64')}`;
const promptMedia = `data:image/png;base64,${Buffer.alloc(2048, 82).toString('base64')}`;
const inputMedia = `data:image/png;base64,${Buffer.alloc(2048, 83).toString('base64')}`;

// Legacy imports deserialize permissive JSON rows without widening the runtime DTO.
function legacyResult(response: unknown, metadata: unknown = {}): EvaluateResult {
  return JSON.parse(JSON.stringify({ ...createEvaluateResult(), response, metadata }));
}

const outputShapes: Array<{ name: string; response: unknown }> = [
  ...[
    { audio: { blobRef: outputRef } },
    { audio: { data: bytes.toString('base64'), format: 'wav' } },
    { video: { data: bytes.toString('base64'), format: 'mp4' } },
    { images: [{ blobRef: outputRef }] },
    { images: [{ data: outputData }] },
    { output: outputData },
    { output: outputRef.uri },
    { blobRef: outputRef },
    {
      output: JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] }),
      isBase64: true,
      format: 'json',
    },
  ].flatMap((media, index) => [
    {
      name: `canonical media with opaque sibling ${index}`,
      response: { ...media, payload: bytes.toString('base64') },
    },
    {
      name: `metadata media with opaque sibling ${index}`,
      response: { metadata: { ...media, payload: bytes.toString('base64') } },
    },
    {
      name: `nested metadata media with opaque sibling ${index}`,
      response: { metadata: { attachment: media, payload: bytes.toString('base64') } },
    },
    {
      name: `turn media with opaque sibling ${index}`,
      response: { turns: [{ ...media, payload: bytes.toString('base64') }] },
    },
    {
      name: `malformed response array with media ${index}`,
      response: [{ ...media, payload: bytes.toString('base64') }],
    },
    {
      name: `malformed turn array with media ${index}`,
      response: { turns: [[{ ...media, payload: bytes.toString('base64') }]] },
    },
  ]),
  { name: 'direct reference', response: outputRef },
  {
    name: 'direct media payload',
    response: {
      ...outputRef,
      data: bytes.toString('base64'),
      payload: { opaque: bytes.toString('base64') },
    },
  },
  { name: 'reference wrapper', response: { blobRef: outputRef } },
  { name: 'opaque attachment', response: { attachment: { nested: outputRef } } },
  { name: 'scalar metadata URI', response: { metadata: outputRef.uri } },
  { name: 'scalar metadata data URL', response: { metadata: outputData } },
  { name: 'array metadata', response: { metadata: ['ordinary', outputRef] } },
  { name: 'direct metadata reference', response: { metadata: outputRef } },
  {
    name: 'direct metadata payload',
    response: {
      metadata: {
        ...outputRef,
        data: bytes.toString('base64'),
        prompt: bytes.toString('base64'),
        cost: bytes.toString('base64'),
      },
    },
  },
  { name: 'turn reference', response: { turns: [outputRef] } },
  {
    name: 'direct turn payload',
    response: {
      turns: [{ ...outputRef, data: bytes.toString('base64'), b64_json: bytes.toString('base64') }],
    },
  },
  { name: 'turn reference wrapper', response: { turns: [{ blobRef: outputRef }] } },
  { name: 'turn scalar metadata', response: { turns: [{ metadata: outputData }] } },
  { name: 'turn array metadata', response: { turns: [{ metadata: ['ordinary', outputRef] }] } },
  {
    name: 'reference with response input and accounting',
    response: { ...outputRef, prompt: promptMedia, cost: 0.25, tokenUsage: { total: 5 } },
  },
  {
    name: 'reference with turn input and accounting',
    response: {
      turns: [{ ...outputRef, prompt: promptMedia, input: inputMedia, cost: 0.25 }],
    },
  },
  {
    name: 'reference metadata with a nested checkpoint',
    response: {
      metadata: {
        ...outputRef,
        interruptedStrategy: true,
        completedTargetResponses: [{ prompt: promptMedia, response: { output: 'text' } }],
      },
    },
  },
  ...[
    { cost: { ...outputRef, data: bytes.toString('base64') } },
    { cost: bytes.toString('base64') },
    { cached: { data: bytes.toString('base64') } },
    { tokenUsage: { total: 5, data: bytes.toString('base64') } },
    { logProbs: [{ data: bytes.toString('base64') }] },
    { guardrails: { flagged: false, payload: bytes.toString('base64') } },
    { error: { data: bytes.toString('base64') } },
    {
      error: bytes.toString('base64'),
      format: bytes.toString('base64'),
      conversationEndReason: bytes.toString('base64'),
      sessionId: bytes.toString('base64'),
      finishReason: bytes.toString('base64'),
      guardrails: { reason: bytes.toString('base64') },
    },
  ].map((control, index) => ({
    name: `media record with malformed control ${index}`,
    response: { ...outputRef, ...control },
  })),
];

describe('interrupted checkpoint JSON and media shapes', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe.each(['single', 'batch', 'save'] as const)('%s legacy responses', (mode) => {
    it.each([
      undefined,
      null,
      false,
      true,
      0,
      1,
      '',
      'legacy',
      [],
      ['legacy'],
      {},
      { output: 'text' },
    ])('preserves accepted JSON shape %#', async (response) => {
      const input = legacyResult(response);
      const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
      let row: EvalResult;
      if (mode === 'batch') {
        [row] = await EvalResult.createManyFromEvaluateResult([input], record.id);
      } else {
        row = await EvalResult.createFromEvaluateResult(record.id, input, {
          persist: mode === 'single',
        });
        if (mode === 'save') {
          await row.save();
        }
      }
      const saved = await EvalResult.findById(row.id);
      expect(saved).toBeDefined();
      expect(saved!.response).toEqual(response || undefined);
      expect(() => saved!.toEvaluateResult()).not.toThrow();
      expect(() => sanitizeResultForJsonlArtifact(input)).not.toThrow();
    });
  });

  describe.each(['model', 'jsonl'] as const)('%s owned output shapes', (boundary) => {
    it.each([
      { response: 'legacy', audio: { data: bytes.toString('base64') } },
      { audio: { data: bytes.toString('base64') }, payload: bytes.toString('base64') },
      {
        response: [
          {
            metadata: {
              interruptedStrategy: true,
              completedTargetResponses: [
                { response: { audio: { data: bytes.toString('base64') } } },
              ],
            },
          },
        ],
      },
    ])('strips inline media from malformed checkpoint entries %#', async (entry) => {
      for (const entries of [[entry], entry]) {
        const metadata = { interruptedStrategy: true, completedTargetResponses: entries };
        const input = legacyResult({ metadata }, metadata);
        const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
          persist: false,
        });
        const flags = { ...getStripFlags(), shouldStripResponseOutput: true };
        const projected =
          boundary === 'model'
            ? row.toEvaluateResult(flags)
            : sanitizeResultForJsonlArtifact(input, flags);
        expect(JSON.stringify(projected)).not.toContain(bytes.toString('base64'));
      }
    });

    it.each(outputShapes)('projects $name without stripping inputs', async ({ response }) => {
      const valid = {
        prompt: promptMedia,
        response: {
          prompt: promptMedia,
          output: 'ordinary output',
          materializedVars: { image: inputMedia },
          inputMaterialization: { image: inputMedia },
          turns: [{ input: inputMedia, prompt: promptMedia, output: 'turn output' }],
          cost: 0.25,
          tokenUsage: { total: 5 },
        },
      };
      for (const mirrored of [false, true]) {
        const metadata = {
          interruptedStrategy: true,
          completedTargetResponses: [{ response }, valid],
        };
        const input = legacyResult(
          { output: 'text', metadata: mirrored ? metadata : {} },
          metadata,
        );
        const original = structuredClone(input);
        const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
          persist: false,
        });
        for (const [stripPrompt, stripOutput] of [
          [false, false],
          [false, true],
          [true, false],
          [true, true],
        ]) {
          const flags = {
            ...getStripFlags(),
            shouldStripPromptText: stripPrompt,
            shouldStripResponseOutput: stripOutput,
          };
          const projected =
            boundary === 'model'
              ? row.toEvaluateResult(flags)
              : sanitizeResultForJsonlArtifact(input, flags);
          expect(collectBlobHashes(projected).has(outputHash)).toBe(
            !stripOutput && JSON.stringify(input).includes(outputHash),
          );
          expect(JSON.stringify(projected).includes(outputData)).toBe(
            !stripOutput && JSON.stringify(input).includes(outputData),
          );
          expect(JSON.stringify(projected).includes(bytes.toString('base64'))).toBe(
            !stripOutput && JSON.stringify(input).includes(bytes.toString('base64')),
          );
          const neighbor = projected.metadata!.completedTargetResponses[1];
          expect(neighbor.prompt).toBe(stripPrompt ? '[prompt stripped]' : promptMedia);
          expect(neighbor.response.prompt).toBe(stripPrompt ? '[prompt stripped]' : promptMedia);
          expect(neighbor.response.materializedVars.image).toBe(inputMedia);
          expect(neighbor.response.inputMaterialization.image).toBe(inputMedia);
          expect(neighbor.response.turns[0].input).toBe(inputMedia);
          expect(neighbor.response.cost).toBe(0.25);
          expect(neighbor.response.tokenUsage).toEqual({ total: 5 });
        }
        expect(input).toEqual(original);
      }
    });

    it.each([
      { name: 'data URL', fields: { attachment: outputData }, collapses: true },
      { name: 'blob URI', fields: { attachment: outputRef.uri }, collapses: true },
      { name: 'blob record', fields: { attachment: outputRef }, collapses: true },
      {
        name: 'nested media',
        fields: { attachment: { items: [null, outputRef, { data: outputData }] } },
        collapses: true,
      },
      {
        name: 'undeclared input aliases',
        fields: { input: outputData, materializedVars: { image: outputRef } },
        collapses: true,
      },
      {
        name: 'entry media record',
        fields: { ...outputRef, data: bytes.toString('base64') },
        collapses: true,
      },
      {
        name: 'entry media wrapper with opaque sibling',
        fields: { blobRef: outputRef, payload: bytes.toString('base64') },
        collapses: true,
      },
      {
        name: 'ordinary extra data',
        fields: { attachment: { label: 'ordinary', values: [null, 0, false] } },
        collapses: false,
      },
    ])('projects extra entry fields: $name', async ({ fields, collapses }) => {
      for (const location of ['mirrored', 'response-only', 'row-only']) {
        const metadata = {
          interruptedStrategy: true,
          completedTargetResponses: [
            {
              ...fields,
              ...(collapses && { payload: bytes.toString('base64') }),
              note: 'ordinary extra note',
              prompt: promptMedia,
              response: {
                prompt: promptMedia,
                output: 'private output',
                materializedVars: { image: inputMedia },
                inputMaterialization: { image: inputMedia },
                cost: 0.25,
                tokenUsage: { total: 5 },
              },
            },
          ],
        };
        const input = legacyResult(
          { output: 'text', metadata: location === 'row-only' ? {} : metadata },
          location === 'response-only' ? {} : metadata,
        );
        const original = structuredClone(input);
        const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
          persist: false,
        });
        for (const [stripPrompt, stripOutput] of [
          [false, false],
          [false, true],
          [true, false],
          [true, true],
        ]) {
          const flags = {
            ...getStripFlags(),
            shouldStripPromptText: stripPrompt,
            shouldStripResponseOutput: stripOutput,
          };
          const projected =
            boundary === 'model'
              ? row.toEvaluateResult(flags)
              : sanitizeResultForJsonlArtifact(input, flags);
          expect(collectBlobHashes(projected).has(outputHash)).toBe(
            !stripOutput && JSON.stringify(input).includes(outputHash),
          );
          expect(JSON.stringify(projected).includes(bytes.toString('base64'))).toBe(
            !stripOutput && JSON.stringify(input).includes(bytes.toString('base64')),
          );
          const copies = [projected.response?.metadata, projected.metadata].filter(
            (copy) => copy?.interruptedStrategy,
          );
          expect(copies).toHaveLength(location === 'mirrored' ? 2 : 1);
          for (const copy of copies) {
            const entry = copy!.completedTargetResponses[0];
            expect(entry.note).toBe(stripOutput && collapses ? undefined : 'ordinary extra note');
            expect(entry.prompt).toBe(stripPrompt ? '[prompt stripped]' : promptMedia);
            expect(entry.response).toMatchObject({
              prompt: stripPrompt ? '[prompt stripped]' : promptMedia,
              output: stripOutput ? '[output stripped]' : 'private output',
              materializedVars: { image: inputMedia },
              inputMaterialization: { image: inputMedia },
              cost: 0.25,
              tokenUsage: { total: 5 },
            });
          }
        }
        expect(input).toEqual(original);
      }
    });

    describe.each([
      { name: 'hash-only entry', fields: { hash: outputHash }, media: true },
      { name: 'URI-only entry', fields: { uri: outputRef.uri }, media: true },
      { name: 'full media entry', fields: outputRef, media: true },
      { name: 'wrapped reference entry', fields: { blobRef: outputRef }, media: true },
      { name: 'ordinary entry', fields: { label: 'ordinary entry' }, media: false },
    ])('$name child output context', ({ fields, media }) => {
      it.each(
        [
          { name: 'metadata bytes', children: { metadata: { data: bytes.toString('base64') } } },
          {
            name: 'turn bytes',
            children: {
              turns: [
                {
                  data: bytes.toString('base64'),
                  prompt: promptMedia,
                  input: inputMedia,
                  cost: 0.125,
                  tokenUsage: { total: 2 },
                },
              ],
            },
          },
          {
            name: 'nested checkpoint bytes',
            children: {
              metadata: {
                interruptedStrategy: true,
                completedTargetResponses: [
                  {
                    prompt: promptMedia,
                    response: {
                      metadata: { data: bytes.toString('base64') },
                      prompt: promptMedia,
                      input: inputMedia,
                      cost: 0.125,
                      tokenUsage: { total: 2 },
                    },
                  },
                ],
              },
            },
          },
        ].flatMap((scenario) =>
          ['mirrored', 'response-only', 'row-only'].flatMap((location) =>
            [
              [false, false],
              [false, true],
              [true, false],
              [true, true],
            ].map(([stripPrompt, stripOutput]) => ({
              ...scenario,
              location,
              stripPrompt,
              stripOutput,
            })),
          ),
        ),
      )(
        'projects $name at $location with prompt=$stripPrompt output=$stripOutput',
        async ({ name, children, location, stripPrompt, stripOutput }) => {
          const ordinaryMetadata = { data: bytes.toString('base64'), note: 'ordinary neighbor' };
          const metadata = {
            interruptedStrategy: true,
            completedTargetResponses: [
              {
                ...fields,
                prompt: promptMedia,
                response: {
                  ...children,
                  prompt: promptMedia,
                  input: inputMedia,
                  materializedVars: { image: inputMedia },
                  inputMaterialization: { image: inputMedia },
                  cost: 0.25,
                  tokenUsage: { total: 5 },
                },
              },
              { response: { metadata: ordinaryMetadata, error: 'ordinary diagnostic' } },
            ],
          };
          const input = {
            ...legacyResult(
              { output: 'text', metadata: location === 'row-only' ? {} : metadata },
              location === 'response-only' ? {} : metadata,
            ),
            cost: 0.5,
          };
          const original = structuredClone(input);
          const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
            persist: false,
          });
          const rowBefore = structuredClone({ response: row.response, metadata: row.metadata });
          const flags = {
            ...getStripFlags(),
            shouldStripPromptText: stripPrompt,
            shouldStripResponseOutput: stripOutput,
          };
          const projected =
            boundary === 'model'
              ? row.toEvaluateResult(flags)
              : sanitizeResultForJsonlArtifact(input, flags);
          expect(projected.cost).toBe(0.5);
          const expectedPrompt = stripPrompt ? '[prompt stripped]' : promptMedia;
          const copies = [projected.response?.metadata, projected.metadata].filter(
            (copy) => copy?.interruptedStrategy,
          );
          expect(copies).toHaveLength(location === 'mirrored' ? 2 : 1);
          copies.forEach((copy) => {
            const entry = copy!.completedTargetResponses[0];
            const target = entry.response;
            expect(JSON.stringify(target).includes(bytes.toString('base64'))).toBe(
              !(media && stripOutput),
            );
            expect(collectBlobHashes(entry).has(outputHash)).toBe(
              !stripOutput && JSON.stringify(fields).includes(outputHash),
            );
            expect(entry.prompt).toBe(expectedPrompt);
            expect(target).toMatchObject({
              prompt: expectedPrompt,
              input: inputMedia,
              materializedVars: { image: inputMedia },
              inputMaterialization: { image: inputMedia },
              cost: 0.25,
              tokenUsage: { total: 5 },
            });
            expect(copy!.completedTargetResponses[1].response).toMatchObject({
              metadata: ordinaryMetadata,
              error: 'ordinary diagnostic',
            });
            const child =
              name === 'turn bytes'
                ? target.turns[0]
                : target.metadata?.completedTargetResponses?.[0]?.response;
            if (child) {
              expect(child).toMatchObject({
                prompt: expectedPrompt,
                input: inputMedia,
                cost: 0.125,
                tokenUsage: { total: 2 },
              });
            }
            if (name === 'nested checkpoint bytes') {
              expect(target.metadata.completedTargetResponses[0].prompt).toBe(expectedPrompt);
            }
          });
          expect(input).toEqual(original);
          expect({ response: row.response, metadata: row.metadata }).toEqual(rowBefore);
        },
      );
    });
  });

  it.each([
    undefined,
    null,
    false,
    true,
    0,
    1,
    '',
    'ordinary',
    [],
    ['ordinary'],
    {},
    { ordinary: 'value' },
  ])('preserves opaque nonmedia checkpoint metadata shape %#', async (value) => {
    const metadata = {
      interruptedStrategy: true,
      completedTargetResponses: [{ response: { metadata: value } }],
    };
    const input = legacyResult({ metadata }, metadata);
    const projected = sanitizeResultForJsonlArtifact(input, {
      ...getStripFlags(),
      shouldStripResponseOutput: true,
    });
    expect(projected.metadata!.completedTargetResponses[0].response.metadata).toEqual(value);
  });

  it.each(['model', 'jsonl'])('keeps ordinary diagnostics at the %s boundary', async (boundary) => {
    const diagnostics = {
      error: 'synthetic diagnostic',
      format: 'json',
      conversationEndReason: 'completed',
      sessionId: 'synthetic-session',
      finishReason: 'stop',
      guardrails: { flagged: true, reason: 'synthetic reason' },
    };
    for (const mediaRecord of [false, true]) {
      const metadata = {
        interruptedStrategy: true,
        completedTargetResponses: [
          { response: { ...(mediaRecord ? outputRef : {}), ...diagnostics } },
        ],
      };
      const input = legacyResult({ metadata }, metadata);
      const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
        persist: false,
      });
      const flags = { ...getStripFlags(), shouldStripResponseOutput: true };
      const projected =
        boundary === 'model'
          ? row.toEvaluateResult(flags)
          : sanitizeResultForJsonlArtifact(input, flags);
      const response = projected.metadata!.completedTargetResponses[0].response;
      if (mediaRecord) {
        for (const key of Object.keys(diagnostics).filter((key) => key !== 'guardrails')) {
          expect(response[key]).toBeUndefined();
        }
        expect(response.guardrails).toEqual({ flagged: true });
      } else {
        expect(response).toMatchObject(diagnostics);
      }
    }
  });

  describe.each([false, true])('malformed media with inline=%s', (inline) => {
    it.each([
      { images: null },
      { images: false },
      { images: true },
      { images: 0 },
      { images: 1 },
      { images: 'legacy' },
      { images: {} },
      { images: { length: 1 } },
      { images: [null, false, 1, 'legacy', {}, []] },
      { audio: { data: bytes.toString('base64'), format: null } },
      { audio: { data: bytes.toString('base64'), format: false } },
      { audio: { data: bytes.toString('base64'), format: true } },
      { audio: { data: bytes.toString('base64'), format: 0 } },
      { audio: { data: bytes.toString('base64'), format: 1 } },
      { audio: { data: bytes.toString('base64'), format: [] } },
      { audio: { data: bytes.toString('base64'), format: {} } },
      { turns: [{ audio: { data: bytes.toString('base64'), format: 1 } }] },
    ])('preserves malformed nested media without aborting persistence %#', async (response) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const metadata = { interruptedStrategy: true, completedTargetResponses: [{ response }] };
      const input = legacyResult({ metadata }, metadata);
      const original = structuredClone(input);
      const record = await Eval.create(
        { env: { PROMPTFOO_INLINE_MEDIA: String(inline) } },
        [input.prompt],
        { id: randomUUID() },
      );
      const row = await EvalResult.createFromEvaluateResult(record.id, input);
      row.score = 0.5;
      await row.save();
      const saved = await EvalResult.findById(row.id);
      expect(saved!.score).toBe(0.5);
      if ('images' in response) {
        expect(saved!.metadata.completedTargetResponses[0].response.images).toEqual(
          response.images,
        );
      } else {
        expect(collectBlobHashes(saved!.metadata).has(outputHash)).toBe(!inline);
      }
      expect(input).toEqual(original);
    });
  });

  it.each(['single', 'batch', 'save'] as const)(
    'preserves byte-complete media before %s serialization',
    async (mode) => {
      const media = Buffer.alloc(128 * 1024, 84);
      const data = `data:image/png;base64,${media.toString('base64')}`;
      const response = {
        output: 'images',
        images: Array.from({ length: 16 }, () => ({ data, mimeType: 'image/png' })),
      };
      const input = createEvaluateResult({ response });
      const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
      const pending =
        mode === 'save'
          ? await EvalResult.createFromEvaluateResult(record.id, input, { persist: false })
          : undefined;
      const stringify = JSON.stringify;
      const encodedSizes: number[] = [];
      vi.spyOn(JSON, 'stringify').mockImplementation((...args) => {
        const encoded = Reflect.apply(stringify, JSON, args);
        if (encoded) {
          encodedSizes.push(encoded.length);
        }
        return encoded;
      });
      let row: EvalResult;
      if (pending) {
        await pending.save();
        row = pending;
      } else if (mode === 'batch') {
        [row] = await EvalResult.createManyFromEvaluateResult([input], record.id);
      } else {
        row = await EvalResult.createFromEvaluateResult(record.id, input);
      }
      vi.restoreAllMocks();
      expect(Math.max(...encodedSizes)).toBeLessThan(64 * 1024);
      const saved = await EvalResult.findById(row.id);
      expect(saved!.response!.images).toHaveLength(16);
      const expectedHash = createHash('sha256').update(media).digest('hex');
      for (const image of saved!.response!.images!) {
        expect(image.data).toBeUndefined();
        expect(image.blobRef!.hash).toBe(expectedHash);
      }
      expect((await getBlobByHash(expectedHash))!.data.equals(media)).toBe(true);
      expect(response.images.every((image) => image.data === data)).toBe(true);
    },
  );

  it('keeps native JSON semantics for cycles, shared aliases, toJSON and special keys', async () => {
    const shared = { message: 'shared string' };
    const raw = {
      first: shared,
      second: shared,
      date: new Date('2026-01-01T00:00:00Z'),
      buffer: Buffer.from([1, 2, 3]),
      hole: [undefined, () => 'ignored'],
      custom: {
        toJSON() {
          return { value: 'custom string' };
        },
      },
      special: JSON.parse('{"__proto__":"ordinary own value","":"empty key"}'),
      self: undefined as unknown,
    };
    raw.self = raw;
    const expected = JSON.parse(safeJsonStringify(raw)!);
    const input = createEvaluateResult({
      response: { output: 'text', raw, audio: { data: bytes.toString('base64'), format: 'wav' } },
    });
    const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
    const row = await EvalResult.createFromEvaluateResult(record.id, input);
    expect((await EvalResult.findById(row.id))!.response!.raw).toEqual(expected);
    expect(raw.self).toBe(raw);
    expect(raw.first).toBe(raw.second);
    expect(Object.getPrototypeOf(raw.special)).toBe(Object.prototype);
  });

  it('keeps the native root toJSON key during pre-extraction normalization', async () => {
    const keys: string[] = [];
    const response = {
      output: 'before toJSON',
      toJSON(key: string) {
        keys.push(key);
        return { output: key, audio: { data: bytes.toString('base64'), format: 'wav' } };
      },
    };
    const input = createEvaluateResult({ response });
    const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
    const row = await EvalResult.createFromEvaluateResult(record.id, input);
    expect(keys).toEqual(['']);
    expect((await EvalResult.findById(row.id))!.response!.output).toBe('');
  });

  it('rejects a serialization size failure instead of storing truncated media', async () => {
    const response = { images: Array.from({ length: 16 }, () => ({ data: outputData })) };
    const input = createEvaluateResult({ response });
    const record = await Eval.create({}, [input.prompt], { id: randomUUID() });
    const stringify = JSON.stringify;
    const failure = new RangeError('Invalid string length');
    vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
      if (value === response) {
        throw failure;
      }
      return Reflect.apply(stringify, JSON, [value, ...args]);
    });
    await expect(EvalResult.createFromEvaluateResult(record.id, input)).rejects.toBe(failure);
    vi.restoreAllMocks();
    expect(await record.getResults()).toEqual([]);
    expect(response.images).toHaveLength(16);
    expect(response.images.every((image) => image.data === outputData)).toBe(true);
  });

  it('keeps inputs and accounting on media-bearing response and turn records', async () => {
    const response = {
      ...outputRef,
      prompt: promptMedia,
      cost: 0.25,
      incurredCost: 0.5,
      cached: false,
      materializationHandled: true,
      sessionId: 'synthetic-session',
      conversationEnded: true,
      finishReason: 'stop',
      tokenUsage: { total: 5 },
      turns: [
        {
          ...outputRef,
          prompt: promptMedia,
          input: inputMedia,
          cost: 0.125,
          tokenUsage: { total: 2 },
        },
      ],
    };
    const metadata = { interruptedStrategy: true, completedTargetResponses: [{ response }] };
    const input = legacyResult({ metadata }, metadata);
    for (const stripPrompt of [false, true]) {
      const projected = sanitizeResultForJsonlArtifact(input, {
        ...getStripFlags(),
        shouldStripResponseOutput: true,
        shouldStripPromptText: stripPrompt,
      });
      const target = projected.metadata!.completedTargetResponses[0].response;
      expect(target).toMatchObject({
        prompt: stripPrompt ? '[prompt stripped]' : promptMedia,
        cost: 0.25,
        incurredCost: 0.5,
        cached: false,
        materializationHandled: true,
        conversationEnded: true,
        tokenUsage: { total: 5 },
      });
      expect(target.turns[0]).toMatchObject({
        prompt: stripPrompt ? '[prompt stripped]' : promptMedia,
        input: inputMedia,
        cost: 0.125,
        tokenUsage: { total: 2 },
      });
      expect(collectBlobHashes(target).has(outputHash)).toBe(false);
    }
  });

  describe.each(['model', 'jsonl'] as const)('%s projection context', (boundary) => {
    it.each([undefined, null, false, true, 0, 1, '', 'legacy', [], ['legacy']])(
      'keeps opaque response shape %# independent of prompt stripping',
      async (response) => {
        for (const role of ['ordinary', 'checkpoint', 'turn']) {
          const metadata = {
            interruptedStrategy: true,
            completedTargetResponses: [
              { response: role === 'turn' ? { turns: [response] } : response },
            ],
          };
          const input =
            role === 'ordinary' ? legacyResult(response) : legacyResult({ metadata }, metadata);
          const original = structuredClone(input);
          const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
            persist: false,
          });
          const project = (stripPrompt: boolean, stripOutput: boolean) => {
            const flags = {
              ...getStripFlags(),
              shouldStripPromptText: stripPrompt,
              shouldStripResponseOutput: stripOutput,
            };
            const projected =
              boundary === 'model'
                ? row.toEvaluateResult(flags)
                : sanitizeResultForJsonlArtifact(input, flags);
            if (role === 'ordinary') {
              return projected.response;
            }
            const target = projected.metadata!.completedTargetResponses[0].response;
            return role === 'turn' ? target.turns[0] : target;
          };
          // Output projection retains its prior behavior; adding the independent
          // prompt flag must not coerce an opaque response into a record.
          for (const stripOutput of [false, true]) {
            expect(project(true, stripOutput)).toEqual(project(false, stripOutput));
          }
          expect(input).toEqual(original);
        }
      },
    );

    it.each([
      { name: 'scalar metadata', fields: { metadata: bytes.toString('base64') } },
      { name: 'array metadata', fields: { metadata: [bytes.toString('base64')] } },
      { name: 'metadata data', fields: { metadata: { data: bytes.toString('base64') } } },
      {
        name: 'nested metadata payload',
        fields: { metadata: { nested: { payload: bytes.toString('base64') } } },
      },
      { name: 'scalar turns', fields: { turns: bytes.toString('base64') } },
      { name: 'record turns', fields: { turns: { data: bytes.toString('base64') } } },
      { name: 'array turns', fields: { turns: [bytes.toString('base64')] } },
      {
        name: 'turn output record',
        fields: {
          turns: [
            {
              prompt: promptMedia,
              input: inputMedia,
              cost: 0.125,
              tokenUsage: { total: 2 },
              data: bytes.toString('base64'),
              metadata: { payload: bytes.toString('base64') },
            },
          ],
        },
      },
      {
        name: 'owned nested checkpoint',
        fields: {
          metadata: {
            interruptedStrategy: true,
            completedTargetResponses: [
              {
                prompt: promptMedia,
                attachment: bytes.toString('base64'),
                response: {
                  prompt: promptMedia,
                  materializedVars: { image: inputMedia },
                  cost: 0.125,
                  tokenUsage: { total: 2 },
                  metadata: { data: bytes.toString('base64') },
                },
              },
            ],
          },
        },
      },
    ])('strips inherited media children: $name', async ({ name, fields }) => {
      for (const role of ['checkpoint', 'turn']) {
        const mediaResponse = {
          ...outputRef,
          ...fields,
          prompt: promptMedia,
          materializedVars: { image: inputMedia },
          cost: 0.25,
          tokenUsage: { total: 5 },
        };
        const ordinaryMetadata = { data: bytes.toString('base64'), note: 'ordinary note' };
        const metadata = {
          interruptedStrategy: true,
          completedTargetResponses: [
            { response: role === 'turn' ? { turns: [mediaResponse] } : mediaResponse },
            { response: { metadata: ordinaryMetadata, error: 'ordinary diagnostic' } },
          ],
        };
        const input = legacyResult({ metadata }, metadata);
        const original = structuredClone(input);
        const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
          persist: false,
        });
        for (const stripOutput of [false, true]) {
          for (const stripPrompt of [false, true]) {
            const flags = {
              ...getStripFlags(),
              shouldStripPromptText: stripPrompt,
              shouldStripResponseOutput: stripOutput,
            };
            const projected =
              boundary === 'model'
                ? row.toEvaluateResult(flags)
                : sanitizeResultForJsonlArtifact(input, flags);
            for (const copy of [projected.metadata, projected.response?.metadata]) {
              const response = copy!.completedTargetResponses[0].response;
              const target = role === 'turn' ? response.turns[0] : response;
              expect(JSON.stringify(target).includes(bytes.toString('base64'))).toBe(!stripOutput);
              expect(collectBlobHashes(target).has(outputHash)).toBe(!stripOutput);
              expect(target).toMatchObject({
                prompt: stripPrompt ? '[prompt stripped]' : promptMedia,
                materializedVars: { image: inputMedia },
                cost: 0.25,
                tokenUsage: { total: 5 },
              });
              expect(copy!.completedTargetResponses[1].response).toMatchObject({
                metadata: ordinaryMetadata,
                error: 'ordinary diagnostic',
              });
              if (name === 'turn output record') {
                expect(target.turns[0]).toMatchObject({
                  prompt: stripPrompt ? '[prompt stripped]' : promptMedia,
                  input: inputMedia,
                  cost: 0.125,
                  tokenUsage: { total: 2 },
                });
              }
              if (name === 'owned nested checkpoint') {
                const nested = target.metadata.completedTargetResponses[0];
                expect(nested.prompt).toBe(stripPrompt ? '[prompt stripped]' : promptMedia);
                expect(nested.response).toMatchObject({
                  prompt: stripPrompt ? '[prompt stripped]' : promptMedia,
                  materializedVars: { image: inputMedia },
                  cost: 0.125,
                  tokenUsage: { total: 2 },
                });
              }
            }
          }
        }
        expect(input).toEqual(original);
      }
    });

    it('keeps media-child context out of the ordinary parent and siblings', async () => {
      const ordinaryMetadata = { data: bytes.toString('base64'), note: 'ordinary note' };
      const response = {
        metadata: { ...outputRef, data: bytes.toString('base64') },
        error: 'ordinary parent diagnostic',
        turns: [{ metadata: ordinaryMetadata, error: 'ordinary turn diagnostic' }],
      };
      const metadata = { interruptedStrategy: true, completedTargetResponses: [{ response }] };
      const input = legacyResult({ metadata }, metadata);
      const original = structuredClone(input);
      const row = await EvalResult.createFromEvaluateResult(randomUUID(), input, {
        persist: false,
      });
      const flags = { ...getStripFlags(), shouldStripResponseOutput: true };
      const projected =
        boundary === 'model'
          ? row.toEvaluateResult(flags)
          : sanitizeResultForJsonlArtifact(input, flags);
      const target = projected.metadata!.completedTargetResponses[0].response;
      expect(target.metadata).toBe('[output stripped]');
      expect(target.error).toBe('ordinary parent diagnostic');
      expect(target.turns[0]).toMatchObject({
        metadata: ordinaryMetadata,
        error: 'ordinary turn diagnostic',
      });
      expect(input).toEqual(original);
    });
  });
});
