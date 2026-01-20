import React from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderEditor, { defaultHttpTarget } from './ProviderEditor';

import type { ProviderOptions } from '../../types';

vi.mock('./ProviderConfigEditor', () => {
  return {
    default: (props: {
      providerType?: string;
      validateAll?: boolean;
      setError?: (error: string | null) => void;
      onValidationRequest?: (validator: () => boolean) => void;
    }) => {
      const validate = vi.fn(() => true);

      // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
      React.useEffect(() => {
        if (props.onValidationRequest) {
          props.onValidationRequest(validate);
        }
      }, [props.onValidationRequest]);

      React.useEffect(() => {
        if (props.validateAll) {
          validate();
          props.setError?.('Validation triggered');
        }
      }, [props.validateAll, props.setError, validate]);

      return <div data-testid="provider-config-editor" data-providertype={props.providerType} />;
    },
  };
});

vi.mock('./providerOptions', () => ({
  providerOptions: [
    {
      category: 'endpoint',
      title: 'API Endpoints',
      description: 'Connect to any HTTP-based API.',
      options: [
        {
          value: 'http',
          label: 'HTTP',
          description: 'Generic HTTP endpoint.',
        },
      ],
    },
    {
      category: 'model',
      title: 'Foundation Models',
      description: 'Use a major foundation model.',
      options: [
        {
          value: 'openai',
          label: 'OpenAI',
          description: 'Models from OpenAI.',
        },
      ],
    },
  ],
}));

describe('ProviderEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the provider name TextField and update provider label via setProvider when disableNameField is false or not set in opts', () => {
    const initialProvider: ProviderOptions = {
      ...defaultHttpTarget(),
      label: 'Initial Provider Name',
    };
    const setProvider = vi.fn();

    renderWithProviders(<ProviderEditor provider={initialProvider} setProvider={setProvider} />);

    const textField = screen.getByRole('textbox', { name: /Provider Name/i });
    expect(textField).toBeInTheDocument();

    fireEvent.change(textField, { target: { value: 'New Provider Name' } });

    expect(setProvider).toHaveBeenCalledTimes(1);
    expect(setProvider).toHaveBeenCalledWith({
      ...initialProvider,
      label: 'New Provider Name',
    });
  });

  it('should update provider and providerType when a new provider type is selected in ProviderTypeSelector', () => {
    const initialProvider: ProviderOptions = {
      ...defaultHttpTarget(),
      label: 'My Test Provider',
    };
    const setProvider = vi.fn();

    const { rerender } = renderWithProviders(
      <ProviderEditor provider={initialProvider} setProvider={setProvider} />,
    );

    const configEditor = screen.getByTestId('provider-config-editor');
    expect(configEditor).toHaveAttribute('data-providertype', 'http');

    // Provider list is always expanded - find and click OpenAI
    const openAiProviderCard = screen.getByText('OpenAI').closest('[role="button"]');
    expect(openAiProviderCard).toBeInTheDocument();
    fireEvent.click(openAiProviderCard!);

    expect(setProvider).toHaveBeenCalledTimes(1);
    const expectedNewProvider: ProviderOptions = {
      id: 'openai:gpt-5.2',
      config: {},
      label: 'My Test Provider',
    };
    expect(setProvider).toHaveBeenCalledWith(expectedNewProvider);

    rerender(<ProviderEditor provider={setProvider.mock.calls[0][0]} setProvider={setProvider} />);
    expect(screen.getByTestId('provider-config-editor')).toHaveAttribute(
      'data-providertype',
      'openai',
    );
  });

  it('should call onActionButtonClick when the action button is clicked and validation passes', () => {
    const onActionButtonClick = vi.fn();
    const initialProvider: ProviderOptions = defaultHttpTarget();

    renderWithProviders(
      <ProviderEditor
        provider={initialProvider}
        setProvider={vi.fn()}
        onActionButtonClick={onActionButtonClick}
      />,
    );

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    expect(onActionButtonClick).toHaveBeenCalledTimes(1);
  });

  it('should immediately validate configuration and update validationErrors state when validateAll prop changes from false to true', () => {
    const initialProvider: ProviderOptions = {
      ...defaultHttpTarget(),
      label: 'My Test Provider',
    };
    const setProvider = vi.fn();
    const setError = vi.fn();

    const { rerender } = renderWithProviders(
      <ProviderEditor
        provider={initialProvider}
        setProvider={setProvider}
        setError={setError}
        validateAll={false}
      />,
    );

    expect(setError).not.toHaveBeenCalled();

    rerender(
      <ProviderEditor
        provider={initialProvider}
        setProvider={setProvider}
        setError={setError}
        validateAll={true}
      />,
    );

    expect(setError).toHaveBeenCalledWith('Validation triggered');
  });
});
