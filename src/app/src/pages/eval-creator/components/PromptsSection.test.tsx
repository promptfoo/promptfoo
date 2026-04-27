import { TooltipProvider } from '@app/components/ui/tooltip';
import { useStore } from '@app/stores/evalConfig';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PromptsSection from './PromptsSection';

vi.mock('@app/stores/evalConfig');

const mockedUseStore = vi.mocked(useStore);

describe('PromptsSection', () => {
  const mockUpdateConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupStore = (prompts: string[]) => {
    mockedUseStore.mockReturnValue({
      config: { prompts },
      updateConfig: mockUpdateConfig,
    });
  };

  const updateStoreAndRerender = (prompts: string[], rerender: any) => {
    mockedUseStore.mockReturnValue({
      config: { prompts },
      updateConfig: mockUpdateConfig,
    });
    rerender(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );
  };

  type UserEvent = ReturnType<typeof userEvent.setup>;

  const openPromptDialog = async (user: UserEvent) => {
    const addPromptButton = screen.getByRole('button', { name: /add prompt/i });
    await user.click(addPromptButton);
  };

  const fillPromptText = async (user: UserEvent, text: string) => {
    const promptTextarea = screen.getByRole('textbox');
    await user.click(promptTextarea);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(text);
  };

  const submitPromptDialog = async (user: UserEvent) => {
    const addButtonInDialog = screen.getByRole('button', { name: 'Add' });
    await user.click(addButtonInDialog);
  };

  const savePromptDialog = async (user: UserEvent) => {
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);
  };

  const createFileReaderMock = (fileContent: string) => {
    let onloadCallback: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
    const readAsTextMock = vi.fn();

    global.FileReader = class MockFileReader {
      static EMPTY = 0;
      static LOADING = 1;
      static DONE = 2;

      onload: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
      readAsText = readAsTextMock;

      constructor() {
        // Capture the onload handler when it's set
        Object.defineProperty(this, 'onload', {
          get: () => onloadCallback,
          set: (value) => {
            onloadCallback = value;
          },
          configurable: true,
        });

        // Automatically trigger onload after readAsText
        readAsTextMock.mockImplementation(() => {
          onloadCallback?.({ target: { result: fileContent } } as ProgressEvent<FileReader>);
        });
      }
    } as unknown as typeof FileReader;

    return readAsTextMock;
  };

  it('should display a message indicating no prompts are present when the prompts list is empty', () => {
    setupStore([]);

    render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    expect(screen.getByText('No prompts added yet.')).toBeInTheDocument();
  });

  it("should add a new prompt to the list when the 'Add Prompt' button is clicked, the PromptDialog is filled, and the prompt is submitted", async () => {
    const user = userEvent.setup();
    setupStore([]);

    const { rerender } = render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    expect(screen.getByText('No prompts added yet.')).toBeInTheDocument();

    await openPromptDialog(user);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Prompt' })).toBeInTheDocument();

    const newPromptText = 'Write a story about a robot who discovers music.';
    await fillPromptText(user, newPromptText);

    await submitPromptDialog(user);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      prompts: [newPromptText],
    });

    updateStoreAndRerender([newPromptText], rerender);

    expect(screen.getByText(/Write a story about a robot/)).toBeInTheDocument();
    expect(screen.queryByText('No prompts added yet.')).not.toBeInTheDocument();
  });

  it('should update an existing prompt when a prompt row is clicked, the PromptDialog is edited, and the changes are submitted', async () => {
    const user = userEvent.setup();
    const initialPrompt = 'Write a short story about a cat.';
    setupStore([initialPrompt]);

    const { rerender } = render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    expect(screen.getByText(/Write a short story about a cat./)).toBeInTheDocument();

    const promptRow = screen.getByText(/Write a short story about a cat./);
    await user.click(promptRow);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Prompt 1')).toBeInTheDocument();
    const promptTextarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(promptTextarea.value).toBe(initialPrompt);

    const updatedPromptText = 'Write a short story about a dog.';
    await fillPromptText(user, updatedPromptText);

    await savePromptDialog(user);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      prompts: [updatedPromptText],
    });

    updateStoreAndRerender([updatedPromptText], rerender);

    expect(screen.getByText(/Write a short story about a dog./)).toBeInTheDocument();
    expect(screen.queryByText(/Write a short story about a cat./)).toBeNull();
  });

  it('should duplicate a prompt and append it to the list when the duplicate icon is clicked for a prompt row', async () => {
    const user = userEvent.setup();
    const initialPrompt = 'Translate the following sentence to French: {{sentence}}';
    setupStore([initialPrompt]);

    const { rerender } = render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    expect(screen.getByText(/Translate the following sentence to French/)).toBeInTheDocument();

    const duplicateButton = screen.getByRole('button', { name: /duplicate prompt 1/i });
    await user.click(duplicateButton);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      prompts: [initialPrompt, initialPrompt],
    });

    updateStoreAndRerender([initialPrompt, initialPrompt], rerender);

    expect(screen.getAllByText(/Translate the following sentence to French/)).toHaveLength(2);
  });

  it('should remove a prompt from the list when the delete icon is clicked for a prompt row and the deletion is confirmed in the dialog', async () => {
    const user = userEvent.setup();
    const initialPrompts = ['Prompt 1', 'Prompt 2', 'Prompt 3'];
    setupStore(initialPrompts);

    const { rerender } = render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    expect(screen.getByText(/Prompt 1/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt 2/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt 3/)).toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: /delete prompt 2/i });
    await user.click(deleteButton);

    expect(screen.getByRole('dialog', { name: /delete prompt/i })).toBeInTheDocument();

    const confirmDeleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(confirmDeleteButton);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      prompts: ['Prompt 1', 'Prompt 3'],
    });

    updateStoreAndRerender(['Prompt 1', 'Prompt 3'], rerender);

    expect(screen.getByText(/Prompt 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Prompt 2/)).toBeNull();
    expect(screen.getByText(/Prompt 3/)).toBeInTheDocument();
  });

  it("should add an example prompt to the list when the 'Add Example' button is clicked and the prompts list is empty", async () => {
    const user = userEvent.setup();
    setupStore([]);

    render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    const addExampleButton = screen.getByRole('button', { name: /add example/i });
    await user.click(addExampleButton);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      prompts: [
        'Write a short, fun story about a {{animal}} going on an adventure in {{location}}. Make it entertaining and suitable for children.',
      ],
    });
  });

  it('should handle a file with a very long line of text', async () => {
    const user = userEvent.setup();
    const longLineText = 'This is a very long line of text without any line breaks. '.repeat(1000);

    createFileReaderMock(longLineText);

    setupStore([]);

    render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    const file = new File([longLineText], 'long_line.txt', { type: 'text/plain' });
    // Find the hidden file input
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');

    if (!fileInput) {
      throw new Error('File input element not found');
    }

    await user.upload(fileInput, file);

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      prompts: [longLineText],
    });
  });

  it('should handle malformed template variables in prompts without errors', () => {
    const malformedPrompt = 'This is a prompt with an unclosed variable: {{variable';
    setupStore([malformedPrompt]);

    render(
      <TooltipProvider delayDuration={0}>
        <PromptsSection />
      </TooltipProvider>,
    );

    expect(screen.getByText(/This is a prompt with an unclosed variable/)).toBeInTheDocument();
  });
});
