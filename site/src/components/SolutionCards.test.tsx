import React from 'react';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComplianceCard, RiskCard } from './SolutionCards';

describe('shared solution cards', () => {
  it('renders each risk name and description in its own card', () => {
    render(
      <>
        <RiskCard name="Data exposure" description="Keep customer records private." />
        <RiskCard name="Unauthorized actions" description="Require approval before transfers." />
      </>,
    );

    const exposure = screen.getByRole('heading', { level: 4, name: 'Data exposure' })
      .parentElement!;
    expect(within(exposure).getByText('Keep customer records private.')).toBeInTheDocument();
    expect(
      within(exposure).queryByText('Require approval before transfers.'),
    ).not.toBeInTheDocument();
    const actions = screen.getByRole('heading', {
      level: 4,
      name: 'Unauthorized actions',
    }).parentElement!;
    expect(within(actions).getByText('Require approval before transfers.')).toBeInTheDocument();
  });

  it('renders the compliance title, supplied icon, and descriptions beside their item names', () => {
    render(
      <ComplianceCard
        icon={<svg role="img" aria-label="Compliance shield" />}
        title="Financial regulations"
        items={[
          { name: 'Privacy', description: 'Protect account data.' },
          { name: 'Auditability', description: 'Retain decision records.' },
        ]}
      />,
    );

    expect(screen.getByText('Financial regulations')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Compliance shield' })).toBeInTheDocument();
    const privacy = screen.getByText('Privacy').parentElement!;
    expect(within(privacy).getByText('Protect account data.')).toBeInTheDocument();
    expect(within(privacy).queryByText('Retain decision records.')).not.toBeInTheDocument();
    const audit = screen.getByText('Auditability').parentElement!;
    expect(within(audit).getByText('Retain decision records.')).toBeInTheDocument();
  });

  it('keeps the compliance title and icon when there are no items', () => {
    render(<ComplianceCard title="No additional requirements" icon={<span>✓</span>} items={[]} />);

    expect(screen.getByText('No additional requirements')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
  });
});
