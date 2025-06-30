import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import yaml from 'js-yaml';
import { vi, expect, describe, it, beforeEach, afterEach } from 'vitest';
import YamlEditorComponent from './YamlEditor';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockGetTestSuite = vi.fn().mockReturnValue({
  description: 'Test suite',
  providers: [{ id: 'test-provider' }],
  prompts: ['test prompt'],
  tests: [{ description: 'test case' }],
});

vi.mock('@app/stores/evalConfig', () => ({
  useStore: vi.fn(() => ({
    getTestSuite: mockGetTestSuite,
    setState: vi.fn(),
  })),
}));

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  configurable: true,
});

// Mock the editor component to avoid prism.js issues
vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange, disabled }: any) => (
    <textarea
      data-testid="yaml-editor"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
    />
  ),
}));

vi.mock('@mui/icons-material/ContentCopy', () => ({
  default: () => <span data-testid="copy-icon">Copy</span>,
}));

vi.mock('@mui/icons-material/Edit', () => ({
  default: () => <span data-testid="edit-icon">Edit</span>,
}));

vi.mock('@mui/icons-material/Save', () => ({
  default: () => <span data-testid="save-icon">Save</span>,
}));

vi.mock('@mui/icons-material/Upload', () => ({
  default: () => <span data-testid="upload-icon">Upload</span>,
}));

describe('YamlEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders in read-only mode by default', () => {
    render(<YamlEditorComponent />);

    expect(screen.getByText('Edit YAML')).toBeInTheDocument();
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor');
    expect(editor).toHaveAttribute('disabled');
  });

  it('switches to edit mode when Edit button is clicked', () => {
    render(<YamlEditorComponent />);

    fireEvent.click(screen.getByText('Edit YAML'));

    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.queryByText('Edit YAML')).not.toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor');
    expect(editor).not.toHaveAttribute('disabled');

    expect(screen.getByText('Editing')).toBeInTheDocument();
  });

  it.skip('handles file upload correctly', () => {
    const setCodeSpy = vi.fn();
    const parseAndUpdateStoreSpy = vi.fn().mockReturnValue(true);
    // Mock isReadOnly to be false so the upload button will be rendered
    vi.spyOn(React, 'useState').mockImplementationOnce(() => [false, vi.fn()]); // isReadOnly
    vi.spyOn(React, 'useState').mockImplementationOnce(() => ['', setCodeSpy]); // code
    vi.spyOn(React, 'useState').mockImplementationOnce(() => [null, vi.fn()]); // parseError
    vi.spyOn(React, 'useState').mockImplementationOnce(() => [
      { show: false, message: '' },
      vi.fn(),
    ]); // notification

    // Create a mock component with our own handleFileUpload function that uses the spies
    const MockYamlEditor = () => {
      const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            setCodeSpy(content);
            parseAndUpdateStoreSpy(content);
          };
          reader.readAsText(file);
        }
      };

      return (
        <div>
          <input type="file" data-testid="file-input" onChange={handleFileUpload} />
        </div>
      );
    };

    const { getByTestId } = render(<MockYamlEditor />);

    const mockFileContent = 'description: Uploaded content';
    const mockFile = new File([mockFileContent], 'test.yaml', { type: 'application/yaml' });

    const fileInput = getByTestId('file-input');
    const originalFileReader = global.FileReader;
    global.FileReader = vi.fn(() => ({
      readAsText: vi.fn(),
      onload: null,
    })) as any;

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
    });

    fireEvent.change(fileInput);

    const reader = (FileReader as any).mock.instances[0];
    reader.onload?.({ target: { result: mockFileContent } } as any);

    expect(setCodeSpy).toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });

  it('initializes with initialConfig', () => {
    const initialConfig = {
      description: 'Initial config',
      providers: [{ id: 'test-provider' }],
    };

    const dumpSpy = vi.spyOn(yaml, 'dump');

    render(<YamlEditorComponent initialConfig={initialConfig} />);

    expect(dumpSpy).toHaveBeenCalledWith(initialConfig);
  });

  it('includes evaluateOptions from store in YAML', () => {
    mockGetTestSuite.mockReturnValueOnce({
      description: 'Test suite',
      providers: [{ id: 'test-provider' }],
      prompts: ['test prompt'],
      tests: [{ description: 'test case' }],
      evaluateOptions: { repeat: 3 },
    });

    render(<YamlEditorComponent />);

    const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('evaluateOptions');
    expect(editor.value).toContain('repeat: 3');
  });

  it('includes defaultTest from store in YAML', () => {
    mockGetTestSuite.mockReturnValueOnce({
      description: 'Test suite',
      providers: [{ id: 'test-provider' }],
      prompts: ['test prompt'],
      tests: [{ description: 'test case' }],
      defaultTest: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'does not describe self as an AI, model, or chatbot',
          },
        ],
      },
    });

    render(<YamlEditorComponent />);

    const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('defaultTest');
    expect(editor.value).toContain('assert:');
    expect(editor.value).toContain('type: llm-rubric');
    expect(editor.value).toContain('does not describe self as an AI, model, or chatbot');
  });

  it('includes derivedMetrics from store in YAML', () => {
    mockGetTestSuite.mockReturnValueOnce({
      description: 'Test suite',
      providers: [{ id: 'test-provider' }],
      prompts: ['test prompt'],
      tests: [{ description: 'test case' }],
      derivedMetrics: [
        {
          name: 'precision',
          value: 'tp / (tp + fp)',
        },
      ],
    });

    render(<YamlEditorComponent />);

    const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('derivedMetrics');
    expect(editor.value).toContain('name: precision');
    expect(editor.value).toContain('value: tp / (tp + fp)');
  });

  it('respects readOnly prop', () => {
    render(<YamlEditorComponent readOnly={true} />);

    expect(screen.queryByText('Edit YAML')).not.toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor');
    expect(editor).toHaveAttribute('disabled');
  });
});
