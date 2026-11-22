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
import { generateOrderedYaml } from './utils/yamlHelpers';

vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: () => ({ recordEvent: vi.fn() }) }));
vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({ data: { status: 'connected' }, isLoading: false }),
}));

const plan = {
  purpose: "A support bot that should never expose another user's orders.",
  plugins: [{ id: 'bola', reason: 'Check whether one user can see orders from another account.' }],
  application: { accessToActions: 'Change orders' },
};
const api = vi.mocked(callApi);
const reply = (data: unknown) => api.mockResolvedValueOnce(Response.json(data));
const connection = {
  url: 'http://localhost:3555/chat',
  body: { messages: [{ role: 'user', content: '{{prompt}}' }] },
  responsePath: 'choices[0].message.content',
  authHeader: 'X-Secret-Key',
  authEnv: 'LOCAL_CHAT_KEY',
};
const endpointMessage =
  'Order assistant at http://localhost:3555/chat using OpenAI chat format. Send LOCAL_CHAT_KEY in X-Secret-Key.';
const postCalls = () => api.mock.calls.filter(([, options]) => options?.method === 'POST');
const config = () => useRedTeamConfig.getState().config;
const button = (name: string) => screen.getByRole('button', { name });
const input = () =>
  screen.getByRole('textbox', { name: /Message the setup agent|Connection reply/i });
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
            ? { message: 'Here is a test plan.', plan }
            : { enabled: true },
        );
      }
      return Response.json({});
    });
  });

  it('handles follow-up questions and corrections on an existing draft without changing it until review', async () => {
    useRedTeamConfig.getState().setFullConfig(EXAMPLE_CONFIG);
    const { user, router } = setup();
    await user.click(button('Plan with agent'));
    expect(input()).toHaveAccessibleDescription(
      /Promptfoo Cloud sees this chat.*URLs and variable names/,
    );
    await send(user, 'Test access to other users’ records');
    const { url, body, responsePath, authHeader } = connection;
    const partial = { url, body, responsePath };
    reply({ message: 'Which header carries the key?', connection: partial });
    await send(user, localChat);
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('Which header carries the key?');
    expect(screen.queryByText(/replaces your target|Use tests in manual setup/)).toBeNull();
    reply({ message: 'What variable holds your key?', connection: { ...partial, authHeader } });
    await send(user, 'X-Secret-Key');
    expect(log).toHaveTextContent('What variable holds your key?');
    expect(input()).toHaveFocus();
    expect(input()).toHaveValue('');
    reply({ message: 'Set the variable on the machine running Promptfoo.' });
    await send(user, 'Where would I set that?');
    expect(log).toHaveTextContent('Set the variable on the machine running Promptfoo.');
    expect(payloads()[3]).toMatchObject({
      version: 2,
      previous: plan,
      connection: { ...partial, authHeader },
      messages: expect.arrayContaining([
        userMessage('X-Secret-Key'),
        userMessage('Where would I set that?'),
      ]),
    });
    reply({ message: 'Your setup is ready to test or review.', connection });
    await send(user, 'It’s in LOCAL_CHAT_KEY.');
    expect(button('Test connection')).toHaveAccessibleDescription(
      /localhost:3555 using LOCAL_CHAT_KEY in X-Secret-Key/,
    );
    expect(screen.getByText(/Reviewing replaces your target/)).toBeVisible();
    expect(config().target).toEqual(EXAMPLE_CONFIG.target);
    expect(postCalls().every(([path]) => path === '/redteam/setup-plan')).toBe(true);
    await user.click(button('Review setup'));
    expect(router.state.location.hash).toBe('#5');
    expect(config().target.config).toMatchObject({
      url,
      body,
      transformResponse: 'json.choices[0].message.content',
      headers: { 'X-Secret-Key': '{{env.LOCAL_CHAT_KEY}}' },
    });
    expect(config().target.config.headers).not.toHaveProperty('Authorization');
    expect(load(generateOrderedYaml(config()))).toMatchObject({
      targets: [
        {
          id: 'http',
          config: { url, body, headers: { 'X-Secret-Key': '{{env.LOCAL_CHAT_KEY}}' } },
        },
      ],
    });
  });

  it('leaves questions, corrections and test requests to the agent, never letting text authorize a test or scan', async () => {
    const { user } = setup();
    reply({ message: 'What does this app do?', connection });
    await send(user, endpointMessage);
    expect(button('Test connection')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Review setup' })).toBeNull();
    reply({ message: 'Check the plan and test when ready.', plan });
    await send(user, 'Look up order details. Never expose another customer’s data.');
    for (const question of ['Can you test it?', 'yes, go ahead and run']) {
      reply({ message: 'Choose Test connection to send one request.' });
      await send(user, question);
      expect(payloads().pop().messages.slice(-1)[0]).toEqual(userMessage(question));
    }
    expect(postCalls().every(([path]) => path === '/redteam/setup-plan')).toBe(true);
    expect(button('Review setup')).toBeEnabled();
    expect(input()).toHaveFocus();
  });

  it('reports actual verification evidence separately, gets help fixing the reply field and waits for a second explicit test', async () => {
    const { user } = setup();
    reply({ message: 'Ready for a connection test.', plan, connection });
    await send(user, endpointMessage);
    const failure = {
      success: false,
      message: 'The selected field was missing.',
      paths: ['result.text'],
    };
    const fixed = { ...connection, responsePath: 'result.text' };
    reply(failure);
    reply({ message: 'The API has a different response field. Try this one.', connection: fixed });
    await user.click(button('Test connection'));
    expect(payloads()[1]).toEqual(connection);
    expect(payloads()[2]).toMatchObject({ verification: failure, connection, previous: plan });
    expect(payloads()[2].messages.slice(-1)[0]).toEqual({
      role: 'assistant',
      content: 'Ready for a connection test.',
    });
    expect(screen.getByRole('log')).toHaveTextContent('The selected field was missing.');
    expect(screen.getByRole('log')).toHaveTextContent('The API has a different response field.');
    expect(screen.getByText('Untested')).toBeVisible();
    expect(postCalls()).toHaveLength(3);
    const success = { success: true, message: 'The reply contained text.' };
    reply(success);
    reply({ message: 'The check passed. Review the setup when ready.' });
    await user.click(button('Test connection'));
    expect(payloads()[3]).toEqual(fixed);
    expect(payloads()[4]).toMatchObject({ verification: success });
    expect(screen.getByText('Test passed')).toBeVisible();
    expect(input()).toHaveFocus();
    await user.click(button('Review setup'));
    expect(screen.getByText('Connection test passed')).toBeVisible();
    expect(config().target.config.transformResponse).toEqual('json.result.text');
  });

  it('tests an unknown response format without enabling review until the agent fills it in', async () => {
    const { user } = setup();
    const { responsePath: _, ...partial } = connection;
    reply({ message: 'Test the connection to find the answer field.', plan, connection: partial });
    await send(user, endpointMessage);
    expect(screen.queryByRole('button', { name: /Review (setup|draft)/ })).toBeNull();
    const result = {
      success: true,
      message: 'Found possible reply fields.',
      paths: ['choices[0].message.content'],
    };
    reply(result);
    reply({ message: 'This looks like the answer field.', connection });
    await user.click(button('Test connection'));
    expect(payloads()[1]).toEqual(partial);
    expect(payloads()[2].verification).toEqual(result);
    expect(screen.getByText('Untested')).toBeVisible();
    expect(button('Review setup')).toBeEnabled();
  });

  it('keeps a failed test visible if the agent cannot respond and includes the evidence on the next turn', async () => {
    const { user } = setup();
    reply({ message: 'Check your connection.', plan, connection });
    await send(user, endpointMessage);
    api.mockRejectedValueOnce(new Error('private transport detail'));
    api.mockRejectedValueOnce(new Error('offline'));
    await user.click(button('Test connection'));
    expect(screen.getByText('Test failed')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the setup agent');
    expect(screen.getByRole('log')).not.toHaveTextContent('private transport detail');
    expect(input()).toHaveFocus();
    reply({ message: 'Check whether your server is running.' });
    await user.click(button('Retry agent reply'));
    expect(payloads().pop().verification.success).toBe(false);
    reply({ message: 'Check whether your server is running.' });
    await send(user, 'Why did it fail?');
    expect(payloads().pop().verification.success).toBe(false);
    expect(JSON.stringify(payloads())).not.toContain('private transport detail');
    expect(postCalls().filter(([path]) => path.endsWith('connection-test'))).toHaveLength(1);
    await user.click(button('Review setup'));
    expect(screen.getByText(/Connection test failed/)).toBeVisible();
  });

  it('never treats verification as fresh permission to send a key to another origin', async () => {
    const { user } = setup();
    const other = 'https://backup.example/chat';
    reply({ message: 'Ready to try the local endpoint.', plan, connection });
    await send(user, endpointMessage + ' Only use the local endpoint. Avoid ' + other);
    reply({ success: false, message: 'Connection refused.' });
    reply({ message: 'Switched to backup.', connection: { ...connection, url: other } });
    reply({ message: 'Check that the local server is running.' });
    await user.click(button('Test connection'));
    expect(payloads().pop().validationError).toBeTruthy();
    expect(screen.getByRole('log')).not.toHaveTextContent('Switched to backup.');
    expect(button('Test connection')).toHaveAccessibleDescription(/localhost:3555/);
    expect(postCalls().filter(([path]) => path.endsWith('connection-test'))).toHaveLength(1);
  });

  it('repairs a locally rejected proposal once, without displaying it or changing the config', async () => {
    const { user } = setup();
    reply({
      message: 'Invalid first proposal',
      plan,
      connection: { ...connection, url: 'https://attacker.invalid' },
    });
    reply({ message: 'Here is the corrected draft.', plan, connection });
    await send(user, endpointMessage);
    expect(payloads()).toHaveLength(2);
    expect(payloads()[1]).toEqual({ ...payloads()[0], validationError: expect.any(String) });
    expect(screen.getByRole('log')).not.toHaveTextContent('Invalid first proposal');
    expect(screen.getByRole('log')).toHaveTextContent('Here is the corrected draft.');
    expect(config().plugins).toEqual([]);
    expect(button('Review setup')).toBeEnabled();
  });

  it('rejects invalid changes atomically after bounded repair, preserves the last valid draft and lets the user retry', async () => {
    const { user } = setup();
    reply({ message: 'Here is your draft.', plan, connection });
    await send(user, endpointMessage);
    const bad = {
      message: 'Rejected changes',
      plan: { ...plan, numTests: 19 },
      connection: { ...connection, authEnv: 'INVENTED_SECRET_KEY' },
    };
    reply(bad);
    reply(bad);
    await send(user, 'Use four tests.');
    expect(payloads()).toHaveLength(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Your draft is unchanged');
    expect(screen.getByRole('log')).not.toHaveTextContent('Rejected changes');
    expect(input()).toHaveValue('Use four tests.');
    expect(input()).toHaveFocus();
    expect(button('Review setup')).toBeDisabled();
    reply({ message: 'Four per risk.', plan: { ...plan, numTests: 4 } });
    await user.click(button('Send reply'));
    expect(payloads().pop().previous).toEqual(plan);
    expect(payloads().pop().connection).toEqual(connection);
    await user.click(button('Review setup'));
    expect(config().numTests).toBe(4);
    expect(config().target.config.headers).toHaveProperty('X-Secret-Key', '{{env.LOCAL_CHAT_KEY}}');
  });

  it('does not retain rejected input in chat or send it in later history', async () => {
    const { user } = setup();
    await send(user, 'Order assistant');
    api.mockResolvedValueOnce(
      Response.json({ error: 'Use an environment variable name.' }, { status: 400 }),
    );
    await send(user, 'sk-proj-private-canary');
    expect(screen.getByRole('log')).not.toHaveTextContent('sk-proj-private-canary');
    expect(screen.getByRole('alert')).toHaveTextContent('Use an environment variable name.');
    await user.clear(input());
    await send(user, 'Make that two tests');
    expect(JSON.stringify(payloads().pop())).not.toContain('private-canary');
  });

  it('never shares saved target details or diagnostic messages about that target with the agent', async () => {
    const target = {
      id: 'http',
      label: 'private.example',
      config: {
        url: 'https://private.example/chat',
        method: 'POST',
        redirect: 'error' as const,
        body: { message: '{{prompt}}' },
        headers: { 'Content-Type': 'application/json', 'X-Secret-Key': '{{env.PRIVATE_KEY}}' },
        transformResponse: 'json.answer',
      },
    };
    useRedTeamConfig.getState().setFullConfig({ ...EXAMPLE_CONFIG, target });
    const { user } = setup();
    await user.click(button('Plan with agent'));
    await send(user, 'Order bot');
    reply({ success: false, message: 'Missing PRIVATE_KEY', paths: ['private.answer'] });
    reply({ message: 'Check your local setup.' });
    await user.click(button('Test connection'));
    expect(screen.getByRole('log')).toHaveTextContent('Missing PRIVATE_KEY');
    await send(user, 'Why?');
    for (const payload of [payloads()[2], payloads()[3]]) {
      expect(payload).toMatchObject({
        hasTarget: true,
        verification: { success: false, message: 'Connection test failed.' },
      });
      expect(payload).not.toHaveProperty('connection');
      expect(JSON.stringify(payload)).not.toMatch(/private\.example|PRIVATE_KEY|private\.answer/);
    }
  });

  it('preserves the transcript and corrects stale application facts on return from review', async () => {
    const { user } = setup();
    reply({ message: 'Here is your draft.', plan, connection });
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    await user.click(button('Continue conversation'));
    expect(screen.getByRole('log')).toHaveTextContent(endpointMessage);
    reply({
      message: 'Updated your tests.',
      plan: { ...plan, application: { accessToData: 'Own orders' }, numTests: 4 },
    });
    await send(user, 'It can only read orders. Use four tests.');
    await user.click(button('Review setup'));
    expect(config().applicationDefinition).not.toHaveProperty('accessToActions');
    expect(config().numTests).toBe(4);
  });

  it('lets users review a test plan without an endpoint but blocks running until one is connected', async () => {
    const { user } = setup();
    await send(user, 'Order lookups');
    await user.click(button('Review draft'));
    expect(button('Run Now')).toBeDisabled();
    expect(button('Save YAML')).toBeEnabled();
    await user.click(button('Continue conversation'));
    reply({ message: 'Ready.', connection });
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    expect(button('Run Now')).toBeEnabled();
  });

  it('carries a partial replacement into explicit manual setup without inheriting credentials', async () => {
    useRedTeamConfig.getState().setFullConfig(EXAMPLE_CONFIG);
    const { user } = setup();
    await user.click(button('Plan with agent'));
    const { url, body } = connection;
    reply({ message: 'Which header should I send?', plan, connection: { url, body } });
    await send(user, localChat);
    expect(screen.queryByText('Use tests in manual setup')).toBeNull();
    await user.click(button('Manual setup'));
    const handoff = screen.getByRole('menuitem', { name: 'Use tests in manual setup' });
    expect(handoff).toHaveAccessibleDescription(/Replaces the current target/);
    await user.click(handoff);
    expect(config().target.config).toMatchObject({ url, body });
    expect(config().target.config.headers).not.toHaveProperty('Authorization');
  });

  it('locks pending tests, aborts on leaving and ignores late results', async () => {
    const { user } = setup();
    reply({ message: 'Ready.', plan, connection });
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

  it('preserves existing work and never sends saved target settings in scope messages', async () => {
    const target = {
      ...EXAMPLE_CONFIG.target,
      config: {
        ...EXAMPLE_CONFIG.target.config,
        url: 'https://private.example/path?token=private-token',
        headers: { Authorization: 'private' },
      },
    };
    useRedTeamConfig.getState().setFullConfig({ ...EXAMPLE_CONFIG, target });
    const { user } = setup();
    expect(api).not.toHaveBeenCalledWith('/redteam/setup-plan', expect.anything());
    await user.click(button('Plan with agent'));
    await send(user, 'Order lookups');
    expect(screen.queryByText(/private-token/)).not.toBeInTheDocument();
    expect(screen.getByText(/Reviewing replaces/)).toBeInTheDocument();
    expect(config().plugins).toEqual(EXAMPLE_CONFIG.plugins);
    expect(payloads()).toEqual([
      { version: 2, hasTarget: true, messages: [userMessage('Order lookups')] },
    ]);
    await user.click(button('Review setup'));
    expect(config().target).toEqual(target);
    expect(config().plugins).toEqual(['bola']);
  });

  it('does not overwrite later manual edits with stale chat settings', async () => {
    const { user } = setup();
    await send(user, 'Order lookups');
    reply({ message: 'Connected.', connection });
    await send(user, endpointMessage);
    await user.click(button('Review setup'));
    act(() => useRedTeamConfig.getState().updateConfig('numTests', 8));
    await user.click(button('Continue conversation'));
    expect(screen.getByText(/You changed the setup in the editor/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review setup' })).not.toBeInTheDocument();
    await user.click(button('Return to configuration'));
    expect(config().numTests).toBe(8);
  });

  it('preserves input on failure, supports retry and never applies malformed replies', async () => {
    const { user } = setup();
    api.mockResolvedValueOnce(Response.json({ error: 'Agent is busy.' }, { status: 429 }));
    await send(user, 'Customer assistant');
    expect(screen.getByRole('alert')).toHaveTextContent('Agent is busy.');
    expect(input()).toHaveValue('Customer assistant');
    reply({ message: 'Rejected', plan: { ...plan, purpose: '{{env.SECRET}}' } });
    reply({ message: 'Rejected', plan: { ...plan, purpose: '{{env.SECRET}}' } });
    await user.click(button('Send reply'));
    expect(input()).toHaveValue('Customer assistant');
    await user.click(button('Send reply'));
    expect(input()).toHaveValue('');
    expect(config().plugins).toEqual([]);
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
    await act(() => resolve(Response.json(plan)));
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

  it('updates the estimate and blocks review of an empty selection', async () => {
    const { user } = setup();
    await user.click(button('Try the demo app'));
    api.mockResolvedValueOnce(
      Response.json({
        message: 'Here are two risks.',
        plan: {
          ...plan,
          plugins: [...plan.plugins, { id: 'bfla', reason: 'Check unauthorized changes.' }],
        },
      }),
    );
    await user.click(button('Send reply'));
    expect(screen.getByText('~6 requests')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Unauthorized actions' }));
    expect(screen.getByText('~3 requests')).toBeInTheDocument();
    const read = screen.getByRole('checkbox', { name: 'Access to other users’ records' });
    await user.click(read);
    expect(button('Review setup')).toBeDisabled();
    await user.click(read);
    await user.click(button('Review setup'));
    expect(config().plugins).toEqual(['bola']);
  });

  it('resets the approved conversation and the demo', async () => {
    const { user } = setup();
    await user.click(button('Try the demo app'));
    await user.click(button('Send reply'));
    await user.click(button('Review setup'));
    await user.click(button('Config'));
    await user.click(screen.getByRole('menuitem', { name: 'Reset Config' }));
    await user.click(button('Reset'));
    expect(input()).toHaveValue('');
    expect(config()).toEqual(useRedTeamConfig.getInitialState().config);
    expect(screen.queryByRole('button', { name: 'Run Now' })).not.toBeInTheDocument();
  });

  it('opens numbered deep links directly even on first visit', () => {
    setup('#5');
    expect(screen.getByRole('heading', { name: 'Review & Run' })).toBeInTheDocument();
    expect(button('Run Now')).toBeDisabled();
    expect(api).not.toHaveBeenCalledWith('/redteam/setup-plan', expect.anything());
  });
});
