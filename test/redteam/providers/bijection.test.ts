import { describe, expect, it } from 'vitest';
import BijectionProvider, {
  decodeMarkedBijectionResponse,
} from '../../../src/redteam/providers/bijection';
import {
  BIJECTION_RESPONSE_END,
  BIJECTION_RESPONSE_START,
  encodeBijection,
  generateBijectionMapping,
} from '../../../src/redteam/strategies/bijection';
import { createMockProvider } from '../../factories/provider';

import type { ApiProvider, CallApiContextParams } from '../../../src/types/index';

const mapping = generateBijectionMapping(
  { type: 'letter', dispersion: 20, encodingLength: 2 },
  'provider-test',
);
const config = {
  mapping,
  responseStart: BIJECTION_RESPONSE_START,
  responseEnd: BIJECTION_RESPONSE_END,
};

function createContext(originalProvider: ApiProvider): CallApiContextParams {
  return {
    originalProvider,
    prompt: { raw: '{{prompt}}', label: 'test' },
    vars: { prompt: 'encoded request' },
  };
}

describe('BijectionProvider', () => {
  it('decodes only the response enclosed by exact markers', async () => {
    const encoded = encodeBijection('unsafe response', mapping);
    const target = createMockProvider({
      response: {
        output: ` \n${BIJECTION_RESPONSE_START}\n${encoded}\n${BIJECTION_RESPONSE_END}\n `,
        metadata: { target: true },
      },
    });
    const provider = new BijectionProvider(config);

    const result = await provider.callApi('rendered attack', createContext(target));

    expect(result.output).toBe('unsafe response');
    expect(result.prompt).toBe('rendered attack');
    expect(result.metadata).toMatchObject({
      target: true,
      bijectionDecoded: true,
      redteamFinalPrompt: 'rendered attack',
    });
    expect(target.callApi).toHaveBeenCalledWith(
      'rendered attack',
      expect.objectContaining({ originalProvider: target }),
      undefined,
    );
  });

  it('leaves an unmarked plaintext refusal unchanged', async () => {
    const target = createMockProvider({ response: { output: 'I cannot help with that.' } });
    const provider = new BijectionProvider(config);

    const result = await provider.callApi('rendered attack', createContext(target));

    expect(result.output).toBe('I cannot help with that.');
    expect(result.metadata?.bijectionDecoded).toBe(false);
  });

  it('leaves malformed marked output unchanged', () => {
    const output = `${BIJECTION_RESPONSE_START}missing end marker`;

    expect(decodeMarkedBijectionResponse(output, config)).toEqual({
      decoded: false,
      output,
    });
  });

  it('does not decode markers embedded in echoed or explanatory prose', () => {
    const encoded = encodeBijection('unsafe response', mapping);
    const output = `The requested envelope is ${BIJECTION_RESPONSE_START}${encoded}${BIJECTION_RESPONSE_END}.`;

    expect(decodeMarkedBijectionResponse(output, config)).toEqual({
      decoded: false,
      output,
    });
  });

  it('preserves target errors and non-string output', async () => {
    const errorResponse = { error: 'target failed', output: 'ignored' };
    const errorTarget = createMockProvider({ response: errorResponse });
    const provider = new BijectionProvider(config);

    expect(await provider.callApi('prompt', createContext(errorTarget))).toBe(errorResponse);

    const objectResponse = { output: [{ type: 'text', text: 'structured' }] };
    const objectTarget = createMockProvider({ response: objectResponse });
    expect(await provider.callApi('prompt', createContext(objectTarget))).toBe(objectResponse);
  });

  it('forwards call options to the target', async () => {
    const target = createMockProvider({ response: { output: 'plain response' } });
    const provider = new BijectionProvider(config);
    const abortController = new AbortController();

    await provider.callApi('prompt', createContext(target), {
      abortSignal: abortController.signal,
    });

    expect(target.callApi).toHaveBeenCalledWith(
      'prompt',
      expect.any(Object),
      expect.objectContaining({ abortSignal: abortController.signal }),
    );
  });

  it('rejects malformed configuration', () => {
    expect(() => new BijectionProvider()).toThrow(/mapping/);
    expect(
      () =>
        new BijectionProvider({
          mapping: { a: 'b' },
          responseStart: BIJECTION_RESPONSE_START,
          responseEnd: BIJECTION_RESPONSE_END,
        }),
    ).toThrow(/mapping/);
    expect(
      () =>
        new BijectionProvider({
          mapping,
          responseStart: BIJECTION_RESPONSE_START,
          responseEnd: BIJECTION_RESPONSE_START,
        }),
    ).toThrow(/markers/);
  });
});
