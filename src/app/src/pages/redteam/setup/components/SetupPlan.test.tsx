import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import SetupPlan from './SetupPlan';

it('summarizes native targets, risks and strategies without executing or linking config values', () => {
  const draft = {
    messages: [],
    input: '',
    config: {
      targets: [
        'file://custom.py',
        { id: 'http', label: 'Public', config: { url: 'https://example.com' } },
      ],
      redteam: {
        plugins: ['bola', { id: 'policy' }],
        strategies: ['basic', 'custom:one'],
        numTests: 2,
      },
    },
    testableTargets: [1],
    tested: [{ targetIndex: 1, success: true, message: 'ok' }],
  };
  render(<SetupPlan draft={draft} />);
  expect(screen.getByText('file://custom.py')).toBeVisible();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('Public · https://example.com').parentElement).toHaveTextContent(
    'Test passed',
  );
  expect(screen.getByText(/Access to other users’ records/)).toBeVisible();
  expect(screen.getByText('basic · custom:one')).toBeVisible();
});

it('discloses each credential mapping and test-count override before a multi-target run', () => {
  const draft = {
    messages: [],
    input: '',
    config: {
      providers: [
        {
          id: 'https://one.example',
          config: { headers: { Authorization: 'Bearer {{env.ONE_KEY}}' } },
        },
        {
          id: 'http',
          config: {
            url: 'https://two.example',
            method: 'PUT',
            headers: { 'X-Key': '{{env.TWO_KEY}}', 'X-Team': '{{env.TEAM}}' },
          },
        },
      ],
      redteam: {
        plugins: ['bola', { id: 'policy', numTests: 1 }],
        strategies: ['rot13'],
        language: ['German', 'French'],
        numTests: 3,
      },
    },
  };
  render(<SetupPlan draft={draft} review />);
  expect(screen.getByText('https://one.example')).toHaveTextContent(
    'Authorization: Bearer {{env.ONE_KEY}}',
  );
  const second = screen.getByText('PUT https://two.example');
  expect(second).toHaveTextContent('X-Key: {{env.TWO_KEY}}');
  expect(second).toHaveTextContent('X-Team: {{env.TEAM}}');
  expect(screen.getByText(/3 per plugin by default/)).toBeVisible();
  expect(screen.getByText(/Policy Compliance \(1 test\)/)).toBeVisible();
  expect(screen.getByText('German · French')).toBeVisible();
  expect(screen.getByText(/can multiply/)).toBeVisible();
});
