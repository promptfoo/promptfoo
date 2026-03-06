import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ThirdPartyContentGate from './ThirdPartyContentGate';

describe('ThirdPartyContentGate', () => {
  afterEach(() => {
    delete (window as any).__pf_privacy_region;
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

  it('renders the child content immediately outside opt-in regions', () => {
    (window as any).__pf_privacy_region = 'opt_out';

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
});
