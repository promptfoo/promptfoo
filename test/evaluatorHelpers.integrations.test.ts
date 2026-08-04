import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { renderPrompt } from '../src/evaluatorHelpers';
import * as heliconeIntegration from '../src/integrations/helicone';
import * as portkeyIntegration from '../src/integrations/portkey';

import type { Prompt } from '../src/types/index';

vi.mock('../src/integrations/helicone');
vi.mock('../src/integrations/portkey');

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('renderPrompt - external prompt integrations', () => {
  let mockGetHeliconePrompt: MockedFunction<typeof heliconeIntegration.getPrompt>;
  let mockGetPortkeyPrompt: MockedFunction<typeof portkeyIntegration.getPrompt>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHeliconePrompt = vi.mocked(heliconeIntegration.getPrompt);
    mockGetPortkeyPrompt = vi.mocked(portkeyIntegration.getPrompt);
  });

  it('passes register-derived values to Portkey as data', async () => {
    mockGetPortkeyPrompt.mockResolvedValue({
      model: 'test-model',
      n: 1,
      top_p: 1,
      max_tokens: 10,
      temperature: 0,
      presence_penalty: 0,
      frequency_penalty: 0,
      messages: [{ role: 'user', content: 'Compiled prompt' }],
    });
    const vars = {
      stored: '{{7*7}}',
      wrapper: 'Stored: {{stored}}',
    };

    const result = await renderPrompt(
      toPrompt('portkey://test-prompt'),
      vars,
      {},
      undefined,
      undefined,
      ['stored'],
    );

    expect(mockGetPortkeyPrompt).toHaveBeenCalledWith('test-prompt', {
      stored: '{{7*7}}',
      wrapper: 'Stored: {{7*7}}',
    });
    expect(vars.wrapper).toBe('Stored: {{7*7}}');
    expect(result).toBe('[{"role":"user","content":"Compiled prompt"}]');
  });

  it('passes register-derived values and versions to Helicone as data', async () => {
    mockGetHeliconePrompt.mockResolvedValue('Compiled prompt');
    const vars = {
      stored: '{{7*7}}',
      wrapper: 'Stored: {{stored}}',
    };

    const result = await renderPrompt(
      toPrompt('helicone://test-prompt:2.3'),
      vars,
      {},
      undefined,
      undefined,
      ['stored'],
    );

    expect(mockGetHeliconePrompt).toHaveBeenCalledWith(
      'test-prompt',
      {
        stored: '{{7*7}}',
        wrapper: 'Stored: {{7*7}}',
      },
      2,
      3,
    );
    expect(vars.wrapper).toBe('Stored: {{7*7}}');
    expect(result).toBe('Compiled prompt');
  });
});
