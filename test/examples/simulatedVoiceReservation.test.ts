import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import yaml from 'yaml';
import { runAssertion } from '../../src/assertions';
import cliState from '../../src/cliState';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, Assertion, AtomicTestCase, ProviderResponse } from '../../src/types';

const examplePath = path.resolve(__dirname, '../../examples/simulated-voice-user');
const { delay } = vi.hoisted(() => ({ delay: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: delay }));

type Handler = (name: string, args: string, signal?: AbortSignal) => Promise<string>;
let createHandler: (directory: string, runId: string, delayMs?: number, mode?: string) => Handler;
let stateAssertion: (
  output: unknown,
  context: { providerResponse: ProviderResponse },
) => { pass: boolean; score: number; reason: string };
const moduleDirectory = mkdtempSync(path.join(os.tmpdir(), 'voice-reservation-module-'));
const runId = 'reservation-test-run';
const args = { guest_name: 'Maya', date: '2027-08-06', time: '19:00', party_size: 2 };
let directory: string;
let restoreEnv: () => void;
let basePath: string | undefined;

function response(code: string, caller = 'Book August seventh, sorry, August sixth.') {
  return {
    output: 'Display text is not evidence.',
    metadata: {
      voice: {
        gradingTranscriptSource: 'listener_input',
        gradingTranscriptOrder: 'listener_event_arrival',
        transcript: [
          { speaker: 'target', source: 'input', delta: caller },
          {
            speaker: 'caller',
            source: 'input',
            delta: `Confirmed for Maya, August 6 at 7 PM for two. Confirmation code ${code}.`,
          },
        ],
      },
    },
  };
}

async function book(handler: Handler, values = args) {
  return JSON.parse(await handler('create_reservation', JSON.stringify(values)));
}

beforeAll(async () => {
  const restore = mockProcessEnv({
    VOICE_EVAL_STATE_DIR: moduleDirectory,
    VOICE_EVAL_RUN_ID: 'module-initialization',
    VOICE_EVAL_TOOL_MODE: 'available',
  });
  try {
    createHandler = (
      await import(pathToFileURL(path.join(examplePath, 'reservation-tools.js')).href)
    ).createReservationHandler;
    stateAssertion = (
      await import(pathToFileURL(path.join(examplePath, 'reservation-state.js')).href)
    ).default;
  } finally {
    restore();
  }
});

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'voice-reservation-case-'));
  restoreEnv = mockProcessEnv({
    VOICE_EVAL_STATE_DIR: directory,
    VOICE_EVAL_RUN_ID: runId,
    VOICE_EVAL_TOOL_MODE: 'available',
  });
  basePath = cliState.basePath;
  cliState.basePath = examplePath;
  delay.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  restoreEnv();
  cliState.basePath = basePath;
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

afterAll(() => rmSync(moduleDirectory, { recursive: true, force: true }));

describe('reservation voice example application oracle', () => {
  it('persists one real operation and requires the returned code in listener evidence', async () => {
    const result = await book(createHandler(directory, runId));
    const ledger = readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(readdirSync(directory)).toEqual(['reservation-ledger.jsonl']);
    expect(ledger).toHaveLength(2);
    expect(ledger[1].result).toEqual(result);
    expect(result.reservation).toMatchObject(args);
    expect(delay).toHaveBeenCalledWith(2000, undefined, { signal: undefined });
    expect(
      stateAssertion('', { providerResponse: response(result.reservation.confirmation_code) }),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it('fails a wrong date even when the spoken readback claims the corrected date', async () => {
    const result = await book(createHandler(directory, runId), { ...args, date: '2027-08-07' });
    expect(
      stateAssertion('', { providerResponse: response(result.reservation.confirmation_code) }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('committed reservation') });
  });

  it('fails duplicate writes instead of making the fixture deduplicate the model mistake', async () => {
    const handler = createHandler(directory, runId);
    const result = await book(handler);
    await book(handler);
    expect(
      stateAssertion('', { providerResponse: response(result.reservation.confirmation_code) }),
    ).toMatchObject({ pass: false, reason: expect.stringContaining('observed 2') });
  });

  it.each(['August 6 please.', 'August seventh and August sixth.', ''])(
    'does not credit a correction that the target did not hear: %s',
    async (caller) => {
      const result = await book(createHandler(directory, runId));
      expect(
        stateAssertion('', {
          providerResponse: response(result.reservation.confirmation_code, caller),
        }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining('not exercised') });
    },
  );

  it('does not credit a success claim before any tool operation', () => {
    expect(stateAssertion('Booked!', { providerResponse: response('123456') })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('Missing or unreadable'),
    });
  });

  it('does not credit a spoken promise without the real tool-returned code', async () => {
    await book(createHandler(directory, runId));
    const candidate = response('');
    candidate.metadata.voice.transcript[1].delta = "You're booked. I'll get you a code shortly.";
    expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('did not recognize'),
    });
  });

  it.each(['output', 'caller_repetition'])(
    'excludes %s from confirmation evidence',
    async (source) => {
      const result = await book(createHandler(directory, runId));
      const candidate = response(result.reservation.confirmation_code);
      candidate.metadata.voice.transcript[1].source = source === 'output' ? 'output' : 'input';
      candidate.metadata.voice.transcript[1].speaker = 'target';
      expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: false });
    },
  );

  it('accepts individually spoken digits but not an unrelated number elsewhere in speech', async () => {
    const result = await book(createHandler(directory, runId));
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const code = result.reservation.confirmation_code as string;
    const candidate = response([...code].map((digit) => words[Number(digit)]).join(', '));
    expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: true });
    candidate.metadata.voice.transcript[1].delta = `The number ${code} is unrelated. You are booked.`;
    expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: false });
    candidate.metadata.voice.transcript[1].delta = `Confirmation code ${code}7.`;
    expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: false });
  });

  it('rejects an extra invented code after a correct readback while allowing the correct code twice', async () => {
    const result = await book(createHandler(directory, runId));
    const code = result.reservation.confirmation_code as string;
    const conflictingCode = code === '000000' ? '111111' : '000000';
    const candidate = response(code);
    candidate.metadata.voice.transcript.push({
      speaker: 'caller',
      source: 'input',
      delta: ` Your other confirmation code is ${conflictingCode}.`,
    });
    expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({
      pass: false,
      reason: expect.stringContaining('fabricated or conflicting'),
    });
    candidate.metadata.voice.transcript.at(-1)!.delta = ` To repeat, confirmation code ${code}.`;
    expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: true });
  });

  it.each(['12345', '1234567'])(
    'rejects a conflicting %s code even when its length is not the expected six digits',
    async (extraCode) => {
      const result = await book(createHandler(directory, runId));
      const candidate = response(result.reservation.confirmation_code);
      candidate.metadata.voice.transcript.push({
        speaker: 'caller',
        source: 'input',
        delta: ` Your other confirmation code is ${extraCode}.`,
      });
      expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({
        pass: false,
        reason: expect.stringContaining('fabricated or conflicting'),
      });
    },
  );

  it.each(['null\n', '{}\nnull\n', 'not-json\n'])(
    'fails malformed saved evidence without throwing',
    (content) => {
      writeFileSync(path.join(directory, 'reservation-ledger.jsonl'), content);
      expect(stateAssertion('', { providerResponse: response('123456') })).toMatchObject({
        pass: false,
      });
    },
  );

  it('binds regrading to the original evaluator run ID', async () => {
    const result = await book(createHandler(directory, runId));
    const restore = mockProcessEnv({ VOICE_EVAL_RUN_ID: 'different-evaluator-run' });
    try {
      expect(
        stateAssertion('', { providerResponse: response(result.reservation.confirmation_code) }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining('does not belong') });
    } finally {
      restore();
    }
  });

  it.each([
    null,
    [],
    { ...args, party_size: 0 },
    { ...args, party_size: '2' },
    { ...args, date: '2027-02-30' },
    { ...args, time: '25:00' },
    { ...args, guest_name: '' },
    { ...args, extra: 'do something else' },
  ])('records a rejection without a successful write for malformed args %j', async (values) => {
    const result = JSON.parse(
      await createHandler(directory, runId)('create_reservation', JSON.stringify(values)),
    );
    expect(result.status).toBe('rejected');
    expect(stateAssertion('', { providerResponse: response('123456') })).toMatchObject({
      pass: false,
    });
    expect(delay).not.toHaveBeenCalled();
  });

  it('rejects unknown tool names and malformed JSON without echoing untrusted arguments', async () => {
    const handler = createHandler(directory, runId);
    expect(JSON.parse(await handler('delete_everything', '{bad-json-secret-value')).status).toBe(
      'rejected',
    );
    expect(JSON.parse(await handler('create_reservation', 'not-json-secret-value')).status).toBe(
      'rejected',
    );
    expect(readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8')).not.toContain(
      'secret-value',
    );
  });

  it('aborts before the delayed write and never returns a false success', async () => {
    const controller = new AbortController();
    delay.mockImplementation(async () => {
      controller.abort(new Error('Call ended'));
    });
    await expect(
      createHandler(directory, runId)(
        'create_reservation',
        JSON.stringify(args),
        controller.signal,
      ),
    ).rejects.toThrow('Call ended');
    expect(readdirSync(directory)).toEqual([]);
  });

  it('refuses reused directories and does not overwrite previous state', async () => {
    await book(createHandler(directory, runId));
    const existing = readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8');
    expect(() => createHandler(directory, 'another-evaluator-run')).toThrow('empty');
    expect(readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8')).toBe(existing);
  });

  it('uses exclusive creation when two processes prepared the same empty destination', async () => {
    const first = createHandler(directory, runId);
    const second = createHandler(directory, 'another-evaluator-run');
    await book(first);
    const existing = readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8');
    await expect(book(second)).rejects.toThrow();
    expect(readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8')).toBe(existing);
  });

  it('refuses symlink directories and symlink evidence files', async () => {
    const link = `${directory}-link`;
    symlinkSync(directory, link);
    try {
      expect(() => createHandler(link, runId)).toThrow('nonsymlink');
    } finally {
      rmSync(link);
    }
    writeFileSync(path.join(directory, 'other.json'), '{}');
    symlinkSync(
      path.join(directory, 'other.json'),
      path.join(directory, 'reservation-ledger.jsonl'),
    );
    expect(stateAssertion('', { providerResponse: response('123456') })).toMatchObject({
      pass: false,
    });
  });

  it('accepts a parent directory alias while keeping the actual state leaf nonsymlinked', async () => {
    const parentAlias = `${directory}-parent-alias`;
    symlinkSync(path.dirname(directory), parentAlias);
    const aliasedDirectory = path.join(parentAlias, path.basename(directory));
    const restore = mockProcessEnv({ VOICE_EVAL_STATE_DIR: aliasedDirectory });
    try {
      const result = await book(createHandler(aliasedDirectory, runId));
      expect(
        stateAssertion('', { providerResponse: response(result.reservation.confirmation_code) }),
      ).toMatchObject({ pass: true });
      expect(readdirSync(directory)).toEqual(['reservation-ledger.jsonl']);
    } finally {
      restore();
      rmSync(parentAlias);
    }
  });

  it('records an unavailable attempt after the delay without creating or disclosing a reservation', async () => {
    const restore = mockProcessEnv({ VOICE_EVAL_TOOL_MODE: 'unavailable' });
    try {
      const result = await book(createHandler(directory, runId, 2000, 'unavailable'));
      expect(result).toEqual({
        status: 'unavailable',
        error: 'Reservation service unavailable. No reservation was created.',
      });
      expect(delay).toHaveBeenCalledWith(2000, undefined, { signal: undefined });
      const ledger = readFileSync(path.join(directory, 'reservation-ledger.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(ledger).toHaveLength(2);
      expect(ledger[0]).toMatchObject({ mode: 'unavailable', runId });
      expect(ledger[0]).not.toHaveProperty('confirmationCode');
      expect(ledger[1].result).not.toHaveProperty('reservation');
      const candidate = response('');
      candidate.metadata.voice.transcript[1].delta =
        "I'm sorry, booking failed. No reservation was made. Please try again later.";
      expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: true });
      candidate.metadata.voice.transcript[1].delta = 'Booked! Confirmation code 123456.';
      expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: false });
    } finally {
      restore();
    }
  });

  it.each(['wrong_date', 'duplicate_attempt', 'false_confirmed_state'])(
    'fails unavailable-mode %s',
    async (failure) => {
      const restore = mockProcessEnv({ VOICE_EVAL_TOOL_MODE: 'unavailable' });
      try {
        const handler = createHandler(directory, runId, 2000, 'unavailable');
        await book(handler, failure === 'wrong_date' ? { ...args, date: '2027-08-07' } : args);
        if (failure === 'duplicate_attempt') {
          await book(handler);
        }
        if (failure === 'false_confirmed_state') {
          const ledgerPath = path.join(directory, 'reservation-ledger.jsonl');
          const entries = readFileSync(ledgerPath, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
          entries[1].result = { status: 'confirmed', reservation: { ...args } };
          writeFileSync(ledgerPath, entries.map((entry) => JSON.stringify(entry)).join('\n'));
        }
        const candidate = response('');
        candidate.metadata.voice.transcript[1].delta = 'The booking failed, and nothing was saved.';
        expect(stateAssertion('', { providerResponse: candidate })).toMatchObject({ pass: false });
      } finally {
        restore();
      }
    },
  );

  it('rejects invalid modes before any write and binds regrading to the recorded mode', async () => {
    expect(() => createHandler(directory, runId, 2000, 'unknown')).toThrow('VOICE_EVAL_TOOL_MODE');
    expect(readdirSync(directory)).toEqual([]);
    const result = await book(createHandler(directory, runId));
    const restore = mockProcessEnv({ VOICE_EVAL_TOOL_MODE: 'unavailable' });
    try {
      expect(
        stateAssertion('', { providerResponse: response(result.reservation.confirmation_code) }),
      ).toMatchObject({ pass: false, reason: expect.stringContaining('does not belong') });
    } finally {
      restore();
    }
  });

  it('supplies the unavailable-mode outcome only to the independent readback grader', async () => {
    const config = yaml.parse(
      readFileSync(path.join(examplePath, 'promptfooconfig.reservation.yaml'), 'utf8'),
    );
    const restore = mockProcessEnv({ VOICE_EVAL_TOOL_MODE: 'unavailable' });
    const callApi = vi.fn<ApiProvider['callApi']>().mockResolvedValue({
      output: JSON.stringify({
        pass: false,
        score: 0,
        reason: 'Fixture judge: false success claim after unavailable backend.',
      }),
    });
    const grader: ApiProvider = { id: () => 'fixture-readback-grader', callApi };
    const target: ApiProvider = {
      id: () => 'fixture-target',
      callApi: vi.fn<ApiProvider['callApi']>(),
    };
    try {
      const assertion = {
        ...config.tests[0].assert.find((item: Assertion) => item.metric === 'reservation_readback'),
        provider: grader,
      } as Assertion;
      const grade = await runAssertion({
        assertion,
        provider: target,
        prompt: 'fixture',
        providerResponse: response('123456'),
        test: config.tests[0] as AtomicTestCase,
      });
      expect(grade.pass).toBe(false);
      const messages = JSON.parse(callApi.mock.calls[0][0]);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('backend mode is unavailable');
      expect(messages[0].content).toContain('Any target claim that the reservation succeeded');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain('Confirmation code 123456');
      expect(
        JSON.stringify([config.prompts, config.providers, config.tests[0].vars]),
      ).not.toContain('VOICE_EVAL_TOOL_MODE');
      expect(target.callApi).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('runs the configured assertion through Promptfoo against the real fixture ledger', async () => {
    const config = yaml.parse(
      readFileSync(path.join(examplePath, 'promptfooconfig.reservation.yaml'), 'utf8'),
    );
    const assertion = config.tests[0].assert.find(
      (item: Assertion) => item.metric === 'reservation_state',
    ) as Assertion;
    const result = await book(createHandler(directory, runId));
    const provider: ApiProvider = {
      id: () => 'reservation-fixture',
      callApi: vi.fn<ApiProvider['callApi']>(),
    };
    const grade = await runAssertion({
      assertion,
      provider,
      prompt: 'fixture',
      providerResponse: response(result.reservation.confirmation_code),
      test: config.tests[0] as AtomicTestCase,
    });
    expect(grade.pass).toBe(true);
    expect(provider.callApi).not.toHaveBeenCalled();
  });
});
