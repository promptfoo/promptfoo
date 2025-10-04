import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    config: {}, // Mock config object
    getTestSuite: mockGetTestSuite,
    updateConfig: vi.fn(),
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
    // Reset mock to default return value
    mockGetTestSuite.mockReturnValue({
      description: 'Test suite',
      providers: [{ id: 'test-provider' }],
      prompts: ['test prompt'],
      tests: [{ description: 'test case' }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders in read-only mode by default', () => {
    render(<YamlEditorComponent />);

    expect(screen.getByText('Edit YAML')).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor');
    expect(editor).toHaveAttribute('disabled');
  });

  it('switches to edit mode when Edit button is clicked', () => {
    render(<YamlEditorComponent />);

    fireEvent.click(screen.getByRole('button', { name: /Edit YAML/ }));

    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit YAML/ })).not.toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
    expect(editor.disabled).toBe(false);
  });

  it('handles file upload correctly', async () => {
    // File input only appears when in editing mode
    const { container } = render(<YamlEditorComponent />);

    // Click "Edit YAML" button to enter editing mode
    const editButton = screen.getByRole('button', { name: /edit yaml/i });
    fireEvent.click(editButton);

    // Now the file input should be rendered
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', '.yaml,.yml');
    expect(fileInput).toHaveAttribute('hidden');
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
    mockGetTestSuite.mockReturnValue({
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
    mockGetTestSuite.mockReturnValue({
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
    mockGetTestSuite.mockReturnValue({
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
