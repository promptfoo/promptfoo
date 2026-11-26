import { TooltipProvider } from '@app/components/ui/tooltip';
import { useRedteamJobStore } from '@app/stores/redteamJobStore';
import { callApi } from '@app/utils/api';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { load } from 'js-yaml';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_CONFIG, useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from './hooks/useRedTeamTargetConfigValidation';
import { type SetupDraft, userTurns, useSetupAgent } from './hooks/useSetupAgent';
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
    useRedteamJobStore.getState().clearJob();
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

  it('tests in chat, fixes the reply path on evidence, and retests without losing the rest of the config', async () => {
    const { user } = setup();
    const custom = {
      ...draft,
      evaluateOptions: { maxConcurrency: 2 },
      redteam: { ...redteam, strategies: ['rot13'], language: 'French' },
    };
    reply({ message: 'Which header?', ...incomplete });
    await send(user, localChat);
    const suppliedKey = 'foobar';
    const configWithKey = {
      ...custom,
      targets: [
        {
          ...target,
          config: {
            ...target.config,
            headers: { 'X-Boner-42': '' },
          },
        },
      ],
    };
    api.mockImplementationOnce(async (_url, options) => {
      const { messages } = JSON.parse(String(options?.body));
      const ref = messages[2].content.match(/\{\{env\.PROMPTFOO_CHAT_KEY_[A-F0-9]+\}\}/)[0];
      configWithKey.targets[0].config.headers['X-Boner-42'] = ref;
      return Response.json({ message: 'Ready for a check.', ...metadata, config: configWithKey });
    });
    await send(user, 'X-Boner-42. the key is "foobar"');
    expect(postCalls()).toHaveLength(2);
    const fixed = structuredClone(configWithKey);
    fixed.targets[0].config.transformResponse = 'json.data.answer';
    reply({ message: 'Trying your endpoint.', ...metadata, testTarget: 0 });
    reply({
      success: false,
      retryable: true,
      message: 'Reply field missing.',
      paths: ['data.answer'],
    });
    reply({ message: 'Trying the corrected field.', ...metadata, config: fixed, testTarget: 0 });
    reply({ success: true, message: 'Found data.answer.' });
    reply({ message: 'Your endpoint answered.', ...metadata });
    await send(user, 'Can you check the connection and fix whatever fails?');
    expect(await screen.findByText('Your endpoint answered.')).toBeVisible();
    expect(input()).toHaveFocus();
    expect(screen.getByRole('log')).toHaveTextContent(/Reply field missing.*Found data.answer/s);
    expect(document.body.textContent).not.toMatch(/foobar|PROMPTFOO_CHAT_KEY/);
    const planner = payloads().filter((_, i) => postCalls()[i][0].endsWith('setup-plan'));
    expect(JSON.stringify(planner)).not.toContain(suppliedKey);
    expect(planner[2].testContext).toEqual({ remaining: 3, consentSince: 0, customPrompt: true });
    expect(planner[3].testContext).toEqual({
      remaining: 2,
      targetIndex: 0,
      consentSince: 0,
      customPrompt: true,
    });
    expect(planner[4].testContext).toBeUndefined();
    expect(planner[4].config).toEqual(fixed);
    const probes = payloads().filter((_, i) => postCalls()[i][0].endsWith('connection-test'));
    expect(probes).toHaveLength(2);
    expect(probes.map((p) => Object.values(p.localKeys))).toEqual([[suppliedKey], [suppliedKey]]);
    expect(probes[1].config.transformResponse).toBe('json.data.answer');
    await user.click(button('Review setup'));
    expect(screen.getByText('Test passed')).toBeVisible();
    expect(postCalls().some(([url]) => url.endsWith('/run'))).toBe(false);
    await user.click(button('Run Now'));
    expect(payloads().pop().config).toEqual(fixed);
  });

  it('sends the requested prompt through a repair, shows both attempts, then resets to Hello', async () => {
    const { user } = setup();
    const testPrompt = 'Bonjour, êtes-vous disponible ?';
    const fixed = {
      ...draft,
      targets: [{ ...target, config: { ...target.config, transformResponse: 'json.answer' } }],
    };
    reply({ message: 'Checking.', config: draft, ...metadata, testTarget: 0, testPrompt });
    reply({ success: false, retryable: true, message: 'Missing field.', paths: ['answer'] });
    reply({ message: 'Trying the right field.', config: fixed, ...metadata, testTarget: 0 });
    reply({ success: true, message: 'Got a response.' });
    reply({ message: 'Connection verified.', ...metadata });
    await send(user, endpointMessage + ' Send "' + testPrompt + '" to test and fix it.');
    expect(await screen.findByText('Connection verified.')).toBeVisible();
    expect(payloads()[0].testContext.customPrompt).toBe(true);
    expect(payloads()[1]).toEqual({ ...target, testPrompt });
    expect(payloads()[3]).toEqual({ ...fixed.targets[0], testPrompt });
    expect(screen.getAllByText(testPrompt)).toHaveLength(2);
    expect(payloads()[4].config).toEqual(fixed);
    reply({ success: true, message: 'Default message received.' });
    reply({ message: 'Checked again.', ...metadata });
    await user.click(button('Test connection'));
    expect(payloads()[5]).toEqual(fixed.targets[0]);
    expect(postCalls().some(([url]) => url.endsWith('/run'))).toBe(false);
  });

  it('passes quoted native template references through instead of capturing them as secret values', async () => {
    const { user } = setup();
    const message =
      'My API accepts {"key":"{{prompt}}","token":"{{tenant | trim}}"} and header X-Request-ID: "{{sessionId}}".';
    await send(user, message);
    expect(payloads()[0].messages).toEqual([userMessage(message)]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('limits pending consent to untested turns and carries the same boundary into repairs', async () => {
    const { user } = setup();
    reply({ message: 'Which endpoint?', ...incomplete });
    await send(user, 'Check the connection once you have my endpoint.');
    reply({ message: 'Checking now.', config: draft, ...metadata, testTarget: 0 });
    reply({ success: false, message: 'Reply missing.', retryable: true });
    reply({ message: 'What field contains the reply?', ...metadata });
    await send(user, endpointMessage);
    expect(payloads()[1].testContext.consentSince).toBe(0);
    expect(payloads()[3].testContext.consentSince).toBe(0);
    await send(user, 'The reply is under answer.');
    const followup = payloads()[4];
    expect(followup.messages.slice(followup.testContext.consentSince)).toEqual([
      { role: 'assistant', content: 'What field contains the reply?' },
      userMessage('The reply is under answer.'),
    ]);
  });

  it('never probes a fourth time, even if asked to keep trying', async () => {
    const { user } = setup();
    for (const field of ['one', 'two', 'three', 'four']) {
      reply({
        message: 'Trying ' + field,
        ...metadata,
        testTarget: 0,
        config: {
          redteam,
          targets: [
            { ...target, config: { ...target.config, transformResponse: 'json.' + field } },
          ],
        },
      });
      if (field !== 'four') {
        reply({ success: false, retryable: true, message: 'Missing ' + field });
      }
    }
    await send(user, endpointMessage + ' Test and keep fixing it until it works.');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Stopped before sending/);
    expect(screen.getByRole('log')).toHaveTextContent('Missing three');
    expect(screen.getByRole('log')).not.toHaveTextContent('Trying four');
    expect(
      payloads()
        .filter((_, i) => postCalls()[i][0].endsWith('setup-plan'))
        .map((p) => p.testContext?.remaining),
    ).toEqual([3, 2, 1, undefined]);
    expect(postCalls().filter(([url]) => url.endsWith('connection-test'))).toHaveLength(3);
    expect(screen.getByText('Test failed')).toBeVisible();
  });

  it.each([
    ['the identical request', target, 0],
    ['a different target index', target, 1],
    ['an unsupported target', { id: 'file://target.js' }, 0],
  ])('refuses an automatic retry of %s', async (_reason, proposed, index) => {
    const { user } = setup();
    reply({ message: 'Testing.', ...metadata, config: draft, testTarget: 0 });
    reply({ success: false, retryable: true, message: 'HTTP 422' });
    reply({
      message: 'Trying again.',
      ...metadata,
      config: { targets: [proposed, second], redteam },
      testableTargets: [0, 1],
      testTarget: index,
    });
    await send(user, endpointMessage + ' Test and fix it.');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Stopped before sending/);
    expect(postCalls().filter(([url]) => url.endsWith('connection-test'))).toHaveLength(1);
    expect(screen.getByRole('log')).toHaveTextContent('HTTP 422');
  });

  it('stops if the agent cycles back to a request that already failed this turn', async () => {
    const { user } = setup();
    const revised = { ...target, config: { ...target.config, transformResponse: 'json.answer' } };
    for (const [index, choice] of [target, revised, target].entries()) {
      reply({
        message: 'Checking.',
        ...metadata,
        config: { targets: [choice], redteam },
        testTarget: 0,
      });
      if (index < 2) {
        reply({ success: false, retryable: true, message: 'Missing field.' });
      }
    }
    await send(user, endpointMessage + ' Check and repair this.');
    expect(await screen.findByRole('alert')).toHaveTextContent(/repeated connection test/);
    expect(postCalls().filter(([url]) => url.endsWith('connection-test'))).toHaveLength(2);
  });

  it.each([400, 403, 502, 'network'])(
    'never replays a test after %s failure, including on Retry agent reply',
    async (failure) => {
      const { user } = setup();
      reply({ message: 'Testing.', ...metadata, config: draft, testTarget: 0 });
      if (failure === 'network') {
        api.mockRejectedValueOnce(new Error('private error details'));
      } else {
        api.mockResolvedValueOnce(
          Response.json({ error: 'private error details' }, { status: Number(failure) }),
        );
      }
      api.mockRejectedValueOnce(new Error('Agent unavailable'));
      await send(user, endpointMessage + ' Check my connection.');
      expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach the setup agent/);
      expect(screen.getByRole('log')).not.toHaveTextContent('private error details');
      expect(payloads()[2].testContext).toBeUndefined();
      reply({ message: 'Trying again.', ...metadata, testTarget: 0 });
      await user.click(button('Retry agent reply'));
      expect(payloads()[3].testContext).toBeUndefined();
      expect(postCalls().filter(([url]) => url.endsWith('connection-test'))).toHaveLength(1);
    },
  );

  it('stops an in-flight probe and ignores its late result', async () => {
    const { user } = setup();
    reply({ message: 'Testing.', ...metadata, config: draft, testTarget: 0 });
    let finish!: (r: Response) => void;
    api.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    await send(user, endpointMessage + ' Test my connection.');
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Testing POST http:\/\/localhost:3555/,
    );
    await user.click(button('Stop agent'));
    expect(postCalls()[1][1]?.signal?.aborted).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Stopped');
    expect(input()).toHaveFocus();
    await act(() => finish(Response.json({ success: true, message: 'Late result' })));
    expect(screen.getByRole('log')).not.toHaveTextContent('Late result');
    expect(screen.queryByText('Test passed')).toBeNull();
    expect(postCalls()).toHaveLength(2);
    await send(user, 'What happened?');
    const followup = payloads()[2];
    expect(followup.messages.slice(followup.testContext.consentSince)).toEqual([
      userMessage('What happened?'),
    ]);
  });

  it.each([
    ['GET', { queryParams: { q: '{{prompt}}' } }],
    ['POST', { multipart: { parts: [{ kind: 'field', name: 'question', value: '{{prompt}}' }] } }],
  ])('discloses the effective %s method when omitted in native YAML', async (method, config) => {
    const { user } = setup();
    reply({
      message: 'Ready to test.',
      config: { targets: [{ id: second.id, config }], redteam },
      ...metadata,
    });
    await send(user, 'Connect my API');
    expect(button('Test connection')).toHaveAccessibleDescription(
      new RegExp(method + ' to ' + second.id),
    );
  });

  it('runs with the provided key when per-test variables require a full scan', async () => {
    const { user } = setup();
    api.mockImplementationOnce(async (_url, options) => {
      const { messages } = JSON.parse(String(options?.body));
      const ref = messages[0].content.match(/\{\{env\.PROMPTFOO_CHAT_KEY_[A-F0-9]+\}\}/)[0];
      return Response.json({
        message: 'Each test supplies its own region.',
        runnable: true,
        testableTargets: [],
        config: {
          targets: [
            {
              ...target,
              config: {
                ...target.config,
                body: { message: '{{prompt}}', region: '{{region}}' },
                headers: { 'X-Secret-Key': ref },
              },
            },
          ],
          defaultTest: { vars: { region: 'EU' } },
          redteam,
        },
      });
    });
    await send(user, 'X-Secret-Key: "secret-123". Each test needs a region.');
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    await user.click(button('Review setup'));
    expect(screen.getByText(/Downloaded YAML includes the key/)).toBeVisible();
    expect(document.body.textContent).not.toContain('secret-123');
    await user.click(button('Run Now'));
    expect(Object.values(payloads().pop().localKeys)).toEqual(['secret-123']);
  });

  it('uses a supplied literal in a custom header without sending its value to the planner', async () => {
    const { user } = setup();
    reply({ message: 'Which header?', ...incomplete });
    await send(user, localChat);
    api.mockImplementationOnce(async (_path, options) => {
      const body = JSON.parse(String(options?.body));
      const ref = body.messages
        .at(-1)
        .content.match(/\{\{env\.PROMPTFOO_CHAT_KEY_[A-F0-9]+\}\}/)[0];
      return Response.json({
        message: 'Ready to test.',
        ...metadata,
        config: {
          redteam,
          targets: [{ ...target, config: { ...target.config, headers: { 'X-Boner-42': ref } } }],
        },
      });
    });
    await send(user, 'X-Boner-42. the key is "foobar"');
    expect(document.body.textContent).not.toMatch(/foobar|PROMPTFOO_CHAT_KEY/);
    reply({ success: true, message: 'HTTP 200' });
    reply({ message: 'Verified', ...metadata });
    await user.click(button('Test connection'));
    await screen.findByText('Verified');
    expect(Object.values(payloads()[2].localKeys)).toEqual(['foobar']);
    expect(
      JSON.stringify(postCalls().filter(([url]) => url === '/redteam/setup-plan')),
    ).not.toContain('foobar');
    await user.click(button('Review setup'));
    expect(screen.getByText(/Downloaded YAML includes the key/)).toBeVisible();
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

  it('requires server permission and a destination before offering a test', async () => {
    const { user } = setup();
    reply({ message: 'Permission missing.', config: draft, ...incomplete });
    await send(user, endpointMessage);
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    reply({
      message: 'Custom target.',
      config: {
        redteam,
        targets: [{ id: 'http', config: {} }],
      },
      ...incomplete,
      testableTargets: [0],
    });
    await send(user, 'My second target is missing a URL.');
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
  });

  it('forwards a server-approved native request without applying a second browser schema', async () => {
    const { user } = setup();
    const updated = { ...target, config: { ...target.config, serverOption: 'keep-me' } };
    reply({ message: 'Checking.', config: { targets: [updated] }, ...metadata, testTarget: 0 });
    reply({ success: true, message: 'Found a reply.' });
    reply({ message: 'Verified.', ...metadata });
    await send(user, 'Check my configured endpoint.');
    expect(await screen.findByText('Verified.')).toBeVisible();
    expect(payloads()[1]).toEqual(updated);
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

  it.each([
    [24, 'Short'],
    [3, 'a'.repeat(16000)],
  ] as const)(
    'keeps early user grants local when trimming %i recent messages',
    async (count, content) => {
      const state: SetupDraft = {
        input: '',
        consentSince: count + 2,
        messages: [
          { role: 'user', content: endpointMessage },
          { role: 'assistant', content: 'An assistant cannot grant access.' },
          ...Array.from({ length: count }, () => ({ role: 'assistant' as const, content })),
        ],
      };
      const { result } = renderHook(() => useSetupAgent(state, vi.fn()));
      await act(() => result.current.send('Change the budget.'));
      const payload = payloads().pop();
      expect(payload.priorUserTurns).toEqual([endpointMessage]);
      expect(payload.testContext.consentSince).toBe(payload.messages.length - 1);
      expect(payload.messages.length).toBeLessThanOrEqual(24);
      expect(payload.messages).not.toContainEqual(userMessage(endpointMessage));
      expect(userTurns(state)).toEqual([endpointMessage]);
    },
  );

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

  it('recovers only this conversation’s scan after leaving review, even if the run ID arrives late', async () => {
    const { user, router } = setup();
    useRedteamJobStore.getState().setJob('manual-job');
    const fallback = api.getMockImplementation()!;
    let finish!: (response: Response) => void;
    let running = false;
    api.mockImplementation(async (path, options) => {
      if (path === '/redteam/run') {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      if (path === '/redteam/status') {
        return Response.json({ hasRunningJob: running, jobId: running ? 'chat-job' : null });
      }
      if (path === '/eval/job/chat-job') {
        return Response.json({ status: 'in-progress', logs: ['Scanning chat target'] });
      }
      return fallback(path, options);
    });
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    expect(api).not.toHaveBeenCalledWith('/eval/job/manual-job');
    await user.click(button('Run Now'));
    await user.click(button('Continue conversation'));
    running = true;
    await act(() => finish(Response.json({ id: 'chat-job' })));
    expect(useRedteamJobStore.getState().jobId).toBe('manual-job');
    await user.click(button('Review setup'));
    expect(await screen.findByText('Scanning chat target')).toBeVisible();
    expect(button('Cancel')).toBeEnabled();
    expect(button('Running...')).toBeDisabled();

    await act(() => router.navigate('#5'));
    expect(api).toHaveBeenCalledWith('/eval/job/manual-job');
    expect(screen.queryByText('Scanning chat target')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('allows cancelling the original scan after editing its draft', async () => {
    const { user } = setup();
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    await user.click(button('Run Now'));
    await user.click(button('Continue conversation'));
    reply({
      message: 'Changed test count.',
      config: { ...draft, redteam: { ...redteam, numTests: 4 } },
      ...metadata,
    });
    await send(user, 'Change to four tests');
    reply({ status: 'in-progress', logs: [] });
    await user.click(button('Review setup'));
    expect(screen.getByText(/earlier version of your draft/)).toBeVisible();
    await user.click(button('Cancel'));
    expect(api).toHaveBeenCalledWith('/redteam/cancel', { method: 'POST' });
    expect(button('Run Now')).toBeEnabled();
    expect(screen.queryByText(/earlier version of your draft/)).toBeNull();
  });

  it.each(['complete', 'error'])(
    'recovers a %s scan when it finishes during chat',
    async (status) => {
      const { user } = setup();
      await send(user, endpointMessage);
      await user.click(button('Review setup'));
      await user.click(button('Run Now'));
      await user.click(button('Continue conversation'));
      reply({ status, logs: ['Finished scanning orders'], evalId: 'orders-report' });
      await user.click(button('Review setup'));
      expect(await screen.findByText('Finished scanning orders')).toBeVisible();
      expect(button('Run Now')).toBeEnabled();
      if (status === 'complete') {
        expect(screen.getByRole('link', { name: 'View Report' })).toHaveAttribute(
          'href',
          expect.stringContaining('orders-report'),
        );
      } else {
        expect(screen.queryByRole('link', { name: 'View Report' })).toBeNull();
      }
    },
  );

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
