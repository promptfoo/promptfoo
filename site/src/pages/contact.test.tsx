import React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContactPage from './contact';

interface TurnstileOptions {
  callback: (token: string) => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
  'error-callback': () => void;
  'unsupported-callback': () => void;
}

// Keep the real React wrapper; replace only Cloudflare's remote browser API.
const turnstile = vi.hoisted(() => {
  const api = {
    render: vi.fn<(_container: HTMLElement, _options: TurnstileOptions) => string>(
      () => 'contact-widget',
    ),
    remove: vi.fn(),
  };
  vi.stubGlobal('turnstile', api);
  return api;
});

function verify(token = 'test-turnstile-token') {
  act(() => turnstile.render.mock.lastCall![1].callback(token));
}

describe('contact form', () => {
  it('submits contact details to Formspark in the POST body', () => {
    render(<ContactPage />);

    const form = screen.getByRole('button', { name: 'Contact sales' }).closest('form')!;
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Test Visitor' } });
    fireEvent.change(screen.getByLabelText(/Work email/), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: 'Example' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /I'm interested in/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Model Evaluation & Testing' }));
    fireEvent.change(screen.getByLabelText(/How can we help/), {
      target: { value: 'Please share a demo.' },
    });
    verify();

    expect(form.method).toBe('post');
    expect(form.action).toBe('https://submit-form.com/ghriv7voL');
    expect(form.checkValidity()).toBe(true);
    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      name: 'Test Visitor',
      email: 'visitor@example.com',
      company: 'Example',
      'interested-in': 'Model Evaluation',
      message: 'Please share a demo.',
      'cf-turnstile-response': 'test-turnstile-token',
    });
    expect(screen.getByRole('button', { name: 'Contact sales' })).toBeEnabled();
    expect(fireEvent.submit(form)).toBe(true);
  });

  it('blocks submission until the existing Turnstile widget verifies the visitor', () => {
    render(<ContactPage />);

    const button = screen.getByRole('button', { name: 'Contact sales' });
    const form = button.closest('form')!;
    expect(turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        sitekey: '0x4AAAAAAExEs4irtoVm_IKg',
        action: 'contact',
        'response-field': false,
        'refresh-expired': 'auto',
      }),
    );
    expect(button).toBeDisabled();
    expect(fireEvent.submit(form)).toBe(false);
    expect(new FormData(form).get('cf-turnstile-response')).toBe('');
  });

  it.each([
    'expired-callback',
    'timeout-callback',
    'error-callback',
    'unsupported-callback',
  ] as const)('clears the token and blocks submission after %s', (callback) => {
    render(<ContactPage />);
    verify();

    act(() => turnstile.render.mock.lastCall![1][callback]());

    const button = screen.getByRole('button', { name: 'Contact sales' });
    const form = button.closest('form')!;
    expect(button).toBeDisabled();
    expect(new FormData(form).get('cf-turnstile-response')).toBe('');
    expect(fireEvent.submit(form)).toBe(false);
    expect(screen.getByRole('status')).toBeVisible();

    verify('fresh-token');
    expect(button).toBeEnabled();
    expect(new FormData(form).getAll('cf-turnstile-response')).toEqual(['fresh-token']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('removes the widget on navigation and requires a fresh token on return', () => {
    const { unmount } = render(<ContactPage />);
    verify();
    unmount();

    expect(turnstile.remove).toHaveBeenCalledWith('contact-widget');
    render(<ContactPage />);
    expect(turnstile.render).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Contact sales' })).toBeDisabled();
    verify();
    expect(screen.getByRole('button', { name: 'Contact sales' })).toBeEnabled();
  });

  it('keeps the honeypot hidden and out of normal submissions', () => {
    render(<ContactPage />);

    const form = screen.getByRole('button', { name: 'Contact sales' }).closest('form')!;
    const honeypot = screen.getByRole('checkbox', { hidden: true });

    expect(honeypot).toHaveAttribute('name', '_gotcha');
    expect(honeypot).not.toBeVisible();
    expect(honeypot).toHaveAttribute('aria-hidden', 'true');
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot).toHaveAttribute('autocomplete', 'off');
    expect(honeypot).not.toBeRequired();
    expect(new FormData(form).has('_gotcha')).toBe(false);
  });

  it('includes the honeypot signal when a bot checks it', () => {
    render(<ContactPage />);

    const form = screen.getByRole('button', { name: 'Contact sales' }).closest('form')!;
    fireEvent.click(screen.getByRole('checkbox', { hidden: true }));

    expect(new FormData(form).get('_gotcha')).toBe('on');
  });
});
