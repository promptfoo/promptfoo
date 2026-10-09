import type { ReactNode } from 'react';

import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import BlackHat2025 from './blackhat-2025';

// The site test aliases share a component stub; preserve link destinations while
// leaving Head and Layout children unchanged.
vi.mock('@docusaurus/Link', () => ({
  default: ({ children, to }: { children?: ReactNode; to?: string }) =>
    to ? <a href={to}>{children}</a> : children,
}));

it('keeps the archived demo section linked to the contact page', () => {
  const { container } = render(<BlackHat2025 />);
  const section = container.querySelector('#schedule-demo');
  expect(section).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Meet us at Black Hat' })).toBeInTheDocument();
  expect(within(section as HTMLElement).getByRole('link', { name: 'Book a demo' })).toHaveAttribute(
    'href',
    '/contact',
  );
  expect(section?.querySelector('iframe')).toBeNull();
});
