// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(
  resolve(__dirname, '../../examples/redteam-pdf/public/index.html'),
  'utf8',
);

describe('PDF upload sample page', () => {
  let form: HTMLFormElement;
  let button: HTMLButtonElement;
  let result: HTMLElement;
  let status: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    new Function(document.querySelector('script')!.textContent!)();
    form = document.querySelector('form')!;
    button = document.querySelector('button')!;
    result = document.getElementById('result')!;
    status = document.getElementById('status')!;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function submit() {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function edit(id: 'document' | 'question') {
    const input = document.getElementById(id)!;
    if (id === 'question') {
      (input as HTMLTextAreaElement).value = 'What are the updated payment terms?';
    } else {
      Object.defineProperty(input, 'files', {
        value: [new File(['invoice B'], 'invoice-b.pdf', { type: 'application/pdf' })],
        configurable: true,
      });
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pendingRequest(answer = 'Old invoice answer') {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
    );
    return {
      async settle(outcome: 'answer' | 'error') {
        if (outcome === 'answer') {
          resolve(Response.json({ answer }));
        } else {
          reject(new Error('Old request failed'));
        }
        await setImmediate();
      },
    };
  }

  it.each(['document', 'question'] as const)(
    'ignores a pending answer after changing %s',
    async (id) => {
      const pending = pendingRequest();
      submit();
      expect(button.disabled).toBe(true);
      edit(id);
      await pending.settle('answer');
      expect(result.hidden).toBe(true);
      expect(status.textContent).toBe('');
      expect(button.disabled).toBe(false);
    },
  );

  it.each(['answer', 'error'] as const)(
    'keeps a newer review pending when the old request returns an %s',
    async (outcome) => {
      const pending = pendingRequest();
      submit();
      edit('question');
      expect(button.disabled).toBe(false);
      const fresh = pendingRequest('New invoice answer');
      submit();
      await pending.settle(outcome);
      expect(button.disabled).toBe(true);
      expect(result.hidden).toBe(true);
      expect(status.textContent).toBe('Reading your invoice…');
      await fresh.settle('answer');
      expect(result.hidden).toBe(false);
      expect(document.getElementById('answer')!.textContent).toBe('New invoice answer');
      expect(status.textContent).toBe('Review complete');
      expect(button.disabled).toBe(false);
    },
  );

  it('shows an error for the current request and permits retrying', async () => {
    const pending = pendingRequest();
    submit();
    await pending.settle('error');
    expect(status.textContent).toBe('Old request failed');
    expect(result.hidden).toBe(true);
    expect(button.disabled).toBe(false);
  });
});
