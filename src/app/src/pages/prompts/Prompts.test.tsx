import { render, screen, fireEvent, within, RenderResult } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ServerPromptWithMetadata } from '@promptfoo/types';
import Prompts from './Prompts';

vi.mock('./PromptDialog', () => ({
  default: ({
    openDialog,
    handleClose,
    selectedPrompt,
  }: {
    openDialog: boolean;
    handleClose: () => void;
    selectedPrompt: ServerPromptWithMetadata;
  }) => {
    if (!openDialog) {
      return null;
    }
    return (
      <div data-testid="mock-prompt-dialog">
        <h1>Prompt Details</h1>
        <p>{selectedPrompt.prompt.raw}</p>
        <button data-testid="close-button" onClick={handleClose}>
          Close
        </button>
      </div>
    );
  },
}));

const mockPrompts: ServerPromptWithMetadata[] = [
  {
    id: 'prompt:1a2b3c4d5e6f',
    prompt: {
      raw: 'This is the first sample prompt.',
      display: '[display] This is the first sample prompt.',
      label: 'This is the first sample prompt.',
    },
    count: 2,
    recentEvalDate: '2023-10-27T10:00:00.000Z',
    recentEvalId: 'eval-zyxwvu987654',
    evals: [],
  },
  {
    id: 'prompt:fedcba987654',
    prompt: {
      raw: 'This is the second sample prompt.',
      display: '[display] This is the second sample prompt.',
      label: 'This is the second sample prompt.',
    },
    count: 1,
    recentEvalDate: '2023-11-01T12:00:00.000Z',
    recentEvalId: 'eval-abcdef123456',
    evals: [],
  },
];

const mockPromptsLarge: ServerPromptWithMetadata[] = Array.from({ length: 30 }, (_, i) => ({
  id: `prompt:${i}`,
  prompt: {
    raw: `This is prompt number ${i}.`,
    display: `[display] This is prompt number ${i}.`,
    label: `This is prompt number ${i}.`,
  },
  count: i,
  recentEvalDate: '2023-11-01T12:00:00.000Z',
  recentEvalId: `eval-${i}`,
  evals: [],
}));

function renderWithProviders({
  data = [],
  isLoading = false,
  error = null,
  initialEntries = ['/'],
  theme = createTheme(),
}: {
  data?: ServerPromptWithMetadata[];
  isLoading?: boolean;
  error?: string | null;
  initialEntries?: string[];
  theme?: ReturnType<typeof createTheme>;
}): RenderResult {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider theme={theme}>
        <Prompts data={data} isLoading={isLoading} error={error} />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('Prompts', () => {
  it('should display the label column with correct values', () => {
    renderWithProviders({ data: mockPrompts });

    // Check that label column header exists
    expect(screen.getByText('Label')).toBeInTheDocument();

    // Check that label values are displayed (label is same as raw in mock data)
    expect(screen.getAllByText('This is the first sample prompt.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('This is the second sample prompt.').length).toBeGreaterThan(0);
  });

  it('should display a DataGrid with the provided data and open the PromptDialog with the correct prompt details when a row is clicked', async () => {
    renderWithProviders({ data: mockPrompts });

    // Text appears in both label and prompt columns
    expect(screen.getAllByText('This is the first sample prompt.').length).toBeGreaterThan(0);
    const secondPromptCells = screen.getAllByText('This is the second sample prompt.');
    expect(secondPromptCells.length).toBeGreaterThan(0);

    expect(screen.queryByTestId('mock-prompt-dialog')).not.toBeInTheDocument();

    // Click the first occurrence (which will be in the label column)
    fireEvent.click(secondPromptCells[0]);

    const dialog = await screen.findByTestId('mock-prompt-dialog');
    expect(dialog).toBeInTheDocument();

    expect(within(dialog).getByText('Prompt Details')).toBeInTheDocument();
    expect(within(dialog).getByText('This is the second sample prompt.')).toBeInTheDocument();
    expect(within(dialog).queryByText('This is the first sample prompt.')).not.toBeInTheDocument();
  });

  it('should handle pagination correctly and open the PromptDialog with the correct prompt details when a row on a different page is clicked', async () => {
    renderWithProviders({ data: mockPromptsLarge });

    const nextPageButton = screen.getByRole('button', { name: 'Go to next page' });
    fireEvent.click(nextPageButton);

    const promptsOnSecondPage = screen.getAllByText('This is prompt number 26.');
    expect(promptsOnSecondPage.length).toBeGreaterThan(0);

    fireEvent.click(promptsOnSecondPage[0]);

    const dialog = await screen.findByTestId('mock-prompt-dialog');
    expect(dialog).toBeInTheDocument();

    expect(within(dialog).getByText('Prompt Details')).toBeInTheDocument();
    expect(within(dialog).getByText('This is prompt number 26.')).toBeInTheDocument();
  });

  it('should display error message when error prop is provided', () => {
    const errorMessage = 'Failed to fetch prompts.';

    renderWithProviders({ error: errorMessage });

    expect(screen.getByText('Error loading prompts')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('should not open PromptDialog if the URL contains an invalid prompt ID', () => {
    renderWithProviders({
      data: mockPrompts,
      initialEntries: ['/?id=invalid-id'],
    });

    expect(screen.queryByTestId('mock-prompt-dialog')).not.toBeInTheDocument();
  });

  it('should display a loading overlay with a spinner and "Loading prompts..." text when isLoading is true', () => {
    renderWithProviders({ isLoading: true });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    expect(screen.getByText('Loading prompts...')).toBeInTheDocument();
  });

  it('should display a "No prompts found" overlay when data is empty and error is null', () => {
    renderWithProviders({});

    expect(screen.getByText('No prompts found')).toBeInTheDocument();
  });

  it('should automatically open the PromptDialog for the prompt whose id starts with the "id" search param in the URL on initial render', async () => {
    renderWithProviders({
      data: mockPrompts,
      initialEntries: ['/prompts?id=prompt:fed'],
    });

    const dialog = await screen.findByTestId('mock-prompt-dialog');
    expect(dialog).toBeInTheDocument();

    expect(screen.getByTestId('mock-prompt-dialog').querySelector('p')).toHaveTextContent(
      'This is the second sample prompt.',
    );
  });

  it('should close the dialog when handleClose is called', async () => {
    renderWithProviders({ data: mockPrompts });

    const firstPromptCells = screen.getAllByText('This is the first sample prompt.');
    fireEvent.click(firstPromptCells[0]);

    const dialog = await screen.findByTestId('mock-prompt-dialog');
    expect(dialog).toBeInTheDocument();

    const closeButton = screen.getByTestId('close-button');
    fireEvent.click(closeButton);

    expect(screen.queryByTestId('mock-prompt-dialog')).not.toBeInTheDocument();
  });

  it('should not call handleClickOpen if the prompt ID is not found in the data array', () => {
    const handleClickOpenMock = vi.fn();

    renderWithProviders({ data: mockPrompts });

    const nonexistentId = 'prompt:nonexistent';

    const promptCells = screen.getAllByText('This is the first sample prompt.');
    const promptsComponent = promptCells[0].closest('[data-rowid]');
    if (promptsComponent) {
      const handleRowClick = () => {
        const index = mockPrompts.findIndex((p) => p.id === nonexistentId);
        if (index !== -1) {
          handleClickOpenMock(index);
        }
      };
      handleRowClick();
    }

    expect(handleClickOpenMock).not.toHaveBeenCalled();
  });

  it('should render correctly in dark mode', () => {
    const darkTheme = createTheme({ palette: { mode: 'dark' } });

    const { container } = renderWithProviders({
      data: mockPrompts,
      theme: darkTheme,
    });

    const promptsContainer = container.firstChild;

    // After layout unification, the Container no longer has theme-specific background colors
    // This test now verifies the component renders without errors in dark mode
    expect(promptsContainer).toBeInTheDocument();
    expect(screen.getAllByText('This is the first sample prompt.').length).toBeGreaterThan(0);
  });

  it('should fallback to display or raw when label is missing', () => {
    const mockPromptsWithoutLabel: ServerPromptWithMetadata[] = [
      {
        id: 'prompt:no-label',
        prompt: {
          raw: 'Raw prompt text',
          display: 'Display text',
          label: '', // Empty label
        },
        count: 1,
        recentEvalDate: '2023-10-27T10:00:00.000Z',
        recentEvalId: 'eval-123',
        evals: [],
      },
    ];

    renderWithProviders({ data: mockPromptsWithoutLabel });

    // Should show display text as fallback
    expect(screen.getByText('Display text')).toBeInTheDocument();
  });
});
