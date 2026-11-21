import React from 'react';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CodeScanningPage from '../pages/code-scanning';
import GitHubActionPage from '../pages/code-scanning/github-action';

// Docusaurus provides Link at build time. Preserve its destination in the test DOM.
vi.mock('@docusaurus/Link', () => ({
  default: ({ to, children }: { to?: string; children?: React.ReactNode }) =>
    to ? <a href={to}>{children}</a> : children,
}));

describe('shared code-scanning sections', () => {
  it.each([
    {
      name: 'code-scanning landing page',
      Page: CodeScanningPage,
      eyebrow: 'LLM-SPECIFIC DETECTION',
      title: 'Find what other scanners miss',
      description: 'Purpose-built for AI security risks that general SAST tools overlook',
      otherTitle: 'Catch issues that other review tools miss',
    },
    {
      name: 'GitHub Action landing page',
      Page: GitHubActionPage,
      eyebrow: 'LLM-specific vulnerabilities',
      title: 'Catch issues that other review tools miss',
      description:
        'Our scanner is laser-focused on the kinds of vulnerabilities that apps built on LLMs and agents are uniquely susceptible to.',
      otherTitle: 'Find what other scanners miss',
    },
  ])('preserves the content and proof link on the $name', ({ Page, ...copy }) => {
    render(<Page />);

    const title = screen.getByRole('heading', { level: 2, name: copy.title });
    const section = within(title.closest('section')!);
    expect(section.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(section.getByText(copy.description)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: copy.otherTitle })).not.toBeInTheDocument();
    expect(section.getAllByRole('heading', { level: 3 })).toHaveLength(6);

    for (const [name, severity] of [
      ['Prompt Injection', 'critical'],
      ['Data Exfiltration', 'critical'],
      ['PII Exposure', 'high'],
      ['Improper Output Handling', 'high'],
      ['Excessive Agency', 'medium'],
      ['Jailbreak Risks', 'medium'],
    ]) {
      const card = section.getByRole('heading', { level: 3, name }).parentElement!;
      expect(within(card).getByText(severity)).toBeInTheDocument();
    }

    const proof = within(
      screen.getByRole('heading', { level: 3, name: 'See it in action' }).closest('section')!,
    );
    expect(proof.getByText(/LangChain, Vanna\.AI, and LlamaIndex/)).toBeInTheDocument();
    expect(proof.getByRole('link', { name: 'Read the technical breakdown' })).toHaveAttribute(
      'href',
      '/blog/building-a-security-scanner-for-llm-apps',
    );
  });
});
