import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProviderConfigDialog from './ProviderConfigDialog';

describe('ProviderConfigDialog', () => {
  const defaultProps = {
    open: true,
    providerId: 'openai:gpt-4',
    config: {},
    onClose: vi.fn(),
    onSave: vi.fn(),
  };

  it('renders when open is true', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<ProviderConfigDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays provider ID', () => {
    render(<ProviderConfigDialog {...defaultProps} providerId="openai:gpt-4" />);

    expect(screen.getByText('openai:gpt-4')).toBeInTheDocument();
  });

  it('renders Cancel and Save buttons', () => {
    render(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProviderConfigDialog {...defaultProps} onClose={onClose} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when dialog is closed via onOpenChange', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProviderConfigDialog {...defaultProps} onClose={onClose} />);

    // Simulate closing the dialog by pressing Escape key
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSave with providerId and config when Save is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { temperature: 0.7 };

    render(
      <ProviderConfigDialog
        {...defaultProps}
        onSave={onSave}
        providerId="openai:gpt-4"
        config={config}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', config);
  });

  it('renders string config values as text inputs', () => {
    const config = { model: 'gpt-4', apiKey: 'sk-test' };
    render(<ProviderConfigDialog {...defaultProps} config={config} />);

    expect(screen.getByLabelText('model')).toHaveValue('gpt-4');
    expect(screen.getByLabelText('apiKey')).toHaveValue('sk-test');
  });

  it('renders number config values as number inputs', () => {
    const config = { temperature: 0.7, maxTokens: 100 };
    render(<ProviderConfigDialog {...defaultProps} config={config} />);

    const tempInput = screen.getByLabelText('temperature');
    const maxTokensInput = screen.getByLabelText('maxTokens');

    expect(tempInput).toHaveAttribute('type', 'number');
    expect(tempInput).toHaveValue(0.7);
    expect(maxTokensInput).toHaveValue(100);
  });

  it('renders boolean config values as text inputs with string values', () => {
    const config = { stream: true, cache: false };
    render(<ProviderConfigDialog {...defaultProps} config={config} />);

    expect(screen.getByLabelText('stream')).toHaveValue('true');
    expect(screen.getByLabelText('cache')).toHaveValue('false');
  });

  it('updates string config value when input changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { model: 'gpt-4' };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('model');
    await user.clear(input);
    await user.type(input, 'gpt-3.5-turbo');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { model: 'gpt-3.5-turbo' });
  });

  it('updates number config value when input changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { temperature: 0.7 };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('temperature');
    await user.clear(input);
    await user.type(input, '0.9');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { temperature: 0.9 });
  });

  it('updates boolean config value when input changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { stream: true };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('stream');
    await user.clear(input);
    await user.type(input, 'false');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { stream: false });
  });

  it('parses JSON objects from string input', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { apiKey: '' };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('apiKey');
    await user.click(input);
    await user.paste('{"nested": "value"}');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { apiKey: { nested: 'value' } });
  });

  it('parses JSON arrays from string input', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { models: '' };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('models');
    await user.click(input);
    await user.paste('["gpt-4", "gpt-3.5"]');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { models: ['gpt-4', 'gpt-3.5'] });
  });

  it('handles invalid JSON by keeping as string', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { value: '' };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('value');
    await user.click(input);
    await user.paste('{invalid json}');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { value: '{invalid json}' });
  });

  it('parses "null" string to null value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { value: '' };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('value');
    await user.type(input, 'null');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { value: null });
  });

  it('parses "undefined" string to undefined value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const config = { value: '' };

    render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

    const input = screen.getByLabelText('value');
    await user.type(input, 'undefined');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledWith('openai:gpt-4', { value: undefined });
  });

  it('resets config when dialog reopens with different providerId', () => {
    const { rerender } = render(
      <ProviderConfigDialog
        {...defaultProps}
        providerId="openai:gpt-4"
        config={{ model: 'gpt-4' }}
      />,
    );

    expect(screen.getByLabelText('model')).toHaveValue('gpt-4');

    rerender(
      <ProviderConfigDialog
        {...defaultProps}
        providerId="anthropic:claude"
        config={{ model: 'claude-3' }}
      />,
    );

    expect(screen.getByLabelText('model')).toHaveValue('claude-3');
  });

  it('resets config when dialog closes and reopens', () => {
    const { rerender } = render(
      <ProviderConfigDialog {...defaultProps} open={true} config={{ model: 'gpt-4' }} />,
    );

    expect(screen.getByLabelText('model')).toHaveValue('gpt-4');

    rerender(<ProviderConfigDialog {...defaultProps} open={false} config={{ model: 'gpt-4' }} />);
    rerender(<ProviderConfigDialog {...defaultProps} open={true} config={{ model: 'claude-3' }} />);

    expect(screen.getByLabelText('model')).toHaveValue('claude-3');
  });

  describe('Azure OpenAI Provider', () => {
    it('shows alert for Azure provider', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: 'my-deployment' }}
        />,
      );

      expect(
        screen.getByText(/Azure OpenAI requires a deployment ID that matches your deployment name/),
      ).toBeInTheDocument();
    });

    it('prioritizes deployment_id field first', () => {
      const config = { model: 'gpt-4', deployment_id: 'my-deployment', temperature: 0.7 };
      render(<ProviderConfigDialog {...defaultProps} providerId="azure:gpt-4" config={config} />);

      const labels = screen.getAllByRole('textbox');
      expect(labels[0]).toHaveValue('my-deployment');
    });

    it('marks deployment_id as required', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: '' }}
        />,
      );

      const label = screen.getByText('deployment_id');
      expect(label.textContent).toContain('*');
    });

    it('shows error when deployment_id is empty', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: '' }}
        />,
      );

      expect(screen.getByText('This field is required for Azure OpenAI')).toBeInTheDocument();
    });

    it('applies error styling to deployment_id input when invalid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: '' }}
        />,
      );

      const input = screen.getByLabelText(/deployment_id/);
      expect(input).toHaveClass('border-destructive');
    });

    it('disables Save button when deployment_id is missing', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: '' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('enables Save button when deployment_id is provided', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: 'my-deployment' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });

    it('shows destructive alert when deployment_id is missing', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: '' }}
        />,
      );

      expect(
        screen.getByText(
          /You must specify a deployment ID for Azure OpenAI models. This is the name you gave your model deployment/,
        ),
      ).toBeInTheDocument();
    });

    it('shows default alert when deployment_id is valid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: 'my-deployment' }}
        />,
      );

      expect(
        screen.getByText(/Azure OpenAI requires a deployment ID that matches your deployment name/),
      ).toBeInTheDocument();
    });
  });

  describe('Bedrock Agent Provider', () => {
    it('shows alert for Bedrock Agent provider', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: 'agent-123', agentAliasId: 'alias-456' }}
        />,
      );

      expect(screen.getByText('Amazon Bedrock Agent Configuration')).toBeInTheDocument();
    });

    it('prioritizes agentId, agentAliasId, region, and enableTrace fields first', () => {
      const config = {
        other: 'value',
        agentId: 'agent-123',
        region: 'us-east-1',
        agentAliasId: 'alias-456',
        enableTrace: true,
        another: 'field',
      };
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={config}
        />,
      );

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveValue('agent-123');
      expect(inputs[1]).toHaveValue('alias-456');
      expect(inputs[2]).toHaveValue('us-east-1');
    });

    it('marks agentId as required', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: '', agentAliasId: 'alias-456' }}
        />,
      );

      const label = screen.getByText('agentId');
      expect(label.textContent).toContain('*');
    });

    it('marks agentAliasId as required', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: 'agent-123', agentAliasId: '' }}
        />,
      );

      const label = screen.getByText('agentAliasId');
      expect(label.textContent).toContain('*');
    });

    it('shows error when agentId is empty', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: '', agentAliasId: 'alias-456' }}
        />,
      );

      expect(screen.getByText('This field is required for Bedrock Agents')).toBeInTheDocument();
    });

    it('shows error when agentAliasId is empty', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: 'agent-123', agentAliasId: '' }}
        />,
      );

      expect(screen.getByText('This field is required for Bedrock Agents')).toBeInTheDocument();
    });

    it('disables Save button when agentId is missing', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: '', agentAliasId: 'alias-456' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('disables Save button when agentAliasId is missing', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: 'agent-123', agentAliasId: '' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('enables Save button when both agentId and agentAliasId are provided', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: 'agent-123', agentAliasId: 'alias-456' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });

    it('displays agent configuration in alert when valid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{
            agentId: 'agent-123',
            agentAliasId: 'alias-456',
            region: 'us-east-1',
          }}
        />,
      );

      expect(screen.getByText(/Agent ID:/)).toBeInTheDocument();
      expect(screen.getByText('agent-123')).toBeInTheDocument();
      expect(screen.getByText(/Agent Alias:/)).toBeInTheDocument();
      expect(screen.getByText('alias-456')).toBeInTheDocument();
      expect(screen.getByText(/Region:/)).toBeInTheDocument();
      expect(screen.getByText('us-east-1')).toBeInTheDocument();
    });

    it('displays knowledge base configuration when present', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{
            agentId: 'agent-123',
            agentAliasId: 'alias-456',
            knowledgeBaseConfigurations: [{ knowledgeBaseId: 'kb-1' }, { knowledgeBaseId: 'kb-2' }],
          }}
        />,
      );

      expect(screen.getByText(/Knowledge Bases:/)).toBeInTheDocument();
      expect(screen.getByText('kb-1, kb-2')).toBeInTheDocument();
    });

    it('displays knowledge base without knowledgeBaseId', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{
            agentId: 'agent-123',
            agentAliasId: 'alias-456',
            knowledgeBaseConfigurations: [{}],
          }}
        />,
      );

      expect(screen.getByText(/Knowledge Bases:/)).toBeInTheDocument();
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('displays trace status when enabled', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{
            agentId: 'agent-123',
            agentAliasId: 'alias-456',
            enableTrace: true,
          }}
        />,
      );

      expect(screen.getByText(/Tracing:/)).toBeInTheDocument();
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('does not display trace status when disabled', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{
            agentId: 'agent-123',
            agentAliasId: 'alias-456',
            enableTrace: false,
          }}
        />,
      );

      expect(screen.queryByText(/Tracing:/)).not.toBeInTheDocument();
    });

    it('shows destructive alert when required fields are missing', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{ agentId: '', agentAliasId: '' }}
        />,
      );

      expect(
        screen.getByText(
          /You must specify both agentId and agentAliasId for Bedrock Agents. These are the agent ID and alias ID/,
        ),
      ).toBeInTheDocument();
    });

    it('handles knowledgeBaseConfigurations as non-array', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="bedrock-agent:my-agent"
          config={{
            agentId: 'agent-123',
            agentAliasId: 'alias-456',
            knowledgeBaseConfigurations: 'configured',
          }}
        />,
      );

      expect(screen.getByText(/Knowledge Bases:/)).toBeInTheDocument();
      expect(screen.getByText('Configured')).toBeInTheDocument();
    });
  });

  describe('Non-Azure and Non-Bedrock Providers', () => {
    it('does not show Azure alert for non-Azure providers', () => {
      render(<ProviderConfigDialog {...defaultProps} providerId="openai:gpt-4" config={{}} />);

      expect(screen.queryByText(/Azure OpenAI requires a deployment ID/)).not.toBeInTheDocument();
    });

    it('does not show Bedrock Agent alert for non-Bedrock providers', () => {
      render(<ProviderConfigDialog {...defaultProps} providerId="openai:gpt-4" config={{}} />);

      expect(screen.queryByText('Amazon Bedrock Agent Configuration')).not.toBeInTheDocument();
    });

    it('enables Save button for non-Azure, non-Bedrock providers', () => {
      render(<ProviderConfigDialog {...defaultProps} providerId="openai:gpt-4" config={{}} />);

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('Complex config types', () => {
    it('renders JsonTextarea for object values', () => {
      const config = {
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      };
      render(<ProviderConfigDialog {...defaultProps} config={config} />);

      expect(screen.getByText('headers')).toBeInTheDocument();
    });

    it('renders JsonTextarea for array values', () => {
      const config = {
        models: ['gpt-4', 'gpt-3.5-turbo'],
      };
      render(<ProviderConfigDialog {...defaultProps} config={config} />);

      expect(screen.getByText('models')).toBeInTheDocument();
    });

    it('updates config when JsonTextarea changes with valid JSON', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const config = {
        headers: { Authorization: 'Bearer token' },
      };

      render(<ProviderConfigDialog {...defaultProps} config={config} onSave={onSave} />);

      // Find the textarea by getting all textareas
      const textarea = screen.getByRole('textbox');
      await user.clear(textarea);
      await user.click(textarea);
      await user.paste('{"newKey": "newValue"}');

      const saveButton = screen.getByRole('button', { name: 'Save' });
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalledWith('openai:gpt-4', {
        headers: { newKey: 'newValue' },
      });
    });
  });

  describe('hasContent helper', () => {
    it('treats empty string as invalid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: '' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('treats null as invalid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: null }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('treats undefined as invalid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: undefined }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('treats non-empty string as valid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: 'my-deployment' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });

    it('treats number 0 as valid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: 0 }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });

    it('treats boolean false as valid', () => {
      render(
        <ProviderConfigDialog
          {...defaultProps}
          providerId="azure:gpt-4"
          config={{ deployment_id: false }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).not.toBeDisabled();
    });
  });
});
