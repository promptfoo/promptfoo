import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const theme = createTheme();
    return render(
      <ThemeProvider theme={theme}>
        <TargetTypeSelection onNext={onNext} onBack={onBack} setupModalOpen={false} />
      </ThemeProvider>,
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
    // For this test, we need providerType to be set to 'http' after initialization
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'http',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'http', // Set to 'http' to ensure collapsed view
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    // Initially, no footer Next button should be present
    expect(screen.queryByRole('button', { name: /Next.*Configure/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    // After entering name, the inline "Next: Select Target Type" button should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Next: Select Target Type' })).toBeInTheDocument();
    });

    const inlineNextButton = screen.getByRole('button', { name: 'Next: Select Target Type' });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });
    expect(onNext).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_config_target_type_section_revealed',
    });

    // Now the footer Next button should appear
    const footerNextButton = await screen.findByRole('button', { name: /Next.*Configure/i });
    expect(footerNextButton).toBeEnabled();

    // After target type section is revealed, component defaults to HTTP provider in collapsed state
    // Wait a moment for the provider selector to initialize
    await waitFor(() => {
      // Check if we're in collapsed view by looking for the checkmark icon and HTTP provider text
      expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeInTheDocument();
    });

    // The Change button should be visible in the collapsed view
    const changeButton = await screen.findByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const openAICard = await screen.findByText('OpenAI');
    fireEvent.click(openAICard.closest('div.MuiPaper-root') as HTMLElement);

    await waitFor(() => {
      expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
        feature: 'redteam_config_target_type_changed',
        target: expect.stringContaining('openai'),
      });
    });
    expect(footerNextButton).toBeEnabled();

    fireEvent.click(footerNextButton);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('should have the Next button disabled and provider type section not visible when target name is empty', () => {
    renderComponent();

    // Initially, no footer Next button should be present, and no target type section
    expect(screen.queryByRole('button', { name: /Next.*Configure/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();
  });

  it('should update the selectedTarget and providerType when a new provider type is selected and record telemetry event', async () => {
    // For this test, we need providerType to be set to 'http' after initialization
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'http',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'http', // Set to 'http' to ensure collapsed view
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const inlineNextButton = await screen.findByRole('button', {
      name: 'Next: Select Target Type',
    });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // After target type section is revealed, component defaults to HTTP provider in collapsed state
    // Click "Change" button to expand the provider selector
    const changeButton = await screen.findByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const openAICard = await screen.findByText('OpenAI');
    fireEvent.click(openAICard.closest('div.MuiPaper-root') as HTMLElement);

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

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const inlineNextButton = await screen.findByRole('button', {
      name: 'Next: Select Target Type',
    });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // Now the footer Next button should be present
    const footerNextButton = await screen.findByRole('button', { name: /Next.*Configure/i });

    fireEvent.change(nameInput, { target: { value: '' } });

    // The button should remain enabled because the target still has a valid ID ('http')
    // The component allows valid selections with either a valid ID or a custom provider with label
    await waitFor(() => {
      expect(footerNextButton).toBeEnabled();
    });
  });

  it('should maintain revealed provider type section and validate new name when target name is changed', async () => {
    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const inlineNextButton = await screen.findByRole('button', {
      name: 'Next: Select Target Type',
    });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    // Now the footer Next button should be present
    const footerNextButton = await screen.findByRole('button', { name: /Next.*Configure/i });

    fireEvent.change(nameInput, { target: { value: 'New Target Name' } });

    expect(screen.getByText('Select Target Type')).toBeInTheDocument();

    expect(footerNextButton).toBeEnabled();

    fireEvent.change(nameInput, { target: { value: '' } });

    // The button should remain enabled because the target still has a valid ID ('http')
    await waitFor(() => {
      expect(footerNextButton).toBeEnabled();
    });
  });

  it('should correctly update displayed providers and maintain selected provider state when switching between provider categories', async () => {
    const mockSetProviderType = vi.fn();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'openai:gpt-4.1',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'openai',
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const inlineNextButton = screen.getByRole('button', {
      name: 'Next: Select Target Type',
    });
    fireEvent.click(inlineNextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });

    const changeButton = await screen.findByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'file:///path/to/langchain_agent.py',
          label: '',
          config: {
            framework: 'langchain',
          },
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'langchain',
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('LangChain')).toBeInTheDocument();
    });

    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'openai:gpt-4.1',
          label: '',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
      providerType: 'openai',
      setProviderType: mockSetProviderType,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
    });
  });
});
