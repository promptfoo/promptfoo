// Tools and template variable tests: tool_choice handling, transformToolsFormat integration.
import './setup';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { HttpProvider } from '../../../src/providers/http';

describe('tools and tool_choice template variables', () => {
  const mockUrl = 'http://example.com/api';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should make tools available as a template variable', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: { type: 'object', properties: { location: { type: 'string' } } },
        },
      },
    ];

    await provider.callApi('test prompt', {
      vars: {},
      prompt: {
        raw: 'test prompt',
        label: 'test',
        config: { tools },
      },
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
          tools,
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should make tool_choice available as a template variable', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tool_choice: '{{ tool_choice }}',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const tool_choice = { type: 'function', function: { name: 'get_weather' } };

    await provider.callApi('test prompt', {
      vars: {},
      prompt: {
        raw: 'test prompt',
        label: 'test',
        config: { tool_choice },
      },
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
          tool_choice,
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should handle both tools and tool_choice together', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
          tool_choice: '{{ tool_choice }}',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const tools = [
      {
        type: 'function',
        function: {
          name: 'report_scores',
          parameters: { type: 'object', properties: { score: { type: 'integer' } } },
        },
      },
    ];
    const tool_choice = { type: 'function', function: { name: 'report_scores' } };

    await provider.callApi('test prompt', {
      vars: {},
      prompt: {
        raw: 'test prompt',
        label: 'test',
        config: { tools, tool_choice },
      },
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
          tools,
          tool_choice,
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should handle undefined tools gracefully', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    // No tools or tool_choice in config
    await provider.callApi('test prompt', {
      vars: {},
      prompt: {
        raw: 'test prompt',
        label: 'test',
      },
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });
});

describe('transformToolsFormat integration', () => {
  const mockUrl = 'http://example.com/api';

  it('should pass through OpenAI tools unchanged when format is openai', async () => {
    const openaiTools = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      },
    ];

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
        },
        tools: openaiTools,
        transformToolsFormat: 'openai',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
          tools: openaiTools,
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should transform OpenAI tools to anthropic format', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
        },
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'Search the web',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
              },
            },
          },
        ],
        transformToolsFormat: 'anthropic',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
              },
            },
          ],
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should transform tool_choice to openai format', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
          tool_choice: '{{ tool_choice }}',
        },
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'get_weather' } },
        transformToolsFormat: 'openai',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: 'test prompt',
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather',
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'get_weather' } },
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should transform tool_choice mode required to anthropic format', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
          tool_choice: '{{ tool_choice }}',
        },
        tools: [{ type: 'function', function: { name: 'my_tool' } }],
        tool_choice: 'required',
        transformToolsFormat: 'anthropic',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        body: JSON.stringify({
          messages: 'test prompt',
          tools: [
            {
              name: 'my_tool',
              input_schema: { type: 'object', properties: {} },
            },
          ],
          tool_choice: { type: 'any' },
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should pass through non-OpenAI tools unchanged', async () => {
    const anthropicTools = [
      {
        name: 'existing_tool',
        description: 'Already in Anthropic format',
        input_schema: { type: 'object' },
      },
    ];

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
        },
        tools: anthropicTools,
        transformToolsFormat: 'anthropic', // Won't transform - not in OpenAI format
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        body: JSON.stringify({
          messages: 'test prompt',
          tools: anthropicTools, // Unchanged
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should use tools from prompt.config over provider config', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
        },
        tools: [{ type: 'function', function: { name: 'provider_tool' } }],
        transformToolsFormat: 'anthropic',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    // prompt.config.tools should override provider config
    await provider.callApi('test prompt', {
      vars: {},
      prompt: {
        raw: 'test prompt',
        label: 'test',
        config: {
          tools: [
            { type: 'function', function: { name: 'prompt_tool', description: 'From prompt' } },
          ],
        },
      },
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        body: JSON.stringify({
          messages: 'test prompt',
          tools: [
            {
              name: 'prompt_tool',
              description: 'From prompt',
              input_schema: { type: 'object', properties: {} },
            },
          ],
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should warn when tool_choice is set but tools is empty', async () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn');

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tool_choice: '{{ tool_choice }}',
        },
        tool_choice: 'required',
        transformToolsFormat: 'openai',
        // No tools configured
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(loggerWarnSpy).toHaveBeenCalled();
    expect(loggerWarnSpy.mock.calls[0][0]).toEqual(
      expect.stringContaining('tool_choice is set but tools is empty'),
    );

    loggerWarnSpy.mockRestore();
  });

  it('should warn when tool_choice is set but tools array is empty', async () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn');

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
          tool_choice: '{{ tool_choice }}',
        },
        tools: [], // Empty array
        tool_choice: 'auto',
        transformToolsFormat: 'openai',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(loggerWarnSpy).toHaveBeenCalled();
    expect(loggerWarnSpy.mock.calls[0][0]).toEqual(
      expect.stringContaining('tool_choice is set but tools is empty'),
    );

    loggerWarnSpy.mockRestore();
  });

  it('should not warn when both tools and tool_choice are set', async () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn');

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: '{{ prompt }}',
          tools: '{{ tools }}',
          tool_choice: '{{ tool_choice }}',
        },
        tools: [{ normalized: true, name: 'my_tool' }],
        tool_choice: 'auto',
        transformToolsFormat: 'openai',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(
      loggerWarnSpy.mock.calls.some(([message]) =>
        String(message).includes('tool_choice is set but tools is empty'),
      ),
    ).toBe(false);

    loggerWarnSpy.mockRestore();
  });
});
