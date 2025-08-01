import { ThemeProvider, createTheme } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
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
    });
  });

  it('should allow user to enter name, reveal types, select one, and proceed', async () => {
    renderComponent();

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeDisabled();
    expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
    expect(nextButton).toHaveTextContent('Next: Select Target Type');

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });
    expect(onNext).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_config_target_type_section_revealed',
    });

    expect(nextButton).toHaveTextContent('Next: Configure Target');
    expect(nextButton).toBeEnabled();

    const openAICard = await screen.findByText('OpenAI');
    fireEvent.click(openAICard.closest('div.MuiPaper-root') as HTMLElement);

    await waitFor(() => {
      expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
        feature: 'redteam_config_target_type_changed',
        target: expect.stringContaining('openai'),
      });
    });
    expect(nextButton).toBeEnabled();
    expect(nextButton).toHaveTextContent('Next: Configure Target');

    fireEvent.click(nextButton);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('should have the Next button disabled and provider type section not visible when target name is empty', () => {
    renderComponent();

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeDisabled();
    expect(screen.queryByText('Select Target Type')).not.toBeInTheDocument();
  });

  it('should update the selectedTarget and providerType when a new provider type is selected and record telemetry event', async () => {
    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const nextButton = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

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

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    fireEvent.change(nameInput, { target: { value: '' } });

    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });

  it('should maintain revealed provider type section and validate new name when target name is changed', async () => {
    renderComponent();

    const nameInput = screen.getByRole('textbox', { name: 'Target Name' });
    fireEvent.change(nameInput, { target: { value: 'My Test API' } });

    const nextButton = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Select Target Type')).toBeInTheDocument();
    });

    fireEvent.change(nameInput, { target: { value: 'New Target Name' } });

    expect(screen.getByText('Select Target Type')).toBeInTheDocument();

    expect(nextButton).toBeEnabled();

    fireEvent.change(nameInput, { target: { value: '' } });

    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });
});
