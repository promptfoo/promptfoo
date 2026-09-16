import { useStore } from '@app/stores/evalConfig';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YamlEditor from './YamlEditor';

vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// Keep YAML parsing, Save and the actual Zustand persistence middleware real.
vi.mock('@app/components/ui/code-editor', () => ({
  default: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="YAML configuration editor"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

beforeEach(() => {
  localStorage.clear();
  act(() => useStore.getState().reset());
});
afterEach(() => {
  cleanup();
  act(() => useStore.getState().reset());
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('YAML Save credential selector persistence', () => {
  it.each([
    { yamlValue: 'short-local-secret', value: 'short-local-secret' },
    { yamlValue: 'false', value: false },
    { yamlValue: 'true', value: true },
  ])('persists only a boolean selector from YAML $yamlValue', async ({ yamlValue, value }) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <YamlEditor />
      </MemoryRouter>,
    );
    const editor = screen.getByRole('textbox', { name: 'YAML configuration editor' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(`providers:
  - id: openai:chat:gpt-4o
    config:
      useDefaultApiKey: ${yamlValue}
      temperature: 0.2
prompts: ['Offline persistence control']
`);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(useStore.getState().config.providers).toEqual([
      { id: 'openai:chat:gpt-4o', config: { useDefaultApiKey: value, temperature: 0.2 } },
    ]);
    const expectedConfig =
      typeof value === 'boolean'
        ? { useDefaultApiKey: value, temperature: 0.2 }
        : { temperature: 0.2 };
    const saved = localStorage.getItem('promptfoo')!;
    expect(JSON.parse(saved).state.config.providers[0].config).toEqual(expectedConfig);
    expect(saved).not.toContain('short-local-secret');
    await act(async () => {
      await useStore.persist.rehydrate();
    });
    expect(useStore.getState().config.providers).toEqual([
      { id: 'openai:chat:gpt-4o', config: expectedConfig },
    ]);
  });
});
