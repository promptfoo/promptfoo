import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ThirdPartyContentGate from './ThirdPartyContentGate';

describe('ThirdPartyContentGate', () => {
  afterEach(() => {
    delete (window as any).__pf_privacy_region;
    delete (window as any).__pf_consent;
    delete (window as any).__pf_third_party_loaded;
  });

  it('shows an activation gate in opt-in regions', () => {
    (window as any).__pf_privacy_region = 'opt_in';

    render(
      <ThirdPartyContentGate
        description="Load an external signup form."
        linkHref="https://example.com"
        serviceName="Example"
        title="Signup"
      >
        <div>Embedded content</div>
      </ThirdPartyContentGate>,
    );

    expect(screen.getByText('Signup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Example' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open on Example' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.queryByText('Embedded content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load Example' }));
    expect(screen.getByText('Embedded content')).toBeInTheDocument();
  });

  it('renders the child content when marketing consent is enabled', () => {
    (window as any).__pf_consent = { analytics: 1, marketing: 1 };

    render(
      <ThirdPartyContentGate
        description="Load an external signup form."
        serviceName="Example"
        title="Signup"
      >
        <div>Embedded content</div>
      </ThirdPartyContentGate>,
    );

    expect(screen.getByText('Embedded content')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load Example' })).not.toBeInTheDocument();
  });

  it('tracks both granting and withdrawing consent', () => {
    render(
      <ThirdPartyContentGate
        description="Load an external signup form."
        serviceName="Example"
        title="Signup"
      >
        <div>Embedded content</div>
      </ThirdPartyContentGate>,
    );

    expect(screen.getByRole('button', { name: 'Load Example' })).toBeInTheDocument();
    expect(screen.queryByText('Embedded content')).not.toBeInTheDocument();

    (window as any).__pf_consent = { analytics: 1, marketing: 1 };
    fireEvent(window, new Event('pf_consent_change'));

    expect(screen.getByText('Embedded content')).toBeInTheDocument();
    (window as any).__pf_consent = { analytics: 1, marketing: 0 };
    fireEvent(window, new Event('pf_consent_change'));
    expect(screen.queryByText('Embedded content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Example' })).toBeInTheDocument();
  });
});
