import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DefaultProvidersDisplay } from './DefaultProvidersDisplay';
import type { DefaultProviderSelectionInfo } from '@promptfoo/types/providers';

describe('DefaultProvidersDisplay', () => {
  const baseInfo: DefaultProviderSelectionInfo = {
    selectedProvider: 'Anthropic',
    reason: 'ANTHROPIC_API_KEY found, OPENAI_API_KEY not set',
    detectedCredentials: ['ANTHROPIC_API_KEY'],
    skippedProviders: [{ name: 'OpenAI', reason: 'OPENAI_API_KEY not set' }],
    providerSlots: {
      grading: {
        id: 'anthropic:messages:claude-sonnet-4-20250514',
        model: 'claude-sonnet-4-20250514',
      },
      embedding: {
        id: 'anthropic:messages:claude-sonnet-4-20250514',
        model: 'claude-sonnet-4-20250514',
      },
    },
  };

  it('renders with the selected provider name', () => {
    renderWithProviders(<DefaultProvidersDisplay info={baseInfo} />);
    expect(screen.getByText('GRADING')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });

  it('displays the CPU icon', () => {
    renderWithProviders(<DefaultProvidersDisplay info={baseInfo} />);
    const chip = screen.getByRole('button');
    expect(chip.querySelector('svg')).toBeInTheDocument();
  });

  it('is not interactive (no click action)', () => {
    renderWithProviders(<DefaultProvidersDisplay info={baseInfo} />);
    const chip = screen.getByRole('button');
    // The chip should have cursor-default class indicating non-interactive
    expect(chip).toHaveClass('cursor-default');
  });

  it('handles info with empty arrays', () => {
    const minimalInfo: DefaultProviderSelectionInfo = {
      selectedProvider: 'GitHub Models',
      reason: 'GITHUB_TOKEN found',
      detectedCredentials: [],
      skippedProviders: [],
      providerSlots: {},
    };
    renderWithProviders(<DefaultProvidersDisplay info={minimalInfo} />);
    expect(screen.getByText('GitHub Models')).toBeInTheDocument();
  });

  it('renders different provider names correctly', () => {
    const openAiInfo: DefaultProviderSelectionInfo = {
      ...baseInfo,
      selectedProvider: 'OpenAI',
      reason: 'OPENAI_API_KEY found',
      detectedCredentials: ['OPENAI_API_KEY'],
      skippedProviders: [],
    };
    renderWithProviders(<DefaultProvidersDisplay info={openAiInfo} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('renders Google AI Studio provider name', () => {
    const googleInfo: DefaultProviderSelectionInfo = {
      ...baseInfo,
      selectedProvider: 'Google AI Studio',
      reason: 'GEMINI_API_KEY found',
      detectedCredentials: ['GEMINI_API_KEY'],
    };
    renderWithProviders(<DefaultProvidersDisplay info={googleInfo} />);
    expect(screen.getByText('Google AI Studio')).toBeInTheDocument();
  });

  it('renders Mistral provider name', () => {
    const mistralInfo: DefaultProviderSelectionInfo = {
      ...baseInfo,
      selectedProvider: 'Mistral',
      reason: 'MISTRAL_API_KEY found',
      detectedCredentials: ['MISTRAL_API_KEY'],
    };
    renderWithProviders(<DefaultProvidersDisplay info={mistralInfo} />);
    expect(screen.getByText('Mistral')).toBeInTheDocument();
  });
});
