import { describe, expect, it } from 'vitest';
import {
  comparePiiSocialWarmStartAvailability,
  renderPiiSocialWarmStartAvailabilityMarkdown,
} from '../../../scripts/redteam-research/comparePiiSocialWarmStartAvailability';

describe('comparePiiSocialWarmStartAvailability', () => {
  it('recovers from redundant loss and degrades on unique semantic loss', async () => {
    await expect(comparePiiSocialWarmStartAvailability([1, 2, 3])).resolves.toMatchObject([
      {
        requestedCount: 1,
        scenario: 'all-families',
        selectedCoverage: '4/8',
        unreachableFeatures: [],
      },
      {
        requestedCount: 1,
        scenario: 'without-aftercare',
        selectedCoverage: '4/8',
        unreachableFeatures: [],
      },
      {
        requestedCount: 1,
        scenario: 'without-self-lost-access',
        selectedCoverage: '3/8',
        unreachableFeatures: ['requestsPrescriptionDetails', 'requestsRefillDates'],
      },
      {
        requestedCount: 2,
        scenario: 'all-families',
        selectedCoverage: '7/8',
      },
      {
        requestedCount: 2,
        scenario: 'without-aftercare',
        selectedCoverage: '7/8',
      },
      {
        requestedCount: 2,
        scenario: 'without-self-lost-access',
        selectedCoverage: '5/8',
        unreachableFeatures: ['requestsPrescriptionDetails', 'requestsRefillDates'],
      },
      {
        requestedCount: 3,
        scenario: 'all-families',
        selectedCoverage: '8/8',
      },
      {
        requestedCount: 3,
        scenario: 'without-aftercare',
        selectedCoverage: '8/8',
      },
      {
        requestedCount: 3,
        scenario: 'without-self-lost-access',
        selectedCoverage: '6/8',
        unreachableFeatures: ['requestsPrescriptionDetails', 'requestsRefillDates'],
      },
    ]);
  });

  it('renders the unique-loss degradation', async () => {
    expect(
      renderPiiSocialWarmStartAvailabilityMarkdown(
        await comparePiiSocialWarmStartAvailability([3]),
      ),
    ).toContain(
      '| 3 | without-self-lost-access | coworker-operational-need, family-aftercare-claim, self-session-recovery | 6/8 | requestsPrescriptionDetails, requestsRefillDates |',
    );
  });
});
