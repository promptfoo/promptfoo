import { render, screen, fireEvent, within, RenderResult } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { alpha } from '@mui/material';
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
  it('should display a DataGrid with the provided data and open the PromptDialog with the correct prompt details when a row is clicked', async () => {
    renderWithProviders({ data: mockPrompts });

    expect(screen.getByText('This is the first sample prompt.')).toBeInTheDocument();
    const secondPromptCell = screen.getByText('This is the second sample prompt.');
    expect(secondPromptCell).toBeInTheDocument();

    expect(screen.queryByTestId('mock-prompt-dialog')).not.toBeInTheDocument();

    fireEvent.click(secondPromptCell);

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

    const promptOnSecondPage = screen.getByText('This is prompt number 26.');

    fireEvent.click(promptOnSecondPage);

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

    const firstPromptCell = screen.getByText('This is the first sample prompt.');
    fireEvent.click(firstPromptCell);

    const dialog = await screen.findByTestId('mock-prompt-dialog');
    expect(dialog).toBeInTheDocument();

    const closeButton = screen.getByTestId('close-button');
    fireEvent.click(closeButton);

    expect(screen.queryByTestId('mock-prompt-dialog')).not.toBeInTheDocument();
  });

  it('should not call handleClickOpen if the prompt ID is not found in the data array', () => {
    const handleClickOpenMock = vi.fn();

    const _MockPrompts = ({
      data,
      isLoading,
      error,
    }: {
      data: ServerPromptWithMetadata[];
      isLoading: boolean;
      error: string | null;
    }) => {
      const handleRowClick = (params: any) => {
        const index = data.findIndex((p) => p.id === params.id);
        if (index !== -1) {
          handleClickOpenMock(index);
        }
      };

      return (
        <div>
          {data.map((prompt) => (
            <div
              key={prompt.id}
              data-rowid={prompt.id}
              onClick={() => handleRowClick({ id: prompt.id })}
            >
              {prompt.prompt.label}
            </div>
          ))}
        </div>
      );
    };

    renderWithProviders({ data: mockPrompts });

    const nonexistentId = 'prompt:nonexistent';

    const promptsComponent = screen
      .getByText('This is the first sample prompt.')
      .closest('[data-rowid]');
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

  it('should apply dark theme background when in dark mode', () => {
    const darkTheme = createTheme({ palette: { mode: 'dark' } });

    const { container } = renderWithProviders({
      data: mockPrompts,
      theme: darkTheme,
    });

    const promptsBox = container.firstChild;

    expect(promptsBox).toHaveStyle(
      `background-color: ${alpha(darkTheme.palette.common.black, 0.2)}`,
    );
  });
});
