import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ContactPage from './contact';

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

    expect(form.method).toBe('post');
    expect(form.action).toBe('https://submit-form.com/ghriv7voL');
    expect(form.checkValidity()).toBe(true);
    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      name: 'Test Visitor',
      email: 'visitor@example.com',
      company: 'Example',
      'interested-in': 'Model Evaluation',
      message: 'Please share a demo.',
    });
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
