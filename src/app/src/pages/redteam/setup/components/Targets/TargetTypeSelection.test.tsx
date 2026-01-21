import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TargetTypeSelection from './TargetTypeSelection';

const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();
vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
  DEFAULT_HTTP_TARGET: {
    id: 'http',
    label: '',
    config: {},
  },
}));

const mockRecordEvent = vi.fn();
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: mockRecordEvent,
  }),
}));

vi.mock('../LoadExampleButton', () => ({
  default: () => <button>Load Example</button>,
}));

describe('TargetTypeSelection', () => {
  const onNext = vi.fn();
  const onBack = vi.fn();

  const renderComponent = () => {
    return render(
      <TooltipProvider>
        <TargetTypeSelection onNext={onNext} onBack={onBack} />
      </TooltipProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'http',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: undefined,
      setProviderType: vi.fn(),
    });
  });

  it('should allow user to enter name, reveal types, select one, and proceed', async () => {
    const user = userEvent.setup();
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: '',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: undefined, // No default selection
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    // Initially, no footer Next button should be present
    expect(screen.queryByRole('button', { name: /^Next$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();

    const nameInput = screen.getByRole('textbox', { name: /Target Name/i });
    await user.type(nameInput, 'My Test API');

    // After entering name, the inline "Continue" button should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    const inlineNextButton = screen.getByRole('button', { name: 'Continue' });
    await user.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });
    expect(onNext).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_config_target_type_section_revealed',
    });

    // Now the footer Next button should appear but be disabled (no provider selected)
    const footerNextButton = await screen.findByRole('button', { name: /^Next$/i });
    expect(footerNextButton).toBeDisabled();

    // Provider list is expanded - select OpenAI by clicking the card
    const openAICard = await screen.findByText('OpenAI');
    const cardElement = openAICard.closest('[role="button"]');
    await user.click(cardElement!);

    await waitFor(() => {
      expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
        feature: 'redteam_config_target_type_changed',
        target: expect.stringContaining('openai'),
      });
    });

    // Button should now be enabled after selecting a provider
    // Re-query the button since the component re-rendered
    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: /^Next$/i });
      expect(nextButton).toBeEnabled();
    });

    const enabledNextButton = screen.getByRole('button', { name: /^Next$/i });
    await user.click(enabledNextButton);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('should have the Next button disabled and provider type section not visible when target name is empty', () => {
    renderComponent();

    // Initially, no footer Next button should be present, and no target type section
    expect(screen.queryByRole('button', { name: /^Next$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();
  });

  it('should update the selectedTarget and providerType when a new provider type is selected and record telemetry event', async () => {
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: '',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: undefined, // No default selection
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: /Target Name/i });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const inlineNextButton = await screen.findByRole('button', {
      name: 'Continue',
    });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // Provider list is expanded - select OpenAI
    const openAICard = await screen.findByText('OpenAI');
    fireEvent.click(openAICard.closest('.cursor-pointer') as HTMLElement);

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith(
        'target',
        expect.objectContaining({
          id: expect.stringContaining('openai'),
        }),
      );
    });

    await waitFor(() => {
      expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
        feature: 'redteam_config_target_type_changed',
        target: expect.stringContaining('openai'),
      });
    });
  });

  it('should disable Next button after entering a target name, revealing the target type section, and then deleting the target name', async () => {
    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: /Target Name/i });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const inlineNextButton = await screen.findByRole('button', {
      name: 'Continue',
    });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // Now the footer Next button should be present
    await screen.findByRole('button', { name: /^Next$/i });

    fireEvent.change(nameInput, { target: { value: '' } });

    // The button should be disabled because the target name is now empty
    await waitFor(() => {
      const footerNextButton = screen.getByRole('button', { name: /^Next$/i });
      expect(footerNextButton).toBeDisabled();
    });
  });

  it('should maintain revealed provider type section and validate new name when target name is changed', async () => {
    // Start with a saved config so the Next button can be enabled
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'openai:gpt-4.1',
          label: 'My Test API',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'openai',
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    // With complete saved config, target type section should be visible
    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // Now the footer Next button should be present and enabled
    const footerNextButton = await screen.findByRole('button', { name: /^Next$/i });
    expect(footerNextButton).toBeEnabled();

    const nameInput = screen.getByRole('textbox', { name: /Target Name/i });
    fireEvent.change(nameInput, { target: { value: 'New Target Name' } });

    expect(screen.getByText('Select Target Type')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^Next$/i })).toBeEnabled();

    fireEvent.change(nameInput, { target: { value: '' } });

    // The button should be disabled because the target name is now empty
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Next$/i })).toBeDisabled();
    });
  });

  it('should display provider list with saved config', async () => {
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'openai:gpt-4.1',
          label: 'My Test API',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'openai',
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    // With complete saved config, target type section should be visible
    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // Provider list is always expanded - both OpenAI and other providers should be visible
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('LangChain')).toBeInTheDocument();
  });

  describe('Custom provider persistence (Issue #6729)', () => {
    it('should show target type section when custom provider is selected (empty id with providerType="custom")', async () => {
      // This test verifies the fix for https://github.com/promptfoo/promptfoo/issues/6729
      // Custom providers have empty id but providerType is set to 'custom'
      const mockSetProviderType = vi.fn();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: {
            id: '', // Empty id - this is intentional for custom providers
            label: 'my-custom-target',
            config: {},
          },
        },
        updateConfig: mockUpdateConfig,
        providerType: 'custom', // This is set when user selects custom provider
        setProviderType: mockSetProviderType,
      });

      renderComponent();

      // The target type section should be visible because we have a complete config
      // (label + providerType='custom', even though id is empty)
      // This is the key fix for issue #6729 - previously this would NOT be shown
      await waitFor(() => {
        expect(screen.getByText('Select Target Type')).toBeInTheDocument();
      });

      // The footer Next button should be present (visible when target type section is shown)
      const footerNextButton = screen.getByRole('button', { name: /^Next$/i });
      expect(footerNextButton).toBeInTheDocument();
    });

    it('should NOT show target type section when no provider is selected (empty id without providerType)', async () => {
      // This verifies we don't accidentally show the section for truly incomplete configs
      // When there's no complete saved config, the component resets to initial state
      const mockSetProviderType = vi.fn();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: {
            id: '',
            label: '', // No label - fresh state
            config: {},
          },
        },
        updateConfig: mockUpdateConfig,
        providerType: undefined, // No provider type selected
        setProviderType: mockSetProviderType,
      });

      renderComponent();

      // The target type section should NOT be visible
      expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();

      // No footer Next button should be present
      expect(screen.queryByRole('button', { name: /^Next$/i })).not.toBeInTheDocument();
    });

    it('should show target type section for standard providers with non-empty id', async () => {
      // This verifies the normal case still works
      const mockSetProviderType = vi.fn();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: {
            id: 'openai:gpt-4.1',
            label: 'my-openai-target',
            config: {},
          },
        },
        updateConfig: mockUpdateConfig,
        providerType: 'openai',
        setProviderType: mockSetProviderType,
      });

      renderComponent();

      // The target type section should be visible
      await waitFor(() => {
        expect(screen.getByText('Select Target Type')).toBeInTheDocument();
      });

      // OpenAI should be displayed in expanded list view
      expect(screen.getByText('OpenAI')).toBeInTheDocument();

      // The footer Next button should be present
      const footerNextButton = screen.getByRole('button', { name: /^Next$/i });
      expect(footerNextButton).toBeInTheDocument();
    });

    it('should allow proceeding to next step with custom provider after entering name', async () => {
      // This test verifies the flow when user selects custom provider and enters a name
      const user = userEvent.setup();
      const mockSetProviderType = vi.fn();
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: {
            id: '', // Empty id for custom provider
            label: '',
            config: {},
          },
        },
        updateConfig: mockUpdateConfig,
        providerType: 'custom', // Custom provider already selected
        setProviderType: mockSetProviderType,
      });

      renderComponent();

      // Enter a target name using userEvent for proper input simulation
      const nameInput = screen.getByRole('textbox', { name: /Target Name/i });
      await user.type(nameInput, 'my-custom-target');

      // Click the inline "Continue" button to reveal the section
      const inlineNextButton = await screen.findByRole('button', {
        name: 'Continue',
      });
      await user.click(inlineNextButton);

      // Wait for target type section to be visible
      await waitFor(() => {
        expect(screen.getByText('Select Target Type')).toBeInTheDocument();
      });

      // The footer Next button should be present and enabled since we have providerType set and label entered
      const footerNextButton = await screen.findByRole('button', { name: /^Next$/i });
      expect(footerNextButton).toBeInTheDocument();

      // Wait for button to become enabled (state updates may be asynchronous)
      await waitFor(() => {
        expect(footerNextButton).toBeEnabled();
      });

      await user.click(footerNextButton);

      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('should preserve custom provider selection after simulated tab navigation', async () => {
      // First render - user has selected custom provider
      const mockSetProviderType = vi.fn();
      const configWithCustomProvider = {
        config: {
          target: {
            id: '',
            label: 'my-custom-target',
            config: {},
          },
        },
        updateConfig: mockUpdateConfig,
        providerType: 'custom',
        setProviderType: mockSetProviderType,
      };

      mockUseRedTeamConfig.mockReturnValue(configWithCustomProvider);

      const { unmount } = renderComponent();

      // Verify target type section is shown
      await waitFor(() => {
        expect(screen.getByText('Select Target Type')).toBeInTheDocument();
      });

      // Simulate navigating away (unmount)
      unmount();

      // Simulate navigating back (re-render with same config from Zustand)
      mockUseRedTeamConfig.mockReturnValue(configWithCustomProvider);
      renderComponent();

      // The target type section should STILL be visible after "tab navigation"
      // This is the KEY behavior we're testing for issue #6729
      await waitFor(() => {
        expect(screen.getByText('Select Target Type')).toBeInTheDocument();
      });

      // The footer Next button should still be present
      const footerNextButton = screen.getByRole('button', { name: /^Next$/i });
      expect(footerNextButton).toBeInTheDocument();
    });
  });
});
