import { TooltipProvider } from '@app/components/ui/tooltip';
import { useStore } from '@app/stores/evalConfig';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  default: ({ open }: any) =>
    open ? <div data-testid="test-case-dialog">Test Case Dialog</div> : null,
}));

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
    expect(screen.getByText('Add Example')).toBeInTheDocument();
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

    it('handles empty file upload', async () => {
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

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'The file appears to be empty. Please select a file with content.',
          'error',
        );
      });

      // Check that file input was reset
      expect(fileInput.value).toBe('');
    });

    it('handles file size validation', async () => {
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

      fireEvent.change(fileInput, { target: { files: [file] } });

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

      fireEvent.change(fileInput, { target: { files: [file] } });

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

      fireEvent.change(fileInput, { target: { files: [file] } });

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

      fireEvent.change(fileInput, { target: { files: [file] } });

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

      fireEvent.change(fileInput, { target: { files: [file] } });

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

      fireEvent.change(fileInput, { target: { files: [file] } });

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

    it('handles YAML file with no valid test cases', async () => {
      const mockYamlData = [
        // These are actually valid objects that pass the isValidTestCase check
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

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        // The first object is actually valid (it's an object), so we expect a warning about skipped items
        expect(mockShowToast).toHaveBeenCalledWith(
          'Warning: 2 invalid test cases were skipped.',
          'warning',
        );
        expect(mockShowToast).toHaveBeenCalledWith('Successfully imported 1 test case', 'success');
      });
    });

    it('handles YAML file with all invalid test cases', async () => {
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

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid test cases found in YAML file. Please ensure test cases have proper structure.',
          'error',
        );
      });
    });

    it('handles invalid YAML format', async () => {
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

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Invalid YAML format. Expected an array of test cases or a single test case object with valid structure.',
          'error',
        );
      });
    });

    it('handles file parsing errors gracefully', async () => {
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

      fireEvent.change(fileInput, { target: { files: [file] } });

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
    it('can duplicate a test case', () => {
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
      const duplicateButton = screen.getByRole('button', { name: 'Duplicate test case' });
      fireEvent.click(duplicateButton);

      expect(mockUpdateConfig).toHaveBeenCalledWith({
        tests: [
          testCases[0],
          testCases[0], // Duplicated
        ],
      });
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
      const deleteButton = screen.getByRole('button', { name: 'Delete test case' });
      await act(async () => {
        fireEvent.click(deleteButton);
      });

      // Confirm deletion
      const confirmButton = screen.getByText('Delete');
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      expect(mockUpdateConfig).toHaveBeenCalledWith({
        tests: [],
      });
    });
  });
});
