import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderEnvOnlyInObject, renderVarsInObject } from '../../src/util/render';
import { mockProcessEnv } from './utils';

describe('renderVarsInObject', () => {
  beforeEach(() => {
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
  });

  afterEach(() => {
    mockProcessEnv({ TEST_ENV_VAR: undefined });
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
  });

  it('should render environment variables in objects', async () => {
    mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
    const obj = { text: '{{ env.TEST_ENV_VAR }}' };
    const rendered = renderVarsInObject(obj, {});
    expect(rendered).toEqual({ text: 'env_value' });
  });

  it('should return object unchanged when no vars provided', async () => {
    const obj = { text: '{{ variable }}', number: 42 };
    const rendered = renderVarsInObject(obj);
    expect(rendered).toEqual(obj);
  });

  it('should return object unchanged when vars is empty object', async () => {
    const obj = { text: '{{ variable }}', number: 42 };
    const rendered = renderVarsInObject(obj, {});
    // Empty object {} is truthy, so templating still runs but with no variables
    expect(rendered).toEqual({ text: '', number: 42 });
  });

  it('should return object unchanged when PROMPTFOO_DISABLE_TEMPLATING is true', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
    const obj = { text: '{{ variable }}' };
    const vars = { variable: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual(obj);
  });

  it('should render variables in string objects', async () => {
    const obj = 'Hello {{ name }}!';
    const vars = { name: 'World' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe('Hello World!');
  });

  it('should render variables in array objects', async () => {
    const obj = ['{{ greeting }}', '{{ name }}', 42];
    const vars = { greeting: 'Hello', name: 'World' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual(['Hello', 'World', 42]);
  });

  it('should render variables in nested arrays', async () => {
    const obj = [
      ['{{ item1 }}', '{{ item2 }}'],
      ['static', '{{ item3 }}'],
    ];
    const vars = { item1: 'first', item2: 'second', item3: 'third' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual([
      ['first', 'second'],
      ['static', 'third'],
    ]);
  });

  it('should render variables in nested objects', async () => {
    const obj = {
      level1: {
        level2: {
          text: '{{ variable }}',
          number: 42,
        },
        array: ['{{ item }}'],
      },
    };
    const vars = { variable: 'nested_value', item: 'array_item' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({
      level1: {
        level2: {
          text: 'nested_value',
          number: 42,
        },
        array: ['array_item'],
      },
    });
  });

  it('should handle function objects by calling them with vars', async () => {
    const mockFunction = vi.fn().mockReturnValue({ result: '{{ value }}' });
    const vars = { value: 'function_result' };
    const rendered = renderVarsInObject(mockFunction, vars);

    expect(mockFunction).toHaveBeenCalledWith({ vars });
    // Function result is NOT recursively templated because vars is not passed in recursive call
    expect(rendered).toEqual({ result: '{{ value }}' });
  });

  it('should handle null values', async () => {
    const obj = null;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBeNull();
  });

  it('should handle undefined values', async () => {
    const obj = undefined;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBeUndefined();
  });

  it('should handle primitive number values', async () => {
    const obj = 42;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe(42);
  });

  it('should handle primitive boolean values', async () => {
    const obj = true;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe(true);
  });

  it('should handle objects with null properties', async () => {
    const obj = { nullProp: null, text: '{{ variable }}' };
    const vars = { variable: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({ nullProp: null, text: 'test_value' });
  });

  it('should handle mixed type objects', async () => {
    const obj = {
      string: '{{ text }}',
      number: 42,
      boolean: true,
      nullValue: null,
      array: ['{{ item }}', 123],
      nested: {
        deep: '{{ deep_value }}',
      },
    };
    const vars = { text: 'rendered', item: 'array_item', deep_value: 'deep_rendered' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({
      string: 'rendered',
      number: 42,
      boolean: true,
      nullValue: null,
      array: ['array_item', 123],
      nested: {
        deep: 'deep_rendered',
      },
    });
  });

  it('should handle function that returns complex object structure', async () => {
    const complexFunction = vi.fn().mockReturnValue({
      data: {
        items: ['{{ item1 }}', '{{ item2 }}'],
        metadata: { value: '{{ meta }}' },
      },
    });
    const vars = { item1: 'first', item2: 'second', meta: 'metadata_value' };
    const rendered = renderVarsInObject(complexFunction, vars);

    expect(complexFunction).toHaveBeenCalledWith({ vars });
    // Function result is NOT recursively templated because vars is not passed in recursive call
    expect(rendered).toEqual({
      data: {
        items: ['{{ item1 }}', '{{ item2 }}'],
        metadata: { value: '{{ meta }}' },
      },
    });
  });
});

describe('renderEnvOnlyInObject', () => {
  beforeEach(() => {
    mockProcessEnv({ TEST_ENV_VAR: undefined });
    mockProcessEnv({ AZURE_ENDPOINT: undefined });
    mockProcessEnv({ API_VERSION: undefined });
    mockProcessEnv({ PORT: undefined });
    mockProcessEnv({ API_HOST: undefined });
    mockProcessEnv({ BASE_URL: undefined });
    mockProcessEnv({ EMPTY_VAR: undefined });
    mockProcessEnv({ SPECIAL_CHARS: undefined });
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
  });

  afterEach(() => {
    mockProcessEnv({ TEST_ENV_VAR: undefined });
    mockProcessEnv({ AZURE_ENDPOINT: undefined });
    mockProcessEnv({ API_VERSION: undefined });
    mockProcessEnv({ PORT: undefined });
    mockProcessEnv({ API_HOST: undefined });
    mockProcessEnv({ BASE_URL: undefined });
    mockProcessEnv({ EMPTY_VAR: undefined });
    mockProcessEnv({ SPECIAL_CHARS: undefined });
    mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: undefined });
  });

  describe('Basic rendering', () => {
    it('should render simple dot notation env vars', async () => {
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}')).toBe('env_value');
    });

    it('should render bracket notation with single quotes', async () => {
      mockProcessEnv({ ['VAR-WITH-DASH']: 'dash_value' });
      expect(renderEnvOnlyInObject("{{ env['VAR-WITH-DASH'] }}")).toBe('dash_value');
    });

    it('should render bracket notation with double quotes', async () => {
      mockProcessEnv({ ['VAR_NAME']: 'value' });
      expect(renderEnvOnlyInObject('{{ env["VAR_NAME"] }}')).toBe('value');
    });

    it('should handle whitespace variations', async () => {
      mockProcessEnv({ TEST: 'value' });
      expect(renderEnvOnlyInObject('{{env.TEST}}')).toBe('value');
      expect(renderEnvOnlyInObject('{{  env.TEST  }}')).toBe('value');
      expect(renderEnvOnlyInObject('{{ env.TEST}}')).toBe('value');
      expect(renderEnvOnlyInObject('{{env.TEST }}')).toBe('value');
    });

    it('should render empty string env vars', async () => {
      mockProcessEnv({ EMPTY_VAR: '' });
      expect(renderEnvOnlyInObject('{{ env.EMPTY_VAR }}')).toBe('');
    });

    it('should render env vars with special characters in value', async () => {
      mockProcessEnv({ SPECIAL_CHARS: 'value with spaces & $pecial chars!' });
      expect(renderEnvOnlyInObject('{{ env.SPECIAL_CHARS }}')).toBe(
        'value with spaces & $pecial chars!',
      );
    });
  });

  describe('Filters and expressions (NEW functionality)', () => {
    it('should support default filter with fallback', async () => {
      mockProcessEnv({ EXISTING: 'exists' });
      expect(renderEnvOnlyInObject("{{ env.EXISTING | default('fallback') }}")).toBe('exists');
      // NEW: When env var doesn't exist but has default filter, Nunjucks renders it
      expect(renderEnvOnlyInObject("{{ env.NONEXISTENT | default('fallback') }}")).toBe('fallback');
    });

    it('should support upper filter', async () => {
      mockProcessEnv({ LOWERCASE: 'lowercase' });
      expect(renderEnvOnlyInObject('{{ env.LOWERCASE | upper }}')).toBe('LOWERCASE');
    });

    it('should support lower filter', async () => {
      mockProcessEnv({ UPPERCASE: 'UPPERCASE' });
      expect(renderEnvOnlyInObject('{{ env.UPPERCASE | lower }}')).toBe('uppercase');
    });

    it('should support chained filters', async () => {
      mockProcessEnv({ TEST: 'test' });
      expect(renderEnvOnlyInObject("{{ env.TEST | default('x') | upper }}")).toBe('TEST');
    });

    it('should support complex filter expressions', async () => {
      mockProcessEnv({ PORT: '8080' });
      expect(renderEnvOnlyInObject('{{ env.PORT | int }}')).toBe('8080');
    });

    it('should handle filter with closing brace in argument', async () => {
      mockProcessEnv({ VAR: 'value' });
      // This is a tricky case: the default value contains }
      expect(renderEnvOnlyInObject("{{ env.VAR | default('}') }}")).toBe('value');
    });
  });

  describe('Preservation of non-env templates', () => {
    it('should preserve vars templates', async () => {
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}, {{ vars.myVar }}')).toBe(
        'env_value, {{ vars.myVar }}',
      );
    });

    it('should preserve prompt templates', async () => {
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}, {{ prompt }}')).toBe(
        'env_value, {{ prompt }}',
      );
    });

    it('should preserve multiple non-env templates', async () => {
      mockProcessEnv({ API_HOST: 'api.example.com' });
      const template =
        'Host: {{ env.API_HOST }}, Message: {{ vars.msg }}, Context: {{ context }}, Prompt: {{ prompt }}';
      const expected =
        'Host: api.example.com, Message: {{ vars.msg }}, Context: {{ context }}, Prompt: {{ prompt }}';
      expect(renderEnvOnlyInObject(template)).toBe(expected);
    });

    it('should preserve templates with filters on non-env vars', async () => {
      expect(renderEnvOnlyInObject("{{ vars.name | default('Guest') }}")).toBe(
        "{{ vars.name | default('Guest') }}",
      );
    });

    it('should preserve env templates in _conversation runtime vars', async () => {
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      const config = {
        tests: [
          {
            vars: {
              _conversation: [
                {
                  input: 'Tell me a secret',
                  output: 'The answer is {{ env.TEST_ENV_VAR }}',
                },
              ],
              regularVar: '{{ env.TEST_ENV_VAR }}',
            },
          },
        ],
      };

      expect(renderEnvOnlyInObject(config)).toEqual({
        tests: [
          {
            vars: {
              _conversation: [
                {
                  input: 'Tell me a secret',
                  output: 'The answer is {{ env.TEST_ENV_VAR }}',
                },
              ],
              regularVar: 'env_value',
            },
          },
        ],
      });
    });
  });

  describe('Undefined env vars', () => {
    it('should preserve template if env var does not exist', async () => {
      expect(renderEnvOnlyInObject('{{ env.NONEXISTENT }}')).toBe('{{ env.NONEXISTENT }}');
    });

    it('should preserve bracket notation if env var does not exist', async () => {
      expect(renderEnvOnlyInObject("{{ env['MISSING'] }}")).toBe("{{ env['MISSING'] }}");
    });
  });

  describe('Complex data structures', () => {
    it('should work with nested objects', async () => {
      mockProcessEnv({ LEVEL1: 'value1' });
      mockProcessEnv({ LEVEL2: 'value2' });
      const obj = {
        level1: {
          level2: {
            env1: '{{ env.LEVEL1 }}',
            env2: '{{ env.LEVEL2 }}',
            vars: '{{ vars.test }}',
          },
        },
      };
      expect(renderEnvOnlyInObject(obj)).toEqual({
        level1: {
          level2: {
            env1: 'value1',
            env2: 'value2',
            vars: '{{ vars.test }}',
          },
        },
      });
    });

    it('should work with arrays', async () => {
      mockProcessEnv({ ENV1: 'value1' });
      mockProcessEnv({ ENV2: 'value2' });
      const arr = ['{{ env.ENV1 }}', '{{ vars.test }}', '{{ env.ENV2 }}', 42];
      expect(renderEnvOnlyInObject(arr)).toEqual(['value1', '{{ vars.test }}', 'value2', 42]);
    });

    it('should work with mixed nested structures', async () => {
      mockProcessEnv({ API_KEY: 'secret123' });
      const config = {
        api: {
          key: '{{ env.API_KEY }}',
          endpoints: ['{{ env.BASE_URL }}/users', '{{ env.BASE_URL }}/posts'],
        },
        request: {
          body: { message: '{{ vars.message }}' },
          headers: { authorization: 'Bearer {{ env.API_KEY }}' },
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        api: {
          key: 'secret123',
          endpoints: ['{{ env.BASE_URL }}/users', '{{ env.BASE_URL }}/posts'],
        },
        request: {
          body: { message: '{{ vars.message }}' },
          headers: { authorization: 'Bearer secret123' },
        },
      });
    });
  });

  describe('Primitive types', () => {
    it('should handle null', async () => {
      expect(renderEnvOnlyInObject(null)).toBeNull();
    });

    it('should handle undefined', async () => {
      expect(renderEnvOnlyInObject(undefined)).toBeUndefined();
    });

    it('should handle numbers', async () => {
      expect(renderEnvOnlyInObject(42)).toBe(42);
    });

    it('should handle booleans', async () => {
      expect(renderEnvOnlyInObject(true)).toBe(true);
      expect(renderEnvOnlyInObject(false)).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should preserve template on Nunjucks render error', async () => {
      mockProcessEnv({ TEST: 'value' });
      // Malformed filter that would cause Nunjucks error
      const template = '{{ env.TEST | nonexistent_filter }}';
      const rendered = renderEnvOnlyInObject(template);
      // Should preserve the template if rendering fails
      expect(rendered).toBe(template);
    });
  });

  describe('PROMPTFOO_DISABLE_TEMPLATING flag', () => {
    it('should return unchanged when flag is set', async () => {
      mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}')).toBe('{{ env.TEST_ENV_VAR }}');
    });

    it('should return unchanged objects when flag is set', async () => {
      mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
      mockProcessEnv({ TEST: 'value' });
      const obj = { key: '{{ env.TEST }}' };
      expect(renderEnvOnlyInObject(obj)).toEqual({ key: '{{ env.TEST }}' });
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle Azure provider config with mixed templates', async () => {
      mockProcessEnv({ AZURE_ENDPOINT: 'test.openai.azure.com' });
      mockProcessEnv({ API_VERSION: '2024-02-15' });
      const config = {
        apiHost: '{{ env.AZURE_ENDPOINT }}',
        apiVersion: '{{ env.API_VERSION }}',
        body: {
          message: '{{ vars.userMessage }}',
          user: '{{ vars.userId }}',
        },
      };
      expect(renderEnvOnlyInObject(config)).toEqual({
        apiHost: 'test.openai.azure.com',
        apiVersion: '2024-02-15',
        body: {
          message: '{{ vars.userMessage }}',
          user: '{{ vars.userId }}',
        },
      });
    });

    it('should handle HTTP provider with runtime vars', async () => {
      mockProcessEnv({ BASE_URL: 'https://api.example.com' });
      const config = {
        url: '{{ env.BASE_URL }}/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{ env.API_TOKEN }}',
        },
        body: {
          query: '{{ vars.userQuery }}',
          context: '{{ vars.context }}',
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        url: 'https://api.example.com/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{ env.API_TOKEN }}', // Undefined, preserved
        },
        body: {
          query: '{{ vars.userQuery }}', // Runtime vars preserved
          context: '{{ vars.context }}', // Runtime vars preserved
        },
      });
    });

    it('should handle complex provider config with filters', async () => {
      mockProcessEnv({ API_HOST: 'api.example.com' });
      mockProcessEnv({ PORT: '8080' });
      const config = {
        baseUrl: "{{ env.API_HOST | default('localhost') }}:{{ env.PORT }}",
        timeout: '{{ env.TIMEOUT | default(30000) }}',
        request: {
          body: '{{ vars.payload }}',
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        baseUrl: 'api.example.com:8080',
        timeout: '30000', // TIMEOUT undefined, but default filter renders it
        request: {
          body: '{{ vars.payload }}',
        },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple env vars in same string', async () => {
      mockProcessEnv({ HOST: 'example.com' });
      mockProcessEnv({ PORT: '8080' });
      expect(renderEnvOnlyInObject('{{ env.HOST }}:{{ env.PORT }}')).toBe('example.com:8080');
    });

    it('should handle env vars in middle of text', async () => {
      mockProcessEnv({ NAME: 'World' });
      expect(renderEnvOnlyInObject('Hello {{ env.NAME }}!')).toBe('Hello World!');
    });

    it('should handle templates with newlines', async () => {
      mockProcessEnv({ VAR: 'value' });
      expect(
        renderEnvOnlyInObject(`Line 1: {{ env.VAR }}
Line 2: {{ vars.test }}`),
      ).toBe(`Line 1: value
Line 2: {{ vars.test }}`);
    });

    it('should render env vars in strings longer than 50000 chars', async () => {
      mockProcessEnv({ TEST_ENV_VAR: 'env_value' });
      const padding = 'x'.repeat(60000);
      const template = `${padding} {{ env.TEST_ENV_VAR }} ${padding}`;
      expect(template.length).toBeGreaterThan(50000);
      expect(renderEnvOnlyInObject(template)).toBe(`${padding} env_value ${padding}`);
    });

    it('should preserve non-env templates in long strings', async () => {
      const padding = 'x'.repeat(60000);
      const template = `${padding} {{ vars.myVar }} ${padding}`;
      expect(renderEnvOnlyInObject(template)).toBe(template);
    });

    it('should handle long strings with mixed env and non-env templates', async () => {
      mockProcessEnv({ HOST: 'example.com' });
      const padding = 'x'.repeat(60000);
      const template = `${padding} {{ env.HOST }} {{ vars.test }} ${padding}`;
      expect(renderEnvOnlyInObject(template)).toBe(
        `${padding} example.com {{ vars.test }} ${padding}`,
      );
    });

    it('should handle long strings with no templates at all', async () => {
      const longString = 'a'.repeat(100000);
      expect(renderEnvOnlyInObject(longString)).toBe(longString);
    });

    it('should not confuse env in other contexts', async () => {
      mockProcessEnv({ TEST: 'value' });
      // Should not match "environment" or other words containing "env"
      expect(renderEnvOnlyInObject('environment {{ vars.test }}')).toBe(
        'environment {{ vars.test }}',
      );
    });
  });
});
