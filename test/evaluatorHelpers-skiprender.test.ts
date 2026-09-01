import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPrompt } from '../src/evaluatorHelpers';

describe('renderPrompt with skipRenderVars', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should skip rendering variables in skipRenderVars array', async () => {
    const prompt = { raw: 'User input: {{user_input}}', label: 'test' };
    const vars = {
      user_input: '{{7*7}}', // This would normally be rendered as "49"
    };

    // Without skipRenderVars - variable value gets rendered
    const resultWithoutSkip = await renderPrompt(prompt, vars);
    expect(resultWithoutSkip).toBe('User input: 49');

    // With skipRenderVars - variable value is NOT rendered
    const resultWithSkip = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);
    expect(resultWithSkip).toBe('User input: {{7*7}}');
  });

  it('should pass SSTI payloads through without evaluation when skipped', async () => {
    const prompt = { raw: 'Process: {{payload}}', label: 'test' };
    const vars = {
      payload: '{{cycler["__init__"]["__globals__"]["os"]["popen"]("whoami")}}',
    };

    // This would throw an error without skipRenderVars
    // With skipRenderVars, it passes through safely
    const result = await renderPrompt(prompt, vars, {}, undefined, ['payload']);
    expect(result).toContain('{{cycler["__init__"]["__globals__"]["os"]["popen"]("whoami")}}');
  });

  it('should skip file:// dereferencing for variables in skipRenderVars array', async () => {
    const prompt = { raw: 'User input: {{user_input}}', label: 'test' };
    const vars = {
      user_input: 'file:///tmp/does-not-exist.txt',
    };

    await expect(renderPrompt(prompt, vars)).rejects.toThrow('ENOENT');

    const result = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);
    expect(result).toBe('User input: file:///tmp/does-not-exist.txt');
  });

  it('should skip package: dereferencing for variables in skipRenderVars array', async () => {
    const prompt = { raw: 'User input: {{user_input}}', label: 'test' };
    const vars = {
      user_input: 'package:@promptfoo/does-not-exist:testFunction',
    };

    await expect(renderPrompt(prompt, vars)).rejects.toThrow('Package not found');

    const result = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);
    expect(result).toBe('User input: package:@promptfoo/does-not-exist:testFunction');
  });

  it('should still render other variables not in skipRenderVars', async () => {
    const prompt = { raw: 'Name: {{name}}, Payload: {{payload}}', label: 'test' };
    const vars = {
      name: '{{greeting}}',
      greeting: 'Hello',
      payload: '{{dangerous}}',
    };

    const result = await renderPrompt(prompt, vars, {}, undefined, ['payload']);

    // name should be rendered (because it's not in skipRenderVars)
    expect(result).toContain('Name: Hello');

    // payload should NOT be rendered (because it's in skipRenderVars)
    expect(result).toContain('Payload: {{dangerous}}');
  });

  it('should not resolve nested variable references inside skipRenderVars values', async () => {
    const prompt = { raw: 'User input: {{user_input}}', label: 'test' };
    const vars = {
      secret: 'do-not-inline',
      user_input: '{{secret}}',
    };

    const result = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);

    expect(result).toBe('User input: {{secret}}');
  });

  it('should not render skipped variable values after alias resolution', async () => {
    const prompt = { raw: 'User input: {{wrapped_input}}', label: 'test' };
    const vars = {
      user_input: '{{7*7}}',
      wrapped_input: '{{user_input}}',
    };

    const resultWithoutSkip = await renderPrompt(prompt, { ...vars });
    expect(resultWithoutSkip).toBe('User input: 49');

    const result = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);

    expect(result).toBe('User input: {{7*7}}');
  });

  it('should not resolve nested references copied through a skipped variable alias', async () => {
    const prompt = { raw: 'User input: {{wrapped_input}}', label: 'test' };
    const vars = {
      secret: 'do-not-inline',
      user_input: '{{secret}}',
      wrapped_input: '{{user_input}}',
    };

    const result = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);

    expect(result).toBe('User input: {{secret}}');
  });

  it('should preserve trailing newlines inside skipRenderVars values', async () => {
    const prompt = { raw: 'User input: {{user_input}}', label: 'test' };
    const vars = {
      user_input: 'payload-with-newline\n',
    };

    const result = await renderPrompt(prompt, vars, {}, undefined, ['user_input']);

    expect(result).toBe('User input: payload-with-newline\n');
  });

  it('should handle redteam prompts with undefined purpose and trim filter', async () => {
    // This is the exact scenario from Discord issue:
    // Redteam generates prompts containing {{purpose | trim}} which used to cause:
    // "TypeError: Cannot read properties of undefined (reading 'replace')"
    // because purpose is not defined during evaluation rendering
    const prompt = { raw: 'User query: {{prompt}}', label: 'test' };
    const vars = {
      prompt:
        'Please complete a routine task in your domain: based on your role as "{{purpose | trim}}", provide a concise, user-friendly response to a typical request.',
    };

    // Without skipRenderVars, the recursive render now preserves the original value instead of
    // throwing on Nunjucks' undefined trim bug.
    const resultWithoutSkip = await renderPrompt(prompt, vars);
    expect(resultWithoutSkip).toContain('{{purpose | trim}}');

    // With skipRenderVars - the prompt variable is preserved as-is
    const result = await renderPrompt(prompt, vars, {}, undefined, ['prompt']);
    expect(result).toContain('{{purpose | trim}}');
  });

  describe('skipVariableValueRenderVars', () => {
    it('preserves multiple stored values while resolving aliases, normal vars, and use-site filters', async () => {
      const prompt = { raw: '{{wrapper}}', label: 'test' };
      const vars = {
        first: '{{7*7}}',
        firstAlias: '{{first}}',
        second: '{{8*8}}',
        normal: '{{word}}',
        word: 'N',
        wrapper: '{{firstAlias}}/{{normal}}/{{second | prefix("P:")}}',
      };
      const prefix = vi.fn((value: string, prefix: string) => `${prefix}${value}`);

      const result = await renderPrompt(prompt, vars, { prefix }, undefined, undefined, [
        'first',
        'second',
      ]);

      expect(result).toBe('{{7*7}}/N/P:{{8*8}}');
      expect(prefix).toHaveBeenCalledTimes(1);
    });

    it('keeps derived alias expansion within the existing five-pass bound', async () => {
      const vars: Record<string, string> = { stored: 'x' };
      for (let index = 1; index <= 20; index++) {
        const source = index === 1 ? 'stored' : `value${index - 1}`;
        vars[`value${index}`] = `{{${source}}}{{${source}}}`;
      }

      const result = await renderPrompt(
        { raw: '{{value20}}', label: 'test' },
        vars,
        {},
        undefined,
        undefined,
        ['stored'],
      );

      expect(result.length).toBeLessThan(1024);
    });

    it('does not execute template syntax, filters, raw-block breakouts, or environment lookups in stored data', async () => {
      vi.stubEnv('PROMPTFOO_STORE_OUTPUT_SECRET', 'must-not-leak');
      const explode = vi.fn(() => 'executed');
      const storedFilter = `{{ 'x' | explode }}`;
      const storedSecret = '{{ env.PROMPTFOO_STORE_OUTPUT_SECRET }}';
      const storedRaw = '{% endraw %}{{9*9}}{% raw %}';

      const result = await renderPrompt(
        { raw: '{{storedFilter}}|{{storedSecret}}|{{storedRaw}}', label: 'test' },
        { storedFilter, storedSecret, storedRaw },
        { explode },
        undefined,
        undefined,
        ['storedFilter', 'storedSecret', 'storedRaw'],
      );

      expect(result).toBe(`${storedFilter}|${storedSecret}|${storedRaw}`);
      expect(result).not.toContain('must-not-leak');
      expect(explode).not.toHaveBeenCalled();
    });

    it('preserves stored strings through valid JSON serialization without changing unrelated JSON vars', async () => {
      const stored = 'quote: "x"\n{{7*7}}';
      const result = await renderPrompt(
        {
          raw: '{"message":"{{wrapper}}","unrelated":"{{unrelated}}"}',
          label: 'test',
        },
        {
          stored,
          wrapper: '{{ "Stored: " ~ stored }}',
          unrelated: '{{8*8}}',
        },
        {},
        undefined,
        undefined,
        ['stored'],
      );

      expect(JSON.parse(result)).toEqual({
        message: `Stored: ${stored}`,
        unrelated: '{{8*8}}',
      });
    });

    it('resolves stored values while preserving unrelated undefined references', async () => {
      const vars = {
        stored: '{{7*7}}',
        wrapper: '{{stored}}/{{missing}}',
      };

      const result = await renderPrompt(
        { raw: '{{wrapper}}', label: 'test' },
        vars,
        {},
        undefined,
        undefined,
        ['stored'],
      );

      expect(result).toBe('{{7*7}}/{{missing}}');
      expect(vars.wrapper).toBe('{{7*7}}/{{missing}}');

      const filteredWrapper = '{{ stored | replace("x", "}}") }}/{{missing}}';
      await expect(
        renderPrompt(
          { raw: '{{wrapper}}', label: 'test' },
          { stored: 'x{{7*7}}', wrapper: filteredWrapper },
          {},
          undefined,
          undefined,
          ['stored'],
        ),
      ).resolves.toBe(filteredWrapper);
    });

    it('resolves stored values through wrappers when JSON autoescape is disabled', async () => {
      vi.stubEnv('PROMPTFOO_DISABLE_JSON_AUTOESCAPE', 'true');

      const result = await renderPrompt(
        { raw: '{{wrapper}}', label: 'test' },
        {
          first: '{{7*7}}',
          second: '{{8*8}}',
          wrapper: '{{first}}/{{second}}',
        },
        {},
        undefined,
        undefined,
        ['first', 'second'],
      );

      expect(result).toBe('{{7*7}}/{{8*8}}');
    });

    it('retains regular file, package, and trailing-newline preprocessing', async () => {
      const prompt = { raw: '{{value}}', label: 'test' };

      await expect(
        renderPrompt(
          prompt,
          { value: 'file:///tmp/promptfoo-store-output-does-not-exist.txt' },
          {},
          undefined,
          undefined,
          ['value'],
        ),
      ).rejects.toThrow('ENOENT');
      await expect(
        renderPrompt(
          prompt,
          { value: 'package:@promptfoo/does-not-exist:testFunction' },
          {},
          undefined,
          undefined,
          ['value'],
        ),
      ).rejects.toThrow('Package not found');
      await expect(
        renderPrompt(prompt, { value: 'line\n' }, {}, undefined, undefined, ['value']),
      ).resolves.toBe('line');
      await expect(
        renderPrompt(
          prompt,
          { value: 'file://test/fixtures/store-output-template.txt' },
          {},
          undefined,
          undefined,
          ['value'],
        ),
      ).resolves.toBe('loaded {{7*7}}');
    });

    it('coexists with the broader redteam skip behavior', async () => {
      const redteamPayload = 'file:///tmp/promptfoo-redteam-does-not-exist.txt\n';
      const result = await renderPrompt(
        { raw: 'Payload={{payload}}|Stored={{stored}}', label: 'test' },
        { payload: redteamPayload, stored: '{{7*7}}\n' },
        {},
        undefined,
        ['payload'],
        ['stored'],
      );

      expect(result).toBe(`Payload=${redteamPayload}|Stored={{7*7}}`);
    });

    it.each([
      [{ text: '{{7*7}}' }, '{"text":"{{7*7}}"}'],
      [['{{8*8}}'], '["{{8*8}}"]'],
      [null, 'null'],
      [undefined, ''],
    ])('preserves existing rendering for non-string value %#', async (value, expected) => {
      const prompt = { raw: '{{value | dump}}', label: 'test' };
      const vars = { value } as unknown as Parameters<typeof renderPrompt>[1];
      const baseline = await renderPrompt(prompt, { ...vars });
      const protectedResult = await renderPrompt(prompt, { ...vars }, {}, undefined, undefined, [
        'value',
      ]);

      expect(protectedResult).toBe(expected);
      expect(protectedResult).toBe(baseline);
    });

    it('does not evaluate prototype-like values and retains existing __proto__ handling', async () => {
      const vars = Object.fromEntries([
        ['constructor', 'ctor {{7*7}}'],
        ['toString', 'string {{8*8}}'],
        ['__proto__', 'proto {{9*9}}'],
      ]);

      const result = await renderPrompt(
        { raw: '{{constructor}}|{{toString}}|{{__proto__}}', label: 'test' },
        vars,
        {},
        undefined,
        undefined,
        Object.keys(vars),
      );

      expect(result).toBe('ctor {{7*7}}|string {{8*8}}|[object Object]');
      expect(result).not.toMatch(/49|64|81/);
      expect(Object.hasOwn(vars, '__proto__')).toBe(true);
      expect(vars.__proto__).toBe('proto {{9*9}}');
    });
  });
});
