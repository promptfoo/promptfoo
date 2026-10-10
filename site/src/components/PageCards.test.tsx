import React from 'react';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FinancePage from '../pages/solutions/finance';
import { ApplicationCard } from './ApplicationCard';
import { BenefitItem } from './BenefitItem';

describe('application cards and benefit rows', () => {
  it('keeps each application description with its title and direct icon', () => {
    render(
      <>
        <ApplicationCard title="Wealth & Advisory" icon={<svg aria-label="Markets" role="img" />}>
          Test investment assistants and <strong>portfolio analysis</strong>.
        </ApplicationCard>
        <ApplicationCard title="Operations" icon={<svg aria-label="Operations" role="img" />}>
          Test internal workflows.
        </ApplicationCard>
      </>,
    );

    const title = screen.getByText('Wealth & Advisory');
    expect(screen.getByRole('img', { name: 'Markets' }).parentElement).toBe(title);
    const card = title.parentElement!;
    expect(within(card).getByText('portfolio analysis')).toBeInTheDocument();
    expect(within(card).queryByText('Test internal workflows.')).not.toBeInTheDocument();
    expect(screen.getByText('Test internal workflows.').parentElement).toBe(
      screen.getByText('Operations').parentElement,
    );
  });

  it('keeps benefit icons beside their heading and paragraph without an extra wrapper', () => {
    render(
      <BenefitItem title="Private deployment" icon={<svg role="img" aria-label="Privacy" />}>
        Keep sensitive data in your environment.
      </BenefitItem>,
    );

    const heading = screen.getByRole('heading', { level: 3, name: 'Private deployment' });
    const content = heading.parentElement!;
    expect(
      within(content).getByText('Keep sensitive data in your environment.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Privacy' }).parentElement).toBe(content.parentElement);
    expect(content.previousElementSibling).toBe(screen.getByRole('img', { name: 'Privacy' }));
  });

  it('renders the finance page application copy and deployment benefits through the shared shells', () => {
    render(<FinancePage />);

    const wealth = screen.getByText('Wealth & Advisory').parentElement!;
    expect(wealth.querySelector('div > svg')).not.toBeNull();
    expect(within(wealth).getByText(/Robo-advisors, investment assistants/)).toBeInTheDocument();
    const deployment = screen.getByRole('heading', {
      level: 3,
      name: 'Self-hosted deployment',
    });
    expect(deployment.parentElement?.previousElementSibling?.tagName.toLowerCase()).toBe('svg');
    expect(
      within(deployment.parentElement!).getByText(/Run entirely within your infrastructure/),
    ).toBeInTheDocument();
  });
});
