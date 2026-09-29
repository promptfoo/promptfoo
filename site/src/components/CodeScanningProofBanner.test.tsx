import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProofBannerSection from './CodeScanningProofBanner';

vi.mock('@docusaurus/Link', () => ({
  default: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

describe('code scanning proof banner', () => {
  it('offers the technical case study from its call to action', () => {
    render(<ProofBannerSection />);
    expect(screen.getByRole('heading', { name: 'See it in action', level: 3 })).toBeVisible();
    expect(screen.getByText(/CVEs in LangChain, Vanna.AI, and LlamaIndex/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read the technical breakdown' })).toHaveAttribute(
      'href',
      '/blog/building-a-security-scanner-for-llm-apps',
    );
  });
});
