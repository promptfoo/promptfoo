import { TooltipProvider } from '@app/components/ui/tooltip';
import { useStore } from '@app/stores/evalConfig';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestCaseDialog from './TestCaseDialog';
import TestCasesSection from './TestCasesSection';

// Mock the store
vi.mock('@app/stores/evalConfig');

// Mock useToast
const mockShowToast = vi.fn();
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

// Mock testCaseFromCsvRow
vi.mock('@promptfoo/csv', () => ({
  testCaseFromCsvRow: vi.fn(),
}));

// Mock js-yaml
vi.mock('js-yaml', () => ({
  load: vi.fn(),
}));

// Mock TestCaseDialog to avoid rendering issues
vi.mock('./TestCaseDialog', () => ({
  default: vi.fn(({ open }: any) =>
    open ? <div data-testid="test-case-dialog">Test Case Dialog</div> : null,
  ),
}));

const mockTestCaseDialog = vi.mocked(TestCaseDialog);

describe('TestCasesSection', () => {
  const mockUpdateConfig = vi.fn();
  const mockConfig = { tests: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowToast.mockClear();
    (useStore as any).mockReturnValue({
      config: mockConfig,
      updateConfig: mockUpdateConfig,
    });
  });

  it('renders correctly with no test cases', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );
    expect(screen.getByText('Test Cases')).toBeInTheDocument();
    expect(screen.getByText('Add Starter Example')).toBeInTheDocument();
    expect(
      screen.getByText(/starter example uses your prompt variables when available/i),
    ).toBeInTheDocument();
  });

  it('renders existing test cases', () => {
    const testCases = [
      {
        description: 'Test 1',
        vars: { input: 'hello' },
        assert: [{ type: 'contains', value: 'hi' }],
      },
    ];
    (useStore as any).mockReturnValue({
      config: { tests: testCases },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );
    expect(screen.getByText('Test 1')).toBeInTheDocument();
  });

  it('opens an existing test case from the keyboard', async () => {
    const user = userEvent.setup();
    (useStore as any).mockReturnValue({
      config: {
        tests: [
          {
            description: 'Test 1',
            vars: { input: 'hello' },
            assert: [{ type: 'contains', value: 'hi' }],
          },
        ],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );

    const testCaseRow = screen.getByRole('button', { name: 'Open test case 1 for editing' });
    testCaseRow.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('test-case-dialog')).toBeInTheDocument();
  });

  it('exposes missing variables to assistive technology', () => {
    (useStore as any).mockReturnValue({
      config: {
        providers: [{ id: 'openai:gpt-4.1' }],
        prompts: ['Hello {{input}}'],
        tests: [
          {
            description: 'Test 1',
            vars: {},
          },
        ],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={['input']} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Missing variables: input.')).toHaveClass('sr-only');
  });

  it('exposes imported assertion values that must be completed before running', () => {
    (useStore as any).mockReturnValue({
      config: {
        tests: [
          {
            description: 'Imported test',
            assert: [{ type: 'contains', value: '' }],
          },
        ],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );

    expect(
      screen.getByText('Assertion issue: Enter an expected value before saving this check.'),
    ).toHaveClass('sr-only');
  });

  it('exposes variables required by context assertions to assistive technology', () => {
    (useStore as any).mockReturnValue({
      config: {
        tests: [
          {
            description: 'Retrieved answer',
            assert: [{ type: 'context-faithfulness' }],
            vars: {},
          },
        ],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Context assertions need values for: query, context.')).toHaveClass(
      'sr-only',
    );
  });

  it('does not report variables supplied by default test values as missing', () => {
    (useStore as any).mockReturnValue({
      config: {
        providers: [{ id: 'openai:gpt-4.1' }],
        prompts: ['Hello {{input}}'],
        defaultTest: { vars: { input: 'shared input' } },
        tests: [{ description: 'Test 1', vars: {} }],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={['input']} />
      </TooltipProvider>,
    );

    expect(screen.queryByText('Missing variables: input.')).toBeNull();
  });

  it('does not report variables from prompts excluded by test-case routing', () => {
    (useStore as any).mockReturnValue({
      config: {
        providers: [{ id: 'openai:gpt-4.1' }],
        prompts: [
          { raw: 'Write about {{topic}}', label: 'Topic prompt' },
          { raw: 'Reveal {{secret}}', label: 'Other prompt' },
        ],
        tests: [
          {
            description: 'Topic only',
            prompts: ['Topic prompt'],
            vars: { topic: 'reliability' },
          },
        ],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={['topic', 'secret']} />
      </TooltipProvider>,
    );

    expect(screen.queryByText('Missing variables: secret.')).toBeNull();
  });

  it('passes inherited default assertions and variables to the test-case dialog', async () => {
    const user = userEvent.setup();
    const defaultTest = {
      assert: [{ type: 'context-relevance' }],
      vars: { query: 'What changed?', context: 'The release includes a new API.' },
    };
    (useStore as any).mockReturnValue({
      config: { defaultTest, tests: [] },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(mockTestCaseDialog.mock.lastCall?.[0]).toMatchObject({
      inheritedAssertions: defaultTest.assert,
      inheritedVars: defaultTest.vars,
    });
  });

  it('adds a deterministic starter example without silently enabling model grading', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={['animal', 'location']} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add Starter Example' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      tests: [
        {
          description: 'Fun animal adventure story',
          vars: {
            animal: 'penguin',
            location: 'tropical island',
          },
          assert: [
            {
              type: 'contains-any',
              value: ['penguin', 'adventure', 'tropical', 'island'],
            },
          ],
        },
      ],
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      'Starter test case added. By default it runs across every prompt and provider; YAML routing can narrow that set.',
      'success',
    );
    expect(mockUpdateConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({
        tests: expect.arrayContaining([
          expect.objectContaining({
            assert: expect.arrayContaining([expect.objectContaining({ type: 'llm-rubric' })]),
          }),
        ]),
      }),
    );
  });

  it('fills custom prompt variables when adding a starter example', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={['question', 'target_audience']} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add Starter Example' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      tests: [
        {
          description: 'Starter example',
          vars: {
            question: 'example question',
            target_audience: 'example target audience',
          },
          assert: [
            {
              type: 'contains-any',
              value: ['example question', 'example target audience'],
            },
          ],
        },
      ],
    });
  });

  it('shows a YAML-managed state for scalar test configs and opens the YAML editor', async () => {
    const user = userEvent.setup();
    const onOpenYamlEditor = vi.fn();
    (useStore as any).mockReturnValue({
      config: { tests: 'file://tests.csv' },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} onOpenYamlEditor={onOpenYamlEditor} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Managed in YAML')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Managed in YAML');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('file://tests.csv')).toBeInTheDocument();
    expect(
      screen.getByText('Test entries from YAML are not editable in the UI editor.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Test Case' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit YAML' }));

    expect(onOpenYamlEditor).toHaveBeenCalledTimes(1);
  });

  it('shows a YAML-managed state for generated test configs', () => {
    (useStore as any).mockReturnValue({
      config: { tests: { path: 'file://generate-tests.js' } },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Managed in YAML')).toBeInTheDocument();
    expect(screen.getByText('file://generate-tests.js')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong:')).toBeNull();
  });

  it('routes advanced inline test cases to YAML to avoid lossy form edits', async () => {
    const user = userEvent.setup();
    const onOpenYamlEditor = vi.fn();
    (useStore as any).mockReturnValue({
      config: {
        tests: [
          {
            description: 'Advanced test',
            vars: { topic: 'safety' },
            options: { runSerially: true },
            assert: [
              {
                type: 'assert-set',
                assert: [{ type: 'contains', value: 'safe' }],
              },
            ],
          },
        ],
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <TooltipProvider delayDuration={0}>
        <TestCasesSection varsList={[]} onOpenYamlEditor={onOpenYamlEditor} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('note')).toHaveTextContent(
      'advanced YAML settings or assertion groups',
    );
    expect(
      screen.getByText('Advanced test entries are edited in YAML to preserve their settings.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add Test Case' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit YAML' }));
    expect(onOpenYamlEditor).toHaveBeenCalledTimes(1);
  });

  describe('File Upload', () => {
    // Helper to create FileReader mock
    const createFileReaderMock = (fileContent: string) => {
      let onloadCallback: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
      const readAsTextMock = vi.fn();

      global.FileReader = class MockFileReader {
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
            setTimeout(() => {
              onloadCallback?.({ target: { result: fileContent } } as ProgressEvent<FileReader>);
            }, 0);
          });
        }
      } as unknown as typeof FileReader;

      return readAsTextMock;
    };

    const createFileReaderErrorMock = () => {
      global.FileReader = class MockFileReader {
        onerror: ((event: ProgressEvent<FileReader>) => unknown) | null = null;

        readAsText() {
          setTimeout(() => {
            this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
          }, 0);
        }
      } as unknown as typeof FileReader;
    };

    const confirmPendingImport = async (
      user: ReturnType<typeof userEvent.setup>,
      count: number,
    ) => {
      const plural = count === 1 ? '' : 's';
      const confirmButton = await screen.findByRole('button', {
        name: `Import ${count} test case${plural}`,
      });
      await user.click(confirmButton);
    };

    it('accepts CSV, YAML, and YML files', () => {
      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );
      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('accept', '.csv,.yaml,.yml');
    });

    it('opens test case file selection from a keyboard-operable import button', async () => {
      const user = userEvent.setup();

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen.getByLabelText(
        'Upload test cases from CSV or YAML',
      ) as HTMLInputElement;
      const openPicker = vi.spyOn(fileInput, 'click');
      const importButton = screen.getByRole('button', { name: 'Import CSV or YAML' });

      importButton.focus();
      await user.keyboard('{Enter}');

      expect(openPicker).toHaveBeenCalledOnce();
    });

    it('handles empty file upload', async () => {
      const user = userEvent.setup();
      createFileReaderMock('');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([''], 'empty.csv', { type: 'text/csv' });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'The file appears to be empty. Please select a file with content.',
          'error',
        );
      });

      // Check that file input was reset
      expect(fileInput.value).toBe('');
    });

    it('reports file read failures with a recoverable message', async () => {
      const user = userEvent.setup();
      createFileReaderErrorMock();

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen.getByLabelText(
        'Upload test cases from CSV or YAML',
      ) as HTMLInputElement;

      await user.upload(fileInput, new File(['unreadable'], 'test.csv', { type: 'text/csv' }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Unable to read this file. Please try again or choose another file.',
          'error',
        );
      });
      expect(fileInput.value).toBe('');
    });

    it('handles file size validation', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

      // Create a file that reports a size larger than 50MB without allocating it
      const file = new File(['x'], 'large.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'size', {
        value: 51 * 1024 * 1024,
        configurable: true,
      });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'File size exceeds 50MB limit. Please use a smaller file.',
          'error',
        );
      });

      // Check that file input was reset
      expect(fileInput.value).toBe('');
    });

    it('handles unsupported file types', async () => {
      createFileReaderMock('some content');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['some content'], 'test.txt', { type: 'text/plain' });

      // Bypass the browser accept filter to exercise the defensive unsupported-file branch.
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Unsupported file type. Please upload a CSV (.csv) or YAML (.yaml, .yml) file.',
          'error',
        );
      });

      // Check that file input was reset
      expect(fileInput.value).toBe('');
    });

    it('handles CSV file upload without auto-generating descriptions', async () => {
      const user = userEvent.setup();
      const mockCsvData = [
        { question: 'What is 2+2?', expected: '4' },
        { question: 'Capital of France?', expected: 'Paris' },
      ];

      // Mock the dynamic import for csv-parse/browser/esm/sync
      vi.doMock('csv-parse/browser/esm/sync', () => ({
        parse: vi.fn().mockReturnValue(mockCsvData),
      }));

      (testCaseFromCsvRow as any).mockImplementation((row: any) => ({
        vars: { question: row.question },
        assert: [{ type: 'equals', value: row.expected }],
        // Note: no description returned - simulating CSV behavior
      }));

      createFileReaderMock('question,expected\nWhat is 2+2?,4');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['question,expected\nWhat is 2+2?,4'], 'test.csv', {
        type: 'text/csv',
      });

      await user.upload(fileInput, file);
      expect(
        await screen.findByText(/Review routing to understand request count and potential cost/i),
      ).toBeInTheDocument();
      expect(mockUpdateConfig).not.toHaveBeenCalled();
      await confirmPendingImport(user, 2);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith({
          tests: [
            {
              vars: { question: 'What is 2+2?' },
              assert: [{ type: 'equals', value: '4' }],
              // No description should be auto-generated for CSV
            },
            {
              vars: { question: 'Capital of France?' },
              assert: [{ type: 'equals', value: 'Paris' }],
              // No description should be auto-generated for CSV
            },
          ],
        });
      });

      expect(mockShowToast).toHaveBeenCalledWith('Successfully imported 2 test cases', 'success');
    });

    it('handles YAML file upload with array of test cases', async () => {
      const user = userEvent.setup();
      const mockYamlData = [
        {
          description: 'Math test',
          vars: { question: 'What is 5+7?' },
          assert: [{ type: 'equals', value: '12' }],
        },
        {
          vars: { topic: 'AI' },
          assert: [{ type: 'contains', value: 'artificial' }],
        },
      ];

      vi.mocked(yaml.load).mockReturnValue(mockYamlData);

      createFileReaderMock('- description: Math test');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['- description: Math test'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);
      await confirmPendingImport(user, 2);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith({
          tests: [
            {
              description: 'Math test',
              vars: { question: 'What is 5+7?' },
              assert: [{ type: 'equals', value: '12' }],
            },
            {
              vars: { topic: 'AI' },
              assert: [{ type: 'contains', value: 'artificial' }],
              description: 'Test Case #2',
            },
          ],
        });
      });

      expect(mockShowToast).toHaveBeenCalledWith('Successfully imported 2 test cases', 'success');
    });

    it('handles YAML file upload with single test case', async () => {
      const user = userEvent.setup();
      const mockYamlData = {
        description: 'Single test',
        vars: { input: 'hello' },
        assert: [{ type: 'contains', value: 'world' }],
      };

      vi.mocked(yaml.load).mockReturnValue(mockYamlData);

      createFileReaderMock('description: Single test');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['description: Single test'], 'test.yml', { type: 'text/yaml' });

      await user.upload(fileInput, file);
      await confirmPendingImport(user, 1);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith({
          tests: [
            {
              description: 'Single test',
              vars: { input: 'hello' },
              assert: [{ type: 'contains', value: 'world' }],
            },
          ],
        });
      });

      expect(mockShowToast).toHaveBeenCalledWith('Successfully imported 1 test case', 'success');
    });

    it('validates YAML test case structure and skips invalid entries', async () => {
      const user = userEvent.setup();
      const mockYamlData = [
        {
          description: 'Valid test',
          vars: { question: 'What is 5+7?' },
          assert: [{ type: 'equals', value: '12' }],
        },
        {
          // Invalid: vars is a string instead of object
          vars: 'invalid vars',
          assert: [{ type: 'contains', value: 'test' }],
        },
        {
          // Invalid: assert is not an array
          vars: { topic: 'AI' },
          assert: 'invalid assert',
        },
        {
          // Valid test
          vars: { question: 'What is AI?' },
          assert: [{ type: 'contains', value: 'artificial' }],
        },
      ];

      vi.mocked(yaml.load).mockReturnValue(mockYamlData);

      createFileReaderMock('- description: Test');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['- description: Test'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);
      expect(await screen.findByText('Some entries will not be imported')).toBeInTheDocument();
      await confirmPendingImport(user, 2);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Warning: 2 invalid test cases were skipped.',
          'warning',
        );
        expect(mockShowToast).toHaveBeenCalledWith('Successfully imported 2 test cases', 'success');
        expect(mockUpdateConfig).toHaveBeenCalledWith({
          tests: [
            {
              description: 'Valid test',
              vars: { question: 'What is 5+7?' },
              assert: [{ type: 'equals', value: '12' }],
            },
            {
              vars: { question: 'What is AI?' },
              assert: [{ type: 'contains', value: 'artificial' }],
              description: 'Test Case #2', // Auto-generated with proper casing
            },
          ],
        });
      });
    });

    it('rejects YAML files containing only unknown test-case fields', async () => {
      const user = userEvent.setup();
      const mockYamlData = [
        {
          'not a valid test case': true,
        },
        'string instead of object',
        null,
      ];

      vi.mocked(yaml.load).mockReturnValue(mockYamlData);

      createFileReaderMock('invalid');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['invalid'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid test cases found in YAML file. Please ensure test cases have proper structure.',
          'error',
        );
      });
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('lets users cancel a parsed import before it changes the evaluation', async () => {
      const user = userEvent.setup();
      vi.mocked(yaml.load).mockReturnValue({
        description: 'Single test',
        vars: { input: 'hello' },
      });
      createFileReaderMock('description: Single test');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen.getByLabelText(
        'Upload test cases from CSV or YAML',
      ) as HTMLInputElement;
      const file = new File(['description: Single test'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);
      expect(
        await screen.findByRole('dialog', { name: 'Import 1 test case?' }),
      ).toHaveAccessibleDescription(/Imported cases may include YAML routing/);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockUpdateConfig).not.toHaveBeenCalled();
      expect(screen.queryByText('Import 1 test case?')).not.toBeInTheDocument();
      expect(mockShowToast).not.toHaveBeenCalledWith(
        'Successfully imported 1 test case',
        'success',
      );
    });

    it('handles YAML file with all invalid test cases', async () => {
      const user = userEvent.setup();
      const mockYamlData = ['string instead of object', null, undefined, 123, true];

      vi.mocked(yaml.load).mockReturnValue(mockYamlData);

      createFileReaderMock('invalid');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['invalid'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid test cases found in YAML file. Please ensure test cases have proper structure.',
          'error',
        );
      });
    });

    it('handles invalid YAML format', async () => {
      const user = userEvent.setup();
      vi.mocked(yaml.load).mockReturnValue('invalid string');

      createFileReaderMock('invalid yaml');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['invalid yaml'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Invalid YAML format. Expected an array of test cases or a single test case object with valid structure.',
          'error',
        );
      });
    });

    it('handles file parsing errors gracefully', async () => {
      const user = userEvent.setup();
      vi.mocked(yaml.load).mockImplementation(() => {
        throw new Error('YAML parsing failed');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      createFileReaderMock('bad yaml');

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      const fileInput = screen
        .getByLabelText('Upload test cases from CSV or YAML')
        .parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['bad yaml'], 'test.yaml', { type: 'text/yaml' });

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith(
          'Failed to parse YAML file. Please ensure it contains valid YAML syntax.',
          'error',
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Test Case Actions', () => {
    it('can duplicate a test case', async () => {
      const user = userEvent.setup();
      const testCases = [
        {
          description: 'Original test',
          vars: { input: 'test' },
          assert: [{ type: 'equals', value: 'result' }],
        },
      ];
      (useStore as any).mockReturnValue({
        config: { tests: testCases },
        updateConfig: mockUpdateConfig,
      });

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      // Find the duplicate button by aria-label
      const duplicateButton = screen.getByRole('button', { name: 'Duplicate test case 1' });
      await user.click(duplicateButton);

      expect(mockUpdateConfig).toHaveBeenCalledWith({
        tests: [
          testCases[0],
          testCases[0], // Duplicated
        ],
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        'Test case duplicated with its prompt and provider routing.',
        'success',
      );
    });

    it('can delete a test case with confirmation', async () => {
      const testCases = [
        {
          description: 'Test to delete',
          vars: { input: 'test' },
        },
      ];
      (useStore as any).mockReturnValue({
        config: { tests: testCases },
        updateConfig: mockUpdateConfig,
      });

      render(
        <TooltipProvider delayDuration={0}>
          <TestCasesSection varsList={[]} />
        </TooltipProvider>,
      );

      // Find the delete button by aria-label
      const deleteButton = screen.getByRole('button', { name: 'Delete test case 1' });
      await act(async () => {
        const user = userEvent.setup();
        await user.click(deleteButton);
      });

      expect(
        screen.getByRole('dialog', { name: 'Delete test case 1?' }),
      ).toHaveAccessibleDescription(
        /This removes test case 1 from this evaluation. This action cannot be undone. Future runs will no longer include it./,
      );
      expect(screen.getByText(/this is your only test case/i)).toBeInTheDocument();
      expect(screen.getByText(/add another test case before you can run/i)).toBeInTheDocument();

      // Confirm deletion
      const confirmButton = screen.getByText('Delete');
      await act(async () => {
        const user = userEvent.setup();
        await user.click(confirmButton);
      });

      expect(mockUpdateConfig).toHaveBeenCalledWith({
        tests: [],
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        'Test case 1 deleted. Future runs no longer include it.',
        'success',
      );
    });
  });
});
