import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import yaml from 'js-yaml';
import { vi, expect, describe, it, beforeEach } from 'vitest';
import YamlEditorComponent from './YamlEditor';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@app/stores/evalConfig', () => {
  const mockGetTestSuite = vi.fn().mockReturnValue({
    description: 'Test suite',
    providers: [{ id: 'test-provider' }],
    prompts: ['test prompt'],
    tests: [{ description: 'test case' }],
  });

  return {
    useStore: vi.fn(() => ({
      getTestSuite: mockGetTestSuite,
      setState: vi.fn(),
    })),
  };
});

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

  it('handles file upload correctly', () => {
    const setCodeSpy = vi.fn();
    vi.spyOn(React, 'useState').mockImplementationOnce(() => [true, vi.fn()]); // isReadOnly
    vi.spyOn(React, 'useState').mockImplementationOnce(() => ['', setCodeSpy]); // code

    const mockFileContent = 'description: Uploaded content';
    const mockFile = new File([mockFileContent], 'test.yaml', { type: 'application/yaml' });

    const originalFileReader = global.FileReader;
    global.FileReader = vi.fn(() => ({
      readAsText: vi.fn(),
      onload: null,
    })) as any;

    const { container } = render(<YamlEditorComponent />);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    if (fileInput) {
      Object.defineProperty(fileInput, 'files', {
        value: [mockFile],
      });

      fireEvent.change(fileInput);

      const reader = (FileReader as any).mock.instances[0];
      reader.onload?.({ target: { result: mockFileContent } } as any);

      expect(setCodeSpy).toHaveBeenCalled();
    }

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

  it('respects readOnly prop', () => {
    render(<YamlEditorComponent readOnly={true} />);

    expect(screen.queryByText('Edit YAML')).not.toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor');
    expect(editor).toHaveAttribute('disabled');
  });
});
