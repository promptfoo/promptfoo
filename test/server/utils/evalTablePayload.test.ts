import { describe, expect, it } from 'vitest';
import { FILE_METADATA_KEY } from '../../../src/providers/constants';
import {
  trimEvalConfigForTableApi,
  trimEvalTableForApi,
} from '../../../src/server/utils/evalTablePayload';
import { createCompletedPrompt, createEvaluateTable } from '../../factories/eval';
import { createProviderResponse } from '../../factories/provider';
import { createAtomicTestCase } from '../../factories/testSuite';

describe('trimEvalTableForApi', () => {
  const huge = 'x'.repeat(64);

  it('moves heavy prompt, test, metadata, response, and media data out of table cells', () => {
    const table = createEvaluateTable({
      head: {
        prompts: [
          createCompletedPrompt(huge, {
            label: 'huge prompt',
            provider: 'test-provider',
          }),
        ],
        vars: ['image', 'plain'],
      },
      body: [
        {
          testIdx: 0,
          vars: [huge, 'small'],
          test: createAtomicTestCase({
            vars: { image: huge, plain: 'small' },
            assert: [{ type: 'contains', value: huge }],
            providerOutput: huge,
            options: { transform: huge },
            metadata: { testCaseId: 'tc-1', originalText: huge },
          }),
          outputs: [
            {
              ...createEvaluateTable().body[0].outputs[0],
              evalId: 'eval-1',
              id: 'result-1',
              text: huge,
              prompt: huge,
              response: createProviderResponse({
                output: huge,
                raw: { body: huge },
                error: huge,
                prompt: huge,
                tokenUsage: { total: 3, prompt: 2, completion: 1 },
                cached: true,
                audio: { data: huge, format: 'wav', transcript: 'transcript' },
                video: { url: 'storageRef:video.mp4', thumbnail: huge },
                images: [{ data: huge, mimeType: 'image/png' }],
              }),
              metadata: {
                comment: 'comment',
                inputVars: { image: huge },
                messages: [{ role: 'user', content: huge }],
                redteamHistory: [{ prompt: huge, output: huge }],
                transformDisplayVars: { transformed: huge },
                [FILE_METADATA_KEY]: {
                  image: { path: 'file://image.png', type: 'image', format: 'png' },
                },
              },
              testCase: createAtomicTestCase({
                vars: { image: huge },
                assert: [{ type: 'contains', value: huge }],
                metadata: { testCaseId: 'tc-1' },
              }),
              audio: { data: huge, format: 'wav' },
              video: { url: 'storageRef:video.mp4', thumbnail: huge },
              images: [{ data: huge, mimeType: 'image/png' }],
            },
          ],
        },
      ],
    });

    const trimmed = trimEvalTableForApi(table, { maxStringLength: 32 });
    const cell = trimmed.body[0].outputs[0];

    expect(trimmed.head.prompts[0].raw).toBe(`[content omitted: ${huge.length} characters]`);
    expect(trimmed.body[0].vars).toEqual([`[content omitted: ${huge.length} characters]`, 'small']);
    expect(trimmed.body[0].test.vars).toBeUndefined();
    expect(trimmed.body[0].test.assert).toBeUndefined();
    expect(trimmed.body[0].test.providerOutput).toBeUndefined();
    expect(trimmed.body[0].test.options).toBeUndefined();
    expect(trimmed.body[0].test.metadata?.testCaseId).toBe('tc-1');
    expect(trimmed.body[0].test.metadata?.originalText).toBe(
      `[content omitted: ${huge.length} characters]`,
    );

    expect(cell.evalId).toBe('eval-1');
    expect(cell.prompt).toBe('');
    expect(cell.text).toBe(`[content omitted: ${huge.length} characters]`);
    expect(cell.detail).toEqual({
      available: true,
      omittedFields: ['prompt', 'response', 'testCase', 'metadata', 'media'],
    });
    expect(cell.testCase.vars).toBeUndefined();
    expect(cell.testCase.assert).toBeUndefined();
    expect(cell.testCase.metadata?.testCaseId).toBe('tc-1');
    expect(cell.metadata?.comment).toBe('comment');
    expect(cell.metadata?.inputVars).toBeUndefined();
    expect(cell.metadata?.messages).toBeUndefined();
    expect(cell.metadata?.redteamHistory).toBeUndefined();
    expect(cell.metadata?.transformDisplayVars).toEqual({
      transformed: `[content omitted: ${huge.length} characters]`,
    });
    expect(cell.metadata?.[FILE_METADATA_KEY]).toEqual({
      image: { path: 'file://image.png', type: 'image', format: 'png' },
    });
    expect(cell.response?.output).toBeUndefined();
    expect(cell.response?.raw).toBeUndefined();
    expect(cell.response?.error).toBeUndefined();
    expect(cell.response?.cached).toBe(true);
    expect(cell.response?.tokenUsage).toEqual({ total: 3, prompt: 2, completion: 1 });
    expect(cell.response?.prompt).toBeUndefined();
    expect(cell.response?.audio?.data).toBeUndefined();
    expect(cell.response?.audio?.transcript).toBe('transcript');
    expect(cell.response?.video?.url).toBe('storageRef:video.mp4');
    expect(cell.response?.video?.thumbnail).toBe(`[content omitted: ${huge.length} characters]`);
    expect(cell.response?.images?.[0].data).toBeUndefined();
    expect(cell.audio?.data).toBeUndefined();
    expect(cell.video?.url).toBe('storageRef:video.mp4');
    expect(cell.images?.[0].data).toBeUndefined();
  });

  it('preserves small inline media and external media references in the table payload', () => {
    const table = createEvaluateTable({
      body: [
        {
          ...createEvaluateTable().body[0],
          outputs: [
            {
              ...createEvaluateTable().body[0].outputs[0],
              id: 'result-1',
              prompt: 'rendered prompt',
              audio: { data: 'short-audio', format: 'wav' },
              video: { url: 'https://example.test/video.mp4', thumbnail: 'short-thumb' },
              images: [
                { data: 'short-image', mimeType: 'image/png' },
                { data: 'blobref:image-1', mimeType: 'image/png' },
              ],
            },
          ],
        },
      ],
    });

    const trimmed = trimEvalTableForApi(table, { maxStringLength: 32 });
    const cell = trimmed.body[0].outputs[0];

    expect(cell.prompt).toBe('');
    expect(cell.detail?.omittedFields).toEqual(['prompt', 'response', 'testCase', 'metadata']);
    expect(cell.audio?.data).toBe('short-audio');
    expect(cell.video?.url).toBe('https://example.test/video.mp4');
    expect(cell.video?.thumbnail).toBe('short-thumb');
    expect(cell.images?.map((image) => image.data)).toEqual(['short-image', 'blobref:image-1']);
  });

  it('moves generated tests and default tests out of the table config payload', () => {
    const trimmed = trimEvalConfigForTableApi(
      {
        description: 'large eval',
        prompts: [huge],
        tests: [{ vars: { image: huge } }],
        defaultTest: { vars: { image: huge } },
      },
      { maxStringLength: 32 },
    );

    expect(trimmed.config.description).toBe('large eval');
    expect(trimmed.config.prompts).toEqual([`[content omitted: ${huge.length} characters]`]);
    expect(trimmed.config.tests).toBeUndefined();
    expect(trimmed.config.defaultTest).toBeUndefined();
    expect(trimmed.detail).toEqual({
      available: true,
      omittedFields: ['tests', 'defaultTest'],
    });
  });
});
