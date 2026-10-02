import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComplianceCard, RiskCard } from './Cards';

describe('solution cards', () => {
  it('shows the supplied risk and preserves literal description text', () => {
    render(<RiskCard name="Sensitive data" description={'User input <script> stays text'} />);
    expect(screen.getByRole('heading', { name: 'Sensitive data', level: 4 })).toBeVisible();
    expect(screen.getByText('User input <script> stays text')).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows each regulation in its supplied order and supports an empty card', () => {
    const { container, rerender } = render(
      <ComplianceCard
        icon={<span aria-label="Privacy requirements">P</span>}
        title="Privacy"
        items={[
          { name: 'GDPR', description: 'Personal data' },
          { name: 'CCPA', description: 'Consumer rights' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Privacy requirements')).toBeVisible();
    expect(container.textContent).toContain('PrivacyGDPRPersonal dataCCPAConsumer rights');
    rerender(<ComplianceCard icon={null} title="No requirements selected" items={[]} />);
    expect(screen.getByText('No requirements selected')).toBeVisible();
    expect(screen.queryByText('GDPR')).not.toBeInTheDocument();
  });
});
