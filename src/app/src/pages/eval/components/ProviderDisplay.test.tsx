import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { filterConfigForDisplay, ProviderDisplay } from './ProviderDisplay';

describe('filterConfigForDisplay', () => {
  describe('excluded fields', () => {
    it('excludes callApi field entirely', () => {
      const config = { callApi: () => {}, temperature: 0.5 };
      const result = filterConfigForDisplay(config);
      expect(result.callApi).toBeUndefined();
      expect(result.temperature).toBe(0.5);
    });

    it('excludes callEmbeddingApi field entirely', () => {
      const config = { callEmbeddingApi: () => {}, model: 'text-embedding-3-small' };
      const result = filterConfigForDisplay(config);
      expect(result.callEmbeddingApi).toBeUndefined();
      expect(result.model).toBe('text-embedding-3-small');
    });

    it('excludes callClassificationApi field entirely', () => {
      const config = { callClassificationApi: () => {}, threshold: 0.8 };
      const result = filterConfigForDisplay(config);
      expect(result.callClassificationApi).toBeUndefined();
      expect(result.threshold).toBe(0.8);
    });

    it('excludes prompts field entirely', () => {
      const config = { prompts: ['prompt1', 'prompt2'], temperature: 0.5 };
      const result = filterConfigForDisplay(config);
      expect(result.prompts).toBeUndefined();
      expect(result.temperature).toBe(0.5);
    });

    it('excludes transform field entirely', () => {
      const config = { transform: 'some transform', model: 'gpt-4' };
      const result = filterConfigForDisplay(config);
      expect(result.transform).toBeUndefined();
      expect(result.model).toBe('gpt-4');
    });

    it('excludes delay field entirely', () => {
      const config = { delay: 1000, temperature: 0.7 };
      const result = filterConfigForDisplay(config);
      expect(result.delay).toBeUndefined();
      expect(result.temperature).toBe(0.7);
    });

    it('excludes env field entirely', () => {
      const config = { env: { VAR: 'value' }, temperature: 0.7 };
      const result = filterConfigForDisplay(config);
      expect(result.env).toBeUndefined();
      expect(result.temperature).toBe(0.7);
    });
  });

  describe('nested objects', () => {
    it('preserves nested config objects', () => {
      const config = {
        generationConfig: {
          thinkingConfig: {
            thinkingLevel: 'HIGH',
          },
          temperature: 0.7,
        },
      };
      const result = filterConfigForDisplay(config);
      expect(result.generationConfig.thinkingConfig.thinkingLevel).toBe('HIGH');
      expect(result.generationConfig.temperature).toBe(0.7);
    });

    it('handles deeply nested structures', () => {
      const config = {
        level1: {
          level2: {
            level3: {
              setting: 'value',
            },
          },
        },
      };
      const result = filterConfigForDisplay(config);
      expect(result.level1.level2.level3.setting).toBe('value');
    });

    it('excludes fields in nested objects', () => {
      const config = {
        outer: {
          callApi: () => {},
          temperature: 0.5,
        },
      };
      const result = filterConfigForDisplay(config);
      expect(result.outer.callApi).toBeUndefined();
      expect(result.outer.temperature).toBe(0.5);
    });
  });

  describe('arrays', () => {
    it('preserves arrays of objects', () => {
      const config = {
        items: [
          { name: 'item1', value: 100 },
          { name: 'item2', value: 200 },
        ],
      };
      const result = filterConfigForDisplay(config);
      expect(result.items[0].name).toBe('item1');
      expect(result.items[0].value).toBe(100);
      expect(result.items[1].name).toBe('item2');
      expect(result.items[1].value).toBe(200);
    });

    it('preserves arrays of strings', () => {
      const config = {
        tags: ['tag1', 'tag2', 'tag3'],
      };
      const result = filterConfigForDisplay(config);
      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('preserves arrays of numbers', () => {
      const config = {
        scores: [0.8, 0.9, 0.95],
      };
      const result = filterConfigForDisplay(config);
      expect(result.scores).toEqual([0.8, 0.9, 0.95]);
    });
  });

  describe('edge cases', () => {
    it('returns undefined for null input', () => {
      expect(filterConfigForDisplay(null)).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(filterConfigForDisplay(undefined)).toBeUndefined();
    });

    it('returns undefined for empty object', () => {
      expect(filterConfigForDisplay({})).toBeUndefined();
    });

    it('handles primitive values', () => {
      expect(filterConfigForDisplay('string')).toBe('string');
      expect(filterConfigForDisplay(123)).toBe(123);
      expect(filterConfigForDisplay(true)).toBe(true);
    });

    it('prevents infinite recursion with depth limit', () => {
      // Create a deeply nested object
      let obj: any = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      // Should not throw, should return undefined for too-deep content
      expect(() => filterConfigForDisplay(obj)).not.toThrow();
    });

    it('preserves all non-excluded fields', () => {
      const config = {
        apiKey: 'sk-1234567890',
        temperature: 0.7,
        max_tokens: 1000,
        model: 'gpt-4',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
      };
      const result = filterConfigForDisplay(config);
      // All fields should be preserved (no redaction)
      expect(result.apiKey).toBe('sk-1234567890');
      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(1000);
      expect(result.model).toBe('gpt-4');
      expect(result.headers.Authorization).toBe('Bearer token');
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('returns undefined for empty array', () => {
      expect(filterConfigForDisplay([])).toBeUndefined();
    });

    it('filters out array items that become undefined', () => {
      const config = {
        items: [{ callApi: () => {} }, { transform: 'test' }, { temperature: 0.5 }],
      };
      const result = filterConfigForDisplay(config);
      // First two items are only excluded fields, so array should only have third item
      expect(result.items).toHaveLength(1);
      expect(result.items[0].temperature).toBe(0.5);
    });

    it('returns undefined when all array items are filtered out', () => {
      const config = {
        excluded: [{ callApi: () => {} }, { transform: 'test' }],
      };
      const result = filterConfigForDisplay(config);
      expect(result).toBeUndefined();
    });

    it('handles object containing only excluded fields', () => {
      const config = {
        callApi: () => {},
        transform: 'test',
        env: { VAR: 'val' },
      };
      const result = filterConfigForDisplay(config);
      expect(result).toBeUndefined();
    });

    it('handles nested object with all excluded fields', () => {
      const config = {
        outer: {
          callApi: () => {},
          env: {},
        },
        temperature: 0.5,
      };
      const result = filterConfigForDisplay(config);
      // outer becomes undefined after filtering, only temperature remains
      expect(result.outer).toBeUndefined();
      expect(result.temperature).toBe(0.5);
    });

    it('handles zero as valid numeric value', () => {
      const config = { temperature: 0, presence_penalty: 0 };
      const result = filterConfigForDisplay(config);
      expect(result.temperature).toBe(0);
      expect(result.presence_penalty).toBe(0);
    });

    it('handles false as valid boolean value', () => {
      const config = { stream: false, echo: false };
      const result = filterConfigForDisplay(config);
      expect(result.stream).toBe(false);
      expect(result.echo).toBe(false);
    });

    it('handles empty string as valid value', () => {
      const config = { apiKey: '', model: '' };
      const result = filterConfigForDisplay(config);
      expect(result.apiKey).toBe('');
      expect(result.model).toBe('');
    });

    it('handles array with mixed primitive types', () => {
      const config = {
        mixed: [1, 'string', true, null, 0, false, ''],
      };
      const result = filterConfigForDisplay(config);
      // null becomes undefined and is filtered out
      expect(result.mixed).toEqual([1, 'string', true, 0, false, '']);
    });

    it('preserves complex nested structures with mixed types', () => {
      const config = {
        reasoning: {
          enabled: true,
          budget: 10000,
          fallback: {
            model: 'gpt-4',
            temperature: 0.5,
          },
        },
        tools: ['function1', 'function2'],
      };
      const result = filterConfigForDisplay(config);
      expect(result.reasoning.enabled).toBe(true);
      expect(result.reasoning.budget).toBe(10000);
      expect(result.reasoning.fallback.model).toBe('gpt-4');
      expect(result.tools).toEqual(['function1', 'function2']);
    });

    it('handles object at exact recursion depth limit', () => {
      // Create object at exactly depth 10
      let obj: any = { value: 'deepest' };
      for (let i = 0; i < 9; i++) {
        obj = { nested: obj };
      }
      const result = filterConfigForDisplay(obj);
      // Should still process at depth 10
      expect(result).toBeDefined();
      let current = result;
      for (let i = 0; i < 9; i++) {
        expect(current.nested).toBeDefined();
        current = current.nested;
      }
      expect(current.value).toBe('deepest');
    });

    it('returns undefined for object beyond recursion depth limit', () => {
      // Create object beyond depth 10 - the function stops at depth 10 and returns undefined
      let obj: any = { value: 'too deep' };
      for (let i = 0; i < 11; i++) {
        obj = { nested: obj };
      }
      const result = filterConfigForDisplay(obj);
      // When starting at depth 0, a 12-level nested object exceeds depth limit
      // The entire object becomes undefined because the depth check happens at entry
      expect(result).toBeUndefined();
    });
  });
});

describe('ProviderDisplay', () => {
  const renderWithProviders = (
    providerString: string,
    providersArray: any[] | undefined,
    fallbackIndex?: number,
  ) => {
    return render(
      <TooltipProvider>
        <ProviderDisplay
          providerString={providerString}
          providersArray={providersArray}
          fallbackIndex={fallbackIndex}
        />
      </TooltipProvider>,
    );
  };

  describe('provider name display', () => {
    it('displays provider with prefix:name format for standard providers', () => {
      renderWithProviders('openai:gpt-4o', undefined);
      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('displays label when matched by label', () => {
      const providers = [{ id: 'openai:gpt-4o', label: 'My Custom GPT' }];
      renderWithProviders('My Custom GPT', providers);
      expect(screen.getByText('My Custom GPT')).toBeInTheDocument();
    });

    it('displays only provider name for providers without colon (e.g., echo)', () => {
      const { container } = renderWithProviders('echo', undefined);
      // Should show just "echo", not "echo:echo"
      const span = container.querySelector('span');
      expect(span?.textContent).toBe('echo');
      // Verify no duplication - only one "echo" text node
      expect(screen.getAllByText('echo')).toHaveLength(1);
    });

    it('does not duplicate display when label equals model name', () => {
      // Critical regression test: when label="gpt-4o" and id="openai:gpt-4o",
      // matching by label should show "gpt-4o" ONCE, not "gpt-4o:gpt-4o"
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('gpt-4o', providers);

      // Should show label exactly once
      expect(screen.getAllByText('gpt-4o')).toHaveLength(1);
      // The display should NOT contain a colon (would indicate duplication)
      const span = screen.getByText('gpt-4o').closest('span');
      expect(span?.textContent).toBe('gpt-4o');
    });
  });

  describe('tooltip behavior', () => {
    it('shows tooltip with config on hover', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7, max_tokens: 1000 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      const providerElement = screen.getByText('gpt-4o');
      // Navigate up to find the wrapper span with cursor class (parent > parent)
      const wrapperSpan = providerElement.parentElement?.parentElement;
      expect(wrapperSpan).toHaveClass('cursor-help');

      await user.hover(providerElement);

      // Wait for Radix tooltip to appear
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Config should be wrapped in config: to match YAML structure
      expect(tooltip?.textContent).toContain('config:');
      expect(tooltip?.textContent).toContain('temperature');
      expect(tooltip?.textContent).toContain('0.7');
    });

    it('shows id in tooltip when label differs from underlying id', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'Fast Model',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('Fast Model', providers);

      expect(screen.getByText('Fast Model')).toBeInTheDocument();

      await user.hover(screen.getByText('Fast Model'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Should show underlying id since display shows "Fast Model"
      expect(tooltip?.textContent).toContain('id: openai:gpt-4o');
      expect(tooltip?.textContent).toContain('temperature');
    });

    it('shows id in tooltip when label is just the model name', async () => {
      // When label="gpt-4o" but id="openai:gpt-4o", we SHOULD show the id
      // because "gpt-4o" could be from any provider (openai, azure, etc.)
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('id: openai:gpt-4o');
    });

    it('does not show id in tooltip when display already shows full id', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Should NOT contain "id:" since display shows "openai:gpt-4o"
      expect(tooltip?.textContent).not.toContain('id:');
      // Should still show config
      expect(tooltip?.textContent).toContain('temperature');
    });

    it('does not show tooltip when provider has no config', () => {
      const providers = [{ id: 'openai:gpt-4o' }];
      renderWithProviders('openai:gpt-4o', providers);

      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      // Cursor should be default (not help) since no tooltip content
      // Navigate up to find the wrapper span with cursor class (parent > parent)
      const wrapperSpan = screen.getByText('gpt-4o').parentElement?.parentElement;
      expect(wrapperSpan).toHaveClass('cursor-default');
    });

    it('does not show tooltip for string-only provider', () => {
      const providers = ['openai:gpt-4o', 'anthropic:claude-3'];
      renderWithProviders('openai:gpt-4o', providers);

      // Navigate up to find the wrapper span with cursor class (parent > parent)
      const wrapperSpan = screen.getByText('gpt-4o').parentElement?.parentElement;
      expect(wrapperSpan).toHaveClass('cursor-default');
    });
  });

  describe('edge cases', () => {
    it('handles provider with only label (no id)', () => {
      const providers = [{ label: 'Custom Provider', config: { temperature: 0.5 } }];
      renderWithProviders('Custom Provider', providers);

      expect(screen.getByText('Custom Provider')).toBeInTheDocument();
    });

    it('handles provider with nested config.config structure', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: {
            config: { temperature: 0.8 }, // Double-nested
          },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('temperature');
    });

    it('handles empty providers array gracefully', () => {
      renderWithProviders('openai:gpt-4o', []);

      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('handles provider with multiple colons in name', () => {
      const providers = [
        {
          id: 'google:gemini-2.0-flash:thinking',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('google:gemini-2.0-flash:thinking', providers);

      expect(screen.getByText('google:')).toBeInTheDocument();
      expect(screen.getByText('gemini-2.0-flash:thinking')).toBeInTheDocument();
    });

    it('handles label containing colons without splitting', () => {
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'prod:us-east:gpt4',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('prod:us-east:gpt4', providers);

      // Should show the whole label, not split it
      expect(screen.getByText('prod:us-east:gpt4')).toBeInTheDocument();
      // Verify it's shown as a single span element with font-semibold (label display)
      const labelElement = screen.getByText('prod:us-east:gpt4');
      expect(labelElement.tagName).toBe('SPAN');
      expect(labelElement).toHaveClass('font-semibold');
    });

    it('handles fallback to index when provider not found by id/label', async () => {
      const user = userEvent.setup();
      const providers = [
        { id: 'openai:gpt-4o', config: { temperature: 0.5 } },
        { id: 'anthropic:claude-3', config: { temperature: 0.7 } },
      ];
      // providerString doesn't match any id/label, but fallbackIndex points to second provider
      const { container } = renderWithProviders('unknown-provider', providers, 1);

      // Hover to verify we get config from index fallback
      const span = container.querySelector('span');
      expect(span).toBeInTheDocument();
      if (span) {
        await user.hover(span);
        await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
        const tooltip = document.querySelector('[role="tooltip"]');
        // Should show config from providers[1] (temperature: 0.7)
        expect(tooltip?.textContent).toContain('temperature');
        expect(tooltip?.textContent).toContain('0.7');
      }
    });

    it('handles undefined providersArray', () => {
      renderWithProviders('openai:gpt-4o', undefined);

      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('handles provider where label equals full id', () => {
      // Edge case: label is same as id - should not show label in this case
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'openai:gpt-4o',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      // Should show prefix:name format, not as a label
      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('displays config with stringified boolean values in tooltip', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { stream: true, logprobs: false },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('true');
      expect(tooltip?.textContent).toContain('false');
    });

    it('displays config with numeric values including decimals', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7, top_p: 0.95, max_tokens: 1000 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('0.7');
      expect(tooltip?.textContent).toContain('0.95');
      expect(tooltip?.textContent).toContain('1000');
    });

    it('displays config with negative numbers', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { presence_penalty: -0.5, frequency_penalty: -1.2 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('-0.5');
      expect(tooltip?.textContent).toContain('-1.2');
    });

    it('displays config with string values containing special characters', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { model: 'gpt-4o-2024-05-13', stop: ['\n\n', '###'] },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('gpt-4o-2024-05-13');
    });

    it('displays config with lines without colons', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: {
            stop: ['STOP', 'END'],
          },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // YAML arrays render with - prefix, which doesn't match colon pattern
      expect(tooltip?.textContent).toContain('STOP');
      expect(tooltip?.textContent).toContain('END');
    });

    it('handles config with multiple colons in value', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { baseURL: 'https://api.openai.com:443/v1' },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Regex should only match the FIRST colon, preserving colons in the value
      expect(tooltip?.textContent).toContain('https://api.openai.com:443/v1');
    });

    it('displays config with zero numeric value correctly', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0, presence_penalty: 0 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Zero should be detected as a number and styled appropriately
      expect(tooltip?.textContent).toContain('0');
    });

    it('handles very long provider string gracefully', () => {
      const longString =
        'custom-provider:very-long-model-name-that-exceeds-normal-length-constraints-v2024';
      const providers = [
        {
          id: longString,
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders(longString, providers);
      expect(
        screen.getByText('very-long-model-name-that-exceeds-normal-length-constraints-v2024'),
      ).toBeInTheDocument();
    });

    it('handles config with empty string values', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { suffix: '', user: '' },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('suffix');
      expect(tooltip?.textContent).toContain('user');
    });
  });
});
