import React from 'react';

import { mockClipboard, mockObjectUrl } from '@app/tests/browserMocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YamlEditorComponent from './YamlEditor';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// Mock useToast
const mockShowToast = vi.fn();
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
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
    mockClipboard();
    mockObjectUrl('blob:yaml-editor-test');

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

  it('renders in editing mode by default', () => {
    render(<YamlEditorComponent />);

    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Discard Changes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download YAML/ })).toBeInTheDocument();
    expect(screen.getByText('Run in CLI')).toBeInTheDocument();
    expect(screen.getByText('promptfoo eval -c promptfooconfig.yaml')).toBeInTheDocument();

    const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
    expect(editor.disabled).toBe(false);
  });

  it('downloads the current YAML when Download YAML is clicked', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<YamlEditorComponent />);

    await user.click(screen.getByRole('button', { name: /Download YAML/ }));

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:yaml-editor-test');
    expect(mockShowToast).toHaveBeenCalledWith('Downloaded promptfooconfig.yaml', 'success');
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

    // Action bar should be hidden when readOnly is true
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard Changes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download YAML/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Run in CLI')).not.toBeInTheDocument();

    // Editor should still be rendered
    const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
    expect(editor).toBeInTheDocument();
  });

  describe('handleCancel button state', () => {
    it('should have Discard Changes button disabled when no unsaved changes', () => {
      render(<YamlEditorComponent />);

      const discardButton = screen.getByRole('button', { name: /Discard Changes/ });
      const saveButton = screen.getByRole('button', { name: /Save/ });

      // Both buttons should be disabled initially (no changes)
      expect(discardButton).toBeDisabled();
      expect(saveButton).toBeDisabled();
    });

    it('should enable Discard Changes button when code is modified', async () => {
      const user = userEvent.setup();
      render(<YamlEditorComponent />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      const discardButton = screen.getByRole('button', { name: /Discard Changes/ });
      const saveButton = screen.getByRole('button', { name: /Save/ });

      // Initially disabled
      expect(discardButton).toBeDisabled();
      expect(saveButton).toBeDisabled();

      await user.click(editor);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('description: Modified content');

      // Both buttons should be enabled now
      expect(discardButton).not.toBeDisabled();
      expect(saveButton).not.toBeDisabled();
    });

    it('should disable Discard Changes button after discarding changes', async () => {
      const user = userEvent.setup();
      render(<YamlEditorComponent />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      const discardButton = screen.getByRole('button', { name: /Discard Changes/ });

      await user.click(editor);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('description: Modified content');

      // Button should be enabled
      expect(discardButton).not.toBeDisabled();

      await user.click(discardButton);

      // Button should be disabled again
      expect(discardButton).toBeDisabled();
      expect(mockShowToast).toHaveBeenCalledWith('Changes discarded', 'info');
    });

    it('should show unsaved changes indicator when hasUnsavedChanges is true', async () => {
      const user = userEvent.setup();
      render(<YamlEditorComponent />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;

      // Initially no indicator
      expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();

      await user.click(editor);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('description: Modified content');

      // Unsaved changes indicator should appear
      expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    });

    it('should disable both Save and Discard buttons after successful save', async () => {
      const user = userEvent.setup();
      const mockUpdateConfig = vi.fn();
      vi.mocked(
        vi.fn(() => ({
          config: {},
          getTestSuite: mockGetTestSuite,
          updateConfig: mockUpdateConfig,
          setState: vi.fn(),
        })),
      );

      render(<YamlEditorComponent />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      const saveButton = screen.getByRole('button', { name: /Save/ });
      const discardButton = screen.getByRole('button', { name: /Discard Changes/ });

      await user.click(editor);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('description: Valid YAML content');

      // Buttons should be enabled
      expect(saveButton).not.toBeDisabled();
      expect(discardButton).not.toBeDisabled();

      await user.click(saveButton);

      // Both buttons should be disabled after successful save
      expect(saveButton).toBeDisabled();
      expect(discardButton).toBeDisabled();
      expect(mockShowToast).toHaveBeenCalledWith('Configuration saved successfully', 'success');
    });

    it('should keep Discard Changes button enabled when save fails with parse error', async () => {
      const user = userEvent.setup();
      render(<YamlEditorComponent />);

      const editor = screen.getByTestId('yaml-editor') as HTMLTextAreaElement;
      const saveButton = screen.getByRole('button', { name: /Save/ });
      const discardButton = screen.getByRole('button', { name: /Discard Changes/ });

      await user.click(editor);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('invalid: yaml: content: ::');

      // Buttons should be enabled
      expect(saveButton).not.toBeDisabled();
      expect(discardButton).not.toBeDisabled();

      await user.click(saveButton);

      // Discard button should still be enabled (user can still discard the invalid changes)
      expect(discardButton).not.toBeDisabled();
      expect(saveButton).not.toBeDisabled(); // Save button stays enabled too
    });
  });
});
