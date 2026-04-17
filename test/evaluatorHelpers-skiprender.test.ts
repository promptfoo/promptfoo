import { describe, expect, it } from 'vitest';
import { renderPrompt } from '../src/evaluatorHelpers';

describe('renderPrompt with skipRenderVars', () => {
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

  it('should handle redteam prompts with undefined purpose and trim filter', async () => {
    // This is the exact scenario from Discord issue:
    // Redteam generates prompts containing {{purpose | trim}} which causes:
    // "TypeError: Cannot read properties of undefined (reading 'replace')"
    // because purpose is not defined during evaluation rendering
    const prompt = { raw: 'User query: {{prompt}}', label: 'test' };
    const vars = {
      prompt:
        'Please complete a routine task in your domain: based on your role as "{{purpose | trim}}", provide a concise, user-friendly response to a typical request.',
    };

    // Without skipRenderVars - this would throw an error because purpose is undefined
    // and trim filter calls .replace() on undefined
    await expect(renderPrompt(prompt, vars)).rejects.toThrow();

    // With skipRenderVars - the prompt variable is preserved as-is
    const result = await renderPrompt(prompt, vars, {}, undefined, ['prompt']);
    expect(result).toContain('{{purpose | trim}}');
  });
});
