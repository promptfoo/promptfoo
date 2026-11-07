import React from 'react';

import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NewsletterForm from './NewsletterForm';

describe('NewsletterForm', () => {
  afterEach(() => {
    delete (window as any).__pf_privacy_region;
    delete (window as any).__pf_consent;
    delete (window as any).__pf_third_party_loaded;
    delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    for (const name of ['pf_country', 'pf_consent']) {
      document.cookie = `${name}=;path=/;max-age=0`;
    }
    document.body.innerHTML = '';
  });

  it.each([
    { country: 'US', consent: 'v1.o.0.0', gpc: false },
    { country: 'JP', consent: 'v1.n.0.0', gpc: false },
    { country: 'US', consent: 'v1.o.1.1', gpc: true },
  ])(
    'honors the served consent script for $country rejection or GPC',
    ({ country, consent, gpc }) => {
      document.cookie = `pf_country=${country};path=/`;
      document.cookie = `pf_consent=${consent};path=/`;
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: gpc, configurable: true });
      new Function(
        fs.readFileSync(path.resolve(__dirname, '../../static/js/consent.js'), 'utf8'),
      )();
      render(<NewsletterForm />);
      expect(screen.getByRole('button', { name: 'Load newsletter signup' })).toBeInTheDocument();
      expect(document.querySelector('script[src*="eocampaign1.com"]')).toBeNull();
    },
  );

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
