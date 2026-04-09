import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigModal from './ConfigModal';
import { useTableStore } from './store';

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

describe('ConfigModal', () => {
  const mockOnClose = vi.fn();
  const sampleConfig = {
    prompts: ['prompt1', 'prompt2'],
    providers: ['openai:gpt-4'],
    tests: [{ vars: { input: 'test' } }],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useTableStore to return sample config
    vi.mocked(useTableStore).mockReturnValue({
      config: sampleConfig,
    } as ReturnType<typeof useTableStore>);

    // Mock document.execCommand
    document.execCommand = vi.fn();

    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getCopyButton = () => screen.getByRole('button', { name: 'Copy config to clipboard' });
  const getDownloadButton = () => screen.getByRole('button', { name: 'Download config' });

  it('does not render when closed', () => {
    renderWithProviders(<ConfigModal open={false} onClose={mockOnClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Config')).toBeInTheDocument();
  });

  it('displays YAML config in textarea', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const expectedYaml = yaml.dump(sampleConfig);

    expect(textarea.value).toBe(expectedYaml);
  });

  it('textarea is read-only', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute('readonly');
  });

  it('renders copy and download buttons', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    expect(getCopyButton()).toBeInTheDocument();
    expect(getDownloadButton()).toBeInTheDocument();
  });

  it('copies config to clipboard when copy button is clicked', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.select = vi.fn();

    fireEvent.click(getCopyButton());

    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('shows check icon after copying', async () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.select = vi.fn();

    // Click copy button
    fireEvent.click(getCopyButton());

    // After clicking, should show check icon somewhere in the dialog
    await waitFor(() => {
      const checkIcon = getCopyButton().querySelector('.lucide-check');
      expect(checkIcon).toBeTruthy();
    });

    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('downloads config as YAML file when download button is clicked', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    fireEvent.click(getDownloadButton());

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('sets the config download filename', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    fireEvent.click(getDownloadButton());

    const anchor = vi.mocked(HTMLAnchorElement.prototype.click).mock
      .contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('config.yaml');
  });

  it('calls onClose when close button is clicked', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    // Close the dialog by clicking close button
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[0]);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('generates YAML when dialog opens', () => {
    const { rerender } = renderWithProviders(<ConfigModal open={false} onClose={mockOnClose} />);

    // Dialog is closed, no textarea
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Open dialog
    rerender(<ConfigModal open={true} onClose={mockOnClose} />);

    // YAML should be generated
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBeTruthy();
    expect(textarea.value).toContain('prompts');
  });

  it('regenerates YAML when config changes', () => {
    const { rerender } = renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea1 = screen.getByRole('textbox') as HTMLTextAreaElement;
    const initialYaml = textarea1.value;

    // Update the config in the store mock
    const newConfig = {
      prompts: ['new-prompt'],
      providers: ['anthropic:claude-3'],
    };

    vi.mocked(useTableStore).mockReturnValue({
      config: newConfig,
    } as ReturnType<typeof useTableStore>);

    // Rerender with same open prop to trigger useEffect
    rerender(<ConfigModal open={false} onClose={mockOnClose} />);
    rerender(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea2 = screen.getByRole('textbox') as HTMLTextAreaElement;
    const newYaml = textarea2.value;

    expect(newYaml).not.toBe(initialYaml);
    expect(newYaml).toContain('new-prompt');
  });

  it('handles empty config', () => {
    vi.mocked(useTableStore).mockReturnValue({
      config: {},
    } as ReturnType<typeof useTableStore>);

    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('{}\n');
  });

  it('handles null config', () => {
    vi.mocked(useTableStore).mockReturnValue({
      config: null,
    } as ReturnType<typeof useTableStore>);

    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('null\n');
  });

  it('creates blob with correct type for download', () => {
    const blobSpy = vi.spyOn(global, 'Blob');

    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    fireEvent.click(getDownloadButton());

    expect(blobSpy).toHaveBeenCalledWith([expect.any(String)], { type: 'text/yaml;charset=utf-8' });
  });

  it('selects textarea content when copy button is clicked', () => {
    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const selectSpy = vi.spyOn(textarea, 'select');

    fireEvent.click(getCopyButton());

    expect(selectSpy).toHaveBeenCalled();
  });

  it('handles complex nested config', () => {
    const complexConfig = {
      prompts: ['prompt1'],
      providers: ['openai:gpt-4'],
      tests: [
        {
          vars: { input: 'test1' },
          assert: [
            { type: 'equals', value: 'expected' },
            { type: 'contains', value: 'substring' },
          ],
        },
      ],
      defaultTest: {
        options: {
          temperature: 0.7,
          maxTokens: 100,
        },
      },
    };

    vi.mocked(useTableStore).mockReturnValue({
      config: complexConfig,
    } as ReturnType<typeof useTableStore>);

    renderWithProviders(<ConfigModal open={true} onClose={mockOnClose} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const parsedYaml = yaml.load(textarea.value);

    expect(parsedYaml).toEqual(complexConfig);
  });
});
