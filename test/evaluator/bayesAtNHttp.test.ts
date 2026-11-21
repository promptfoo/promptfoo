import './setup';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { HttpProvider } from '../../src/providers/http';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ProviderOptions, TestSuite } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cache')>();
  return { ...actual, fetchWithCache: vi.fn() };
});

const url = 'https://example.test/generate';
const createSuite = (config: ProviderOptions['config']): TestSuite => ({
  providers: [new HttpProvider(url, { config })],
  prompts: [toPrompt('Same prompt')],
  tests: [{ vars: { question: 'Fixed question' } }],
});

const respond = () =>
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: 'answer',
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    cached: false,
  });

describeEvaluator('Bayes@N HTTP inputs', () => {
  it('rejects changing JSON questions before generation while plain evaluation renders them', async () => {
    respond();
    const transformRequest = vi.fn((prompt: string) => prompt);
    const suite = createSuite({
      method: 'POST',
      body: { question: 'Question {{ __repeatIndex }}' },
      transformRequest,
    });
    try {
      await evaluate(suite, new Eval({}), { repeat: 2, cache: false });
      const questions = vi
        .mocked(fetchWithCache)
        .mock.calls.map(([, options]) => JSON.parse(String(options?.body)).question);
      expect(questions.sort()).toEqual(['Question 0', 'Question 1']);
      vi.mocked(fetchWithCache).mockClear();
      transformRequest.mockClear();

      await expect(
        evaluate(suite, new Eval({}), { bayesAtN: true, repeat: 2, cache: false }),
      ).rejects.toThrow('HTTP request templates that use per-repeat variables');
      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(transformRequest).not.toHaveBeenCalled();
    } finally {
      vi.mocked(fetchWithCache).mockReset();
    }
  });

  it.each([
    ['URL', { method: 'GET', url: `${url}/{{ __evalStepId }}` }],
    ['method', { method: '{{ "POST" if __repeatIndex else "GET" }}', body: 'Hi' }],
    ['header', { method: 'GET', headers: { 'x-route': '{{ __evalStepId }}' } }],
    ['query', { method: 'GET', queryParams: { question: '{{ __repeatIndex }}' } }],
    ['nested body', { method: 'POST', body: { batch: ['{{ __repeatIndex + 1 }}'] } }],
    [
      'encoded JSON body',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: String.raw`{"question": "Question {{ \u005f_repeatIndex }}"}`,
      },
    ],
    ['raw request', { request: 'GET /{{ __evalStepId }} HTTP/1.1\nHost: example.test\n\n' }],
    [
      'multipart field',
      { multipart: { parts: [{ kind: 'field', name: 'question', value: '{{ __repeatIndex }}' }] } },
    ],
    [
      'API key routing',
      {
        method: 'GET',
        auth: { type: 'api_key', placement: 'query', keyName: '{{ __evalStepId }}', value: 'key' },
      },
    ],
  ] as const)('rejects a per-repeat variable in the %s', async (_name, config) => {
    await expect(
      evaluate(createSuite(config), new Eval({}), { bayesAtN: true, repeat: 2, cache: false }),
    ).rejects.toThrow('HTTP request templates that use per-repeat variables');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects a request that loads a template which changes across repeats', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), 'node_modules/.bayes-http-template-'));
    const filename = path.join(dir, 'question.njk');
    fs.writeFileSync(filename, 'Question {{ __repeatIndex }}');
    respond();
    try {
      const suite = createSuite({
        method: 'POST',
        body: { question: `{%- include "${filename.replaceAll('\\', '/')}" %}` },
      });
      await evaluate(suite, new Eval({}), { repeat: 2, cache: false });
      const questions = vi
        .mocked(fetchWithCache)
        .mock.calls.map(([, options]) => JSON.parse(String(options?.body)).question);
      expect(questions.sort()).toEqual(['Question 0', 'Question 1']);
      vi.mocked(fetchWithCache).mockClear();

      await expect(
        evaluate(suite, new Eval({}), { bayesAtN: true, repeat: 2, cache: false }),
      ).rejects.toThrow('cannot verify HTTP request templates that load other templates');
      expect(fetchWithCache).not.toHaveBeenCalled();
    } finally {
      vi.mocked(fetchWithCache).mockReset();
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it.each([
    "{% extends 'base.njk' %}",
    "{% import 'macro.njk' as macros %}",
    "{% if question %}{% from 'macro.njk' import question with context %}{% endif %}",
  ])('rejects loading tags in structured request templates: %s', async (question) => {
    await expect(
      evaluate(createSuite({ method: 'POST', body: { question } }), new Eval({}), {
        bayesAtN: true,
        repeat: 2,
        cache: false,
      }),
    ).rejects.toThrow('cannot verify HTTP request templates that load other templates');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('checks the template in a resolved multipart filename', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-http-filename-'));
    const upload = path.join(dir, 'Question {{ __repeatIndex }}.txt');
    fs.writeFileSync(upload, 'fixed content');
    try {
      const suite = createSuite({
        multipart: {
          parts: [
            {
              name: 'file',
              kind: 'file',
              source: { type: 'path', path: pathToFileURL(upload).href },
            },
          ],
        },
      });
      await expect(
        evaluate(suite, new Eval({}), { bayesAtN: true, repeat: 2, cache: false }),
      ).rejects.toThrow('HTTP request templates that use per-repeat variables');
      expect(fetchWithCache).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('resolves multipart paths from the actual rendered prompt', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-http-prompt-'));
    const upload = path.join(dir, 'Question.txt');
    fs.writeFileSync(upload, 'fixed content');
    respond();
    try {
      const suite = createSuite({
        multipart: {
          parts: [{ name: 'file', kind: 'file', source: { type: 'path', path: '{{ prompt }}' } }],
        },
      });
      suite.prompts = [toPrompt('{{ upload }}')];
      suite.tests = [{ vars: { upload } }];
      const record = new Eval({});
      await evaluate(suite, record, { bayesAtN: true, repeat: 2, cache: false });
      expect(fetchWithCache).toHaveBeenCalledTimes(2);
      expect((await record.getRepeatStability())?.bayesAtN?.[0]).toMatchObject({
        questions: 1,
        trials: 2,
        mean: 0.75,
      });
    } finally {
      vi.mocked(fetchWithCache).mockReset();
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it('runs fixed HTTP templates with ordinary vars, same-evaluation metadata, and literal names', async () => {
    respond();
    const record = new Eval({});
    try {
      await evaluate(
        createSuite({
          method: 'POST',
          body: {
            question: '{{ question }}',
            run: '{{ __evalId }}',
            literal: '{{ "__repeatIndex" }}',
            literalTag: "{% raw %}{% include 'missing.njk' %}{% endraw %}",
          },
        }),
        record,
        { bayesAtN: true, repeat: 2, cache: false },
      );
      const bodies = vi
        .mocked(fetchWithCache)
        .mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
      expect(bodies).toEqual(
        Array.from({ length: 2 }, () => ({
          question: 'Fixed question',
          run: record.id,
          literal: '__repeatIndex',
          literalTag: "{% include 'missing.njk' %}",
        })),
      );
      expect((await record.getRepeatStability())?.bayesAtN?.[0]).toMatchObject({
        questions: 1,
        trials: 2,
        mean: 0.75,
      });
    } finally {
      vi.mocked(fetchWithCache).mockReset();
    }
  });
});
