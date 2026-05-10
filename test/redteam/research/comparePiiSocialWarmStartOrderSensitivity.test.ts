import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialWarmStartOrderSensitivity,
  renderPiiSocialWarmStartOrderSensitivityMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialWarmStartOrderSensitivity';

describe('comparePiiSocialWarmStartOrderSensitivity', () => {
  it('shows coverage-derived warm starts remove source-order brittleness', async () => {
    await expect(comparePiiSocialWarmStartOrderSensitivity([1, 2, 3])).resolves.toMatchObject([
      {
        generatedFamilyIds: [
          'coworker-operational-need',
          'family-aftercare-claim',
          'self-lost-access',
        ],
        order: 'current-order',
        requestedCount: 1,
        selectedCoverage: '4/8',
        strategy: 'coverage-derived',
      },
      {
        generatedFamilyIds: [
          'coworker-operational-need',
          'family-aftercare-claim',
          'self-lost-access',
        ],
        order: 'reordered',
        requestedCount: 1,
        selectedCoverage: '4/8',
        strategy: 'coverage-derived',
      },
      {
        order: 'current-order',
        requestedCount: 1,
        selectedCoverage: '4/8',
        strategy: 'source-order',
      },
      {
        order: 'reordered',
        requestedCount: 1,
        selectedCoverage: '2/8',
        strategy: 'source-order',
      },
      {
        order: 'current-order',
        requestedCount: 2,
        selectedCoverage: '7/8',
        strategy: 'coverage-derived',
      },
      {
        order: 'reordered',
        requestedCount: 2,
        selectedCoverage: '7/8',
        strategy: 'coverage-derived',
      },
      {
        order: 'current-order',
        requestedCount: 2,
        selectedCoverage: '7/8',
        strategy: 'source-order',
      },
      {
        order: 'reordered',
        requestedCount: 2,
        selectedCoverage: '4/8',
        strategy: 'source-order',
      },
      {
        order: 'current-order',
        requestedCount: 3,
        selectedCoverage: '8/8',
        strategy: 'coverage-derived',
      },
      {
        order: 'reordered',
        requestedCount: 3,
        selectedCoverage: '8/8',
        strategy: 'coverage-derived',
      },
      {
        order: 'current-order',
        requestedCount: 3,
        selectedCoverage: '8/8',
        strategy: 'source-order',
      },
      {
        order: 'reordered',
        requestedCount: 3,
        selectedCoverage: '5/8',
        strategy: 'source-order',
      },
    ]);
  });

  it('renders the brittle source-order result', async () => {
    expect(
      renderPiiSocialWarmStartOrderSensitivityMarkdown(
        await comparePiiSocialWarmStartOrderSensitivity([1]),
      ),
    ).toContain(
      '| 1 | source-order | reordered | family-aftercare-claim, self-session-recovery, third-party-operational-need | 2/8 |',
    );
  });
});
