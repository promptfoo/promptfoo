import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { load } from 'js-yaml';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_CONFIG, useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from './hooks/useRedTeamTargetConfigValidation';
import RedTeamSetupPage from './page';
import { getRuntimeRedteamConfig } from './utils/yamlHelpers';

vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: () => ({ recordEvent: vi.fn() }) }));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({ data: { status: 'connected' }, isLoading: false }),
}));

const redteam = {
  purpose: "A support bot that should never expose another user's orders.",
  plugins: ['bola'],
  strategies: ['basic'],
  numTests: 3,
};
const api = vi.mocked(callApi);
const reply = (data: unknown) => api.mockResolvedValueOnce(Response.json(data));
const target = {
  id: 'http',
  config: {
    url: 'http://localhost:3555/chat',
    method: 'POST',
    redirect: 'error',
    body: { messages: [{ role: 'user', content: '{{prompt}}' }] },
    transformResponse: 'json.choices[0].message.content',
    headers: { 'X-Secret-Key': '{{env.LOCAL_CHAT_KEY}}' },
  },
};
const second = {
  id: 'https://other.example/chat',
  config: { method: 'POST', body: { message: '{{prompt}}' }, transformResponse: 'text' },
};
const draft = { targets: [target], redteam };
const metadata = { runnable: true, testableTargets: [0] };
const incomplete = { runnable: false, testableTargets: [], runIssue: 'An endpoint is missing.' };
const endpointMessage =
  'Order assistant at http://localhost:3555/chat using OpenAI chat format. Send LOCAL_CHAT_KEY in X-Secret-Key.';
const postCalls = () => api.mock.calls.filter(([, options]) => options?.method === 'POST');
const config = () => useRedTeamConfig.getState().config;
const button = (name: string) => screen.getByRole('button', { name });
const input = () => screen.getByRole('textbox', { name: 'Message the setup agent' });
const payloads = () => postCalls().map(([, options]) => JSON.parse(String(options?.body)));
const userMessage = (content: string) => ({ role: 'user', content });
const localChat =
  'post to localhost:3555/chat, similar format to openai except needs to send a api key token in header';
async function send(user: ReturnType<typeof userEvent.setup>, message: string) {
  await user.click(input());
  await user.paste(message);
  await user.keyboard('{Enter}');
}

function setup(hash = '') {
  const router = createMemoryRouter([{ path: '/redteam/setup', element: <RedTeamSetupPage /> }], {
    initialEntries: [`/redteam/setup${hash}`],
  });
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return { router, user: userEvent.setup() };
}

describe('agent-led red team setup', () => {
  beforeEach(() => {
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
    useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
    api.mockReset().mockImplementation(async (path, options) => {
      if (path === '/redteam/setup-plan') {
        return Response.json(
          options?.method === 'POST'
            ? { message: 'Ready to review.', config: draft, ...metadata }
            : { enabled: true },
        );
      }
      if (path.startsWith('/user/email/status')) {
        return Response.json({ hasEmail: true });
      }
      if (path === '/redteam/run') {
        return Response.json({ id: 'job' });
      }
      return Response.json({});
    });
  });

  it('follows natural questions about a custom header without sharing or overwriting saved work', async () => {
    const saved = {
      ...EXAMPLE_CONFIG,
      target: {
        ...EXAMPLE_CONFIG.target,
        config: { url: 'https://private.example', headers: { Authorization: 'private-value' } },
      },
    };
    useRedTeamConfig.getState().setFullConfig(saved);
    const { user, router } = setup();
    await user.click(button('Plan with agent'));
    expect(input()).toHaveAccessibleDescription(
      /Promptfoo Cloud sees this chat.*URLs and variable names/,
    );
    expect(screen.getByText(/manual configuration stays private/)).toBeVisible();
    reply({ message: 'Where can I reach your app?', config: { redteam }, ...incomplete });
    await send(user, 'Test access to other users’ records');
    const partial = { redteam, targets: [{ id: 'http', config: { url: target.config.url } }] };
    reply({ message: 'Which header carries the key?', config: partial, ...incomplete });
    await send(user, localChat);
    reply({ message: 'Which variable holds your key?', ...incomplete });
    await send(user, 'X-Secret-Key');
    expect(screen.getByRole('log')).toHaveTextContent('Which variable holds your key?');
    expect(input()).toHaveFocus();
    reply({ message: 'Set it on the computer running Promptfoo.', ...incomplete });
    await send(user, 'Where do I set that?');
    await send(user, 'LOCAL_CHAT_KEY');
    expect(button('Test connection')).toHaveAccessibleDescription(
      /POST to http:\/\/localhost:3555\/chat using X-Secret-Key.*LOCAL_CHAT_KEY/,
    );
    expect(payloads()[3]).toMatchObject({
      version: 3,
      config: partial,
      messages: expect.arrayContaining([
        userMessage('X-Secret-Key'),
        userMessage('Where do I set that?'),
      ]),
    });
    expect(JSON.stringify(payloads())).not.toMatch(/private\.example|private-value/);
    await user.click(button('Review setup'));
    expect(router.state.location.hash).toBe('#agent-review');
    expect(button('Run Now')).toBeEnabled();
    expect(postCalls().every(([path]) => path === '/redteam/setup-plan')).toBe(true);
    expect(config()).toEqual(saved);
    await user.click(button('Continue conversation'));
    await user.click(button('Return to configuration'));
    expect(config()).toEqual(saved);
  });

  it('uses the full native document for review and run, preserving multiple targets, advanced strategies and settings', async () => {
    const { user } = setup();
    const native = {
      description: 'Compare two apps',
      providers: [target, second],
      prompts: ['First {{prompt}}', 'Second {{prompt}}'],
      redteam: {
        ...redteam,
        plugins: [
          { id: 'policy', config: { policy: 'Do not give discounts.' }, numTests: 5 },
          'bola',
        ],
        strategies: ['basic', { id: 'crescendo', config: { maxRounds: 6 } }],
      },
      defaultTest: { vars: { region: 'eu' } },
      evaluateOptions: { maxConcurrency: 2 },
    };
    reply({
      message: 'Review both targets.',
      config: native,
      ...metadata,
      testableTargets: [0, 1],
    });
    await send(user, endpointMessage);
    reply({ message: 'Use Run Now after reviewing.', ...metadata, testableTargets: [0, 1] });
    await send(user, 'yes, run it');
    expect(payloads()[1].config).toEqual(native);
    await user.click(button('Review setup'));
    expect(screen.getByText('X-Secret-Key: {{env.LOCAL_CHAT_KEY}}')).toBeVisible();
    expect(screen.getByText(/Policy Compliance \(5 tests\)/)).toBeVisible();
    expect(screen.getByText(/3 per plugin by default/)).toBeVisible();
    expect(screen.getByText(/can multiply the number of requests/)).toBeVisible();
    await user.click(screen.getByText('View YAML'));
    const yaml = screen.getByText(/maxRounds: 6/).textContent!;
    expect(load(yaml)).toEqual(native);
    expect(postCalls()).toHaveLength(2);
    await user.click(button('Run Now'));
    expect(postCalls()[2][0]).toBe('/redteam/run');
    expect(payloads()[2]).toEqual({
      config: native,
      fromAgent: true,
      force: true,
      userTurns: [endpointMessage, 'yes, run it'],
    });
    expect(config().plugins).toEqual([]);
  });

  it('offers privileged drafts for inspection without a run or manual handoff shortcut', async () => {
    const { user } = setup();
    const unsafe = { targets: ['file://agent.py'], redteam, extensions: ['file://hook.js'] };
    reply({
      message: 'Inspect these files first.',
      config: unsafe,
      ...incomplete,
      runIssue: 'This configuration loads local code.',
    });
    await send(user, 'Scan a custom Python app.');
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    await user.click(button('Review draft'));
    expect(screen.getByText('For inspection only.')).toBeVisible();
    expect(screen.getByText(/This configuration loads local code/)).toBeVisible();
    expect(button('Run Now')).toBeDisabled();
    expect(button('Save YAML')).toBeEnabled();
    expect(screen.queryByText('promptfoo redteam run')).toBeNull();
    await user.click(screen.getByText('View YAML'));
    expect(load(screen.getByText(/file:\/\/hook.js/).textContent!)).toEqual(unsafe);
    await user.click(button('Continue conversation'));
    await user.click(button('Set up manually'));
    expect(config().plugins).toEqual([]);
    expect(JSON.stringify(config())).not.toMatch(/agent\.py|hook\.js/);
    expect(postCalls()).toHaveLength(1);
  });

  it('requires server permission and a supported request shape before offering a test', async () => {
    const { user } = setup();
    reply({ message: 'Permission missing.', config: draft, ...incomplete });
    await send(user, endpointMessage);
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    reply({
      message: 'Custom target.',
      config: {
        redteam,
        targets: [{ ...target, config: { ...target.config, transformResponse: 'process.exit()' } }],
      },
      ...incomplete,
      testableTargets: [0],
    });
    await send(user, 'What about a custom transform?');
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
  });

  it('reviews a partial draft and continues chatting without touching the editor', async () => {
    const { user } = setup();
    reply({ message: 'Where can I reach it?', config: { redteam }, ...incomplete });
    await send(user, 'Look up orders');
    await user.click(button('Review draft'));
    expect(button('Run Now')).toBeDisabled();
    expect(button('Save YAML')).toBeEnabled();
    await user.click(button('Continue conversation'));
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    expect(button('Run Now')).toBeEnabled();
    expect(config().plugins).toEqual([]);
  });

  it('sends one explicit test to the selected target and clears only stale results when the agent edits a target', async () => {
    const { user } = setup();
    const both = { ...draft, targets: [target, second] };
    const permitted = { ...metadata, testableTargets: [0, 1] };
    const success = { success: true, message: 'Found a reply.' };
    const failure = {
      success: false,
      message: 'The reply field was missing.',
      paths: ['answer.text'],
    };
    reply({ message: 'Both targets are ready to test.', config: both, ...permitted });
    await send(user, endpointMessage);
    reply(success);
    reply({ message: 'The first endpoint passed.', ...permitted });
    await user.click(button('Test connection'));
    expect(payloads()[1]).toEqual(target);
    expect(payloads()[2].verification).toEqual({ ...success, targetIndex: 0 });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Test target' }), '1');
    expect(button('Test connection')).toHaveAccessibleDescription(/other\.example/);
    const fixed = {
      ...second,
      config: { ...second.config, transformResponse: 'json.answer.text' },
    };
    reply(failure);
    reply({
      message: 'I changed the field. Try again.',
      config: { ...both, targets: [target, fixed] },
      ...permitted,
    });
    await user.click(button('Test connection'));
    expect(payloads()[3]).toEqual(second);
    expect(payloads()[4]).toMatchObject({
      verification: {
        ...failure,
        message: expect.stringContaining('target[0] passed'),
        targetIndex: 1,
      },
      config: both,
    });
    expect(screen.getByRole('log')).toHaveTextContent('The reply field was missing.');
    expect(screen.getByText('Test passed')).toBeVisible();
    expect(screen.getByText('Untested')).toBeVisible();
    expect(input()).toHaveFocus();
    expect(postCalls()).toHaveLength(5);
    reply(success);
    reply({ message: 'Both have passed.', ...permitted });
    await user.click(button('Test connection'));
    expect(payloads()[5]).toEqual(fixed);
    await user.click(button('Review setup'));
    expect(screen.getAllByText('Test passed')).toHaveLength(2);
  });

  it('supports a singleton target, reply discovery and retrying agent feedback without resending the probe', async () => {
    const { user } = setup();
    const { transformResponse: _, ...partial } = target.config;
    reply({
      message: 'Check the response format.',
      config: { redteam, targets: { ...target, config: partial } },
      ...incomplete,
      testableTargets: [0],
    });
    await send(user, endpointMessage);
    const result = {
      success: true,
      message: 'Found possible reply fields.',
      paths: ['choices[0].message.content'],
    };
    reply(result);
    api.mockRejectedValueOnce(new Error('private transport detail'));
    await user.click(button('Test connection'));
    expect(payloads()[2].verification).toEqual({ ...result, targetIndex: 0 });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the setup agent');
    expect(screen.getByRole('log')).not.toHaveTextContent('private transport detail');
    await user.click(button('Retry agent reply'));
    expect(payloads()[3].verification).toEqual(payloads()[2].verification);
    expect(screen.getByText('Untested')).toBeVisible();
    expect(postCalls().filter(([path]) => path.endsWith('connection-test'))).toHaveLength(1);
    expect(button('Review setup')).toBeEnabled();
  });

  it('retains the last valid draft on server rejection and keeps rejected input out of history', async () => {
    const { user } = setup();
    await send(user, endpointMessage);
    api.mockResolvedValueOnce(
      Response.json({ error: 'Use an environment variable.' }, { status: 400 }),
    );
    await send(user, 'sk-proj-private-canary');
    expect(screen.getByRole('log')).not.toHaveTextContent('private-canary');
    expect(screen.getByRole('alert')).toHaveTextContent('Use an environment variable.');
    expect(button('Review setup')).toBeDisabled();
    await user.clear(input());
    await send(user, 'Why those tests?');
    expect(payloads().pop().config).toEqual(draft);
    expect(JSON.stringify(payloads().pop())).not.toContain('private-canary');
  });

  it('rejects a reply without local readiness metadata and keeps the user’s message editable', async () => {
    const { user } = setup();
    reply({ message: 'Ready.', config: draft });
    await send(user, endpointMessage);
    expect(input()).toHaveValue(endpointMessage);
    expect(screen.queryByRole('button', { name: 'Review setup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    await user.click(button('Send reply'));
    expect(button('Review setup')).toBeEnabled();
  });

  it('seeds the public demo with its target and per-test session ID', async () => {
    const { user } = setup();
    await user.click(button('Try the demo app'));
    const { targets, prompts, defaultTest } = getRuntimeRedteamConfig(EXAMPLE_CONFIG);
    const demo = { targets, prompts, defaultTest };
    reply({ message: 'Ready to test the demo.', config: { ...demo, redteam }, ...metadata });
    await user.click(button('Send reply'));
    expect(payloads()[0].config).toEqual(demo);
    expect(payloads()[0].messages[0].content).toContain(EXAMPLE_CONFIG.target.config.url);
    expect(button('Test connection')).toBeEnabled();
    await user.click(button('Review setup'));
    expect(button('Run Now')).toBeEnabled();
    expect(config().plugins).toEqual([]);
  });

  it('cancels pending run preparation when the user leaves review', async () => {
    const { user } = setup();
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    let finish!: (response: Response) => void;
    api.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    await user.click(button('Run Now'));
    await user.click(button('Continue conversation'));
    await act(() => finish(Response.json({ hasEmail: true })));
    expect(postCalls()).toHaveLength(1);
  });

  it('shows credential references as text, formats agent field names and avoids rendering links from model output', async () => {
    const { user } = setup();
    reply({ message: 'Use `X-Key`. <img src="https://tracker.invalid/pixel">', ...incomplete });
    await send(user, 'Why?');
    const log = screen.getByRole('log');
    expect(log.querySelector('code')).toHaveTextContent('X-Key');
    expect(log.querySelector('img')).toBeNull();
    expect(log.querySelector('a')).toBeNull();
  });

  it('locks duplicate requests, aborts when leaving setup and ignores late verification results', async () => {
    const { user } = setup();
    await send(user, endpointMessage);
    let finish!: (response: Response) => void;
    api.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    await user.click(button('Test connection'));
    expect(button('Test connection')).toBeDisabled();
    expect(button('Review setup')).toBeDisabled();
    await user.click(button('Set up manually'));
    expect(postCalls()[1][1]?.signal?.aborted).toBe(true);
    await act(() => finish(Response.json({ success: true, message: 'OK' })));
    expect(postCalls()).toHaveLength(2);
  });

  it('aborts pending requests on manual fallback and ignores late results', async () => {
    const { user, router } = setup();
    let resolve!: (value: Response) => void;
    api.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    await send(user, 'Support bot');
    await user.click(button('Set up manually'));
    expect(postCalls()[0][1]?.signal?.aborted).toBe(true);
    await act(() => resolve(Response.json({ message: 'Done', config: draft, ...metadata })));
    await act(() => router.navigate(-1));
    expect(input()).toHaveValue('Support bot');
    expect(config().plugins).toEqual([]);
  });

  it('supports manual setup when remote generation is disabled', async () => {
    api.mockResolvedValueOnce(Response.json({ enabled: false }));
    const { user, router } = setup();
    expect(await screen.findByText('Agent setup is turned off')).toBeInTheDocument();
    await user.click(button('Set up manually'));
    expect(router.state.location.hash).toBe('#0');
    expect(postCalls()).toHaveLength(0);
  });

  it('opens numbered deep links directly even on first visit', () => {
    setup('#5');
    expect(screen.getByRole('heading', { name: 'Review & Run' })).toBeInTheDocument();
    expect(button('Run Now')).toBeDisabled();
    expect(api).not.toHaveBeenCalledWith('/redteam/setup-plan', expect.anything());
  });

  it('requires a new review click after a reload clears the previous draft', async () => {
    const { user, router } = setup('#agent-review');
    await screen.findByRole('textbox', { name: 'Message the setup agent' });
    await send(user, endpointMessage);
    expect(router.state.location.hash).toBe('#agent');
    expect(button('Review setup')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Run Now' })).toBeNull();
  });
});
