import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NewsletterForm from './NewsletterForm';

describe('NewsletterForm', () => {
  afterEach(() => {
    delete (window as any).__pf_privacy_region;
    document.body.innerHTML = '';
  });

  it('loads the hosted form script after opt-in visitors activate the gate', async () => {
    (window as any).__pf_privacy_region = 'opt_in';

    render(<NewsletterForm />);

    const loadButton = await screen.findByRole('button', { name: 'Load newsletter signup' });
    expect(document.querySelector('script[src*="eocampaign1.com"]')).toBeNull();

    fireEvent.click(loadButton);

    await waitFor(() => {
      expect(document.querySelector('script[src*="eocampaign1.com"]')).toBeInTheDocument();
    });
  });
});
