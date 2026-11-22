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
const postCalls = () => api.mock.calls.filter(([, options]) => options?.method === 'POST');
const config = () => useRedTeamConfig.getState().config;
const button = (name: string) => screen.getByRole('button', { name });
const input = () =>
  screen.getByRole('textbox', { name: /Message the setup agent|Connection reply/i });
const payloads = () => postCalls().map(([, options]) => JSON.parse(String(options?.body)));
const userMessage = (content: string) => ({ role: 'user', content });
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
        return Response.json(options?.method === 'POST' ? plan : { enabled: true });
      }
      return Response.json({});
    });
  });

  it('clarifies, connects and revises in the conversation, then opens review without the wizard', async () => {
    const { user, router } = setup();
    expect(button('Send reply')).toBeDisabled();
    const question = 'What can customers do with their orders?';
    api.mockResolvedValueOnce(Response.json({ question }));
    await send(user, 'Support bot');
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.getByText('Support bot')).toBeInTheDocument();
    expect(input()).toHaveFocus();
    await send(user, 'View and change orders');
    expect(input()).toHaveAccessibleName('Connection reply');
    await send(user, 'http://localhost:8888/chat');
    await user.click(button('{"message":"{{prompt}}"}'));
    await send(user, '{"result":{"answer":"Example reply"}}');
    await send(user, 'CUSTOMER_API_TOKEN');
    expect(button('Review setup')).toHaveFocus();
    expect(screen.getByText('Bearer token from CUSTOMER_API_TOKEN')).toBeInTheDocument();
    expect(screen.getByText('~3 requests')).toBeInTheDocument();
    expect(config().plugins).toEqual([]);
    expect(router.state.location.hash).toBe('');
    const refined = { ...plan, numTests: 2 };
    api.mockResolvedValueOnce(Response.json(refined));
    await send(user, 'Only two tests per risk please');
    expect(screen.getByRole('log')).toHaveTextContent('updated the plan to 2 tests per risk');
    expect(screen.getByText('~2 requests')).toBeInTheDocument();
    expect(config().plugins).toEqual([]);
    const messages = [
      userMessage('Support bot'),
      { role: 'assistant', content: question },
      userMessage('View and change orders'),
    ];
    expect(payloads()).toEqual([
      { messages: messages.slice(0, 1) },
      { messages },
      { messages: [...messages, userMessage('Only two tests per risk please')], previous: plan },
    ]);
    await user.click(button('Review setup'));
    expect(router.state.location.hash).toBe('#5');
    expect(screen.getByText('localhost:8888')).toBeInTheDocument();
    expect(button('Save YAML')).toBeEnabled();
    expect(button('Run Now')).toBeEnabled();
    expect(load(generateOrderedYaml(config()))).toMatchObject({
      targets: [
        {
          id: 'http',
          config: {
            url: 'http://localhost:8888/chat',
            body: { message: '{{prompt}}' },
            transformResponse: 'json.result.answer',
            headers: { Authorization: 'Bearer {{env.CUSTOMER_API_TOKEN}}' },
          },
        },
      ],
      redteam: {
        plugins: [{ id: 'bola' }],
        strategies: [{ id: 'basic' }],
        numTests: 2,
        purpose: expect.stringContaining('Change orders'),
      },
    });
    expect(postCalls().every(([path]) => path === '/redteam/setup-plan')).toBe(true);
  });

  it('preserves the transcript and changes stale application facts on a post-review correction', async () => {
    const { user } = setup();
    await send(user, 'Order bot');
    await send(user, 'ollama:chat:llama3');
    await user.click(button('Review setup'));
    expect(config().purpose).toContain('Change orders');
    await user.click(button('Continue conversation'));
    expect(screen.getByText('Order bot')).toBeInTheDocument();
    api.mockResolvedValueOnce(
      Response.json({ ...plan, application: { forbiddenActions: 'Issue refunds' } }),
    );
    await send(user, 'Actually it cannot change orders or issue refunds');
    await user.click(button('Review setup'));
    expect(config().purpose).not.toContain('Change orders');
    expect(config().purpose).toContain('Issue refunds');
    expect(config().target.id).toBe('ollama:chat:llama3');
    expect(JSON.stringify(payloads())).not.toContain('ollama');
  });

  it('keeps demo setup keyless, explains a recommendation without changing it, and supports Back', async () => {
    const { user, router } = setup();
    await user.click(button('Try the demo app'));
    expect(postCalls()).toHaveLength(0);
    api.mockResolvedValueOnce(
      Response.json({ ...plan, application: { redteamUser: 'Support agent' } }),
    );
    await user.click(button('Send reply'));
    expect(button('Review setup')).toBeEnabled();
    api.mockResolvedValueOnce(
      Response.json({ explanation: 'Order IDs can expose other accounts.' }),
    );
    await send(user, 'Why this test?');
    expect(screen.getByText('Order IDs can expose other accounts.')).toBeInTheDocument();
    await user.click(button('Review setup'));
    expect(config().target).toEqual(EXAMPLE_CONFIG.target);
    expect(config().applicationDefinition.redteamUser).toBe('john.doe@example.com a customer');
    expect(config().purpose).toContain('jane.smith@example.com');
    expect(JSON.stringify(payloads())).not.toContain('@example.com');
    expect(config().plugins).toEqual(['bola']);
    await act(() => router.navigate(-1));
    expect(screen.getByText(plan.plugins[0].reason)).toBeInTheDocument();
    expect(postCalls()).toHaveLength(2);
  });

  it('pauses a local answer to adjust scope and never shares the partial connection', async () => {
    const { user } = setup();
    await send(user, 'Order bot');
    await send(user, 'https://private.example');
    await user.click(input());
    await user.paste('{"privateField":"{{prompt}}"}');
    await user.click(button('Adjust tests'));
    expect(input()).toHaveValue('');
    expect(input()).toHaveAccessibleName('Message the setup agent');
    await send(user, 'Only test access to orders');
    expect(input()).toHaveValue('{"privateField":"{{prompt}}"}');
    expect(input()).toHaveAccessibleName('Connection reply');
    await user.click(button('Send reply'));
    await send(user, 'result.text');
    await send(user, 'Actually the reply is at result.answer');
    await user.click(button('No auth'));
    await user.click(button('Review setup'));
    expect(config().target.config).toMatchObject({
      body: { privateField: '{{prompt}}' },
      transformResponse: 'json.result.answer',
    });
    expect(JSON.stringify(payloads())).not.toMatch(/privateField|private.example|result.answer/);
  });

  it('explains tests locally and asks before moving a test correction to Cloud', async () => {
    const { user } = setup();
    await send(user, 'Order bot');
    await send(user, 'Why these tests?');
    expect(screen.getByRole('log')).toHaveTextContent(plan.plugins[0].reason);
    const correction = 'Actually, the bot only reads order history. Test customer privacy.';
    await send(user, correction);
    expect(screen.getByRole('alert')).toHaveTextContent(/still local/);
    await user.click(button('Edit reply for Promptfoo Cloud'));
    expect(postCalls()).toHaveLength(1);
    expect(input()).toHaveValue(correction);
    expect(input()).toHaveAccessibleName('Message the setup agent');
    await user.click(button('Send reply'));
    expect(payloads()[1].messages).toEqual([userMessage('Order bot'), userMessage(correction)]);
    expect(input()).toHaveAccessibleName('Connection reply');
  });

  it('reviews an incomplete draft without a target and finishes connecting in the conversation', async () => {
    const { user, router } = setup();
    await send(user, 'Order bot');
    await user.click(button('I don’t have an endpoint yet'));
    expect(screen.getByRole('log')).toHaveTextContent(/You can add a connection later/);
    await user.click(button('Review draft'));
    expect(router.state.location.hash).toBe('#5');
    expect(config().target.config.url).toBe('');
    expect(config().plugins).toEqual(['bola']);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/connect a target before running/)).toBeInTheDocument();
    expect(button('Run Now')).toBeDisabled();
    expect(button('Save YAML')).toBeEnabled();
    await user.click(button('Continue conversation'));
    expect(input()).toHaveAccessibleName('Connection reply');
    await send(user, 'ollama:chat:llama3');
    await user.click(button('Review setup'));
    expect(config().target.id).toBe('ollama:chat:llama3');
    expect(button('Run Now')).toBeEnabled();
    expect(postCalls()).toHaveLength(1);
  });

  it('drops old app details, prompts and extensions when switching to a new target', async () => {
    useRedTeamConfig.getState().setFullConfig({
      ...EXAMPLE_CONFIG,
      prompts: ['private customer data {{prompt}}'],
      defaultTest: { vars: { name: 'private customer' } },
      entities: ['private customer'],
      extensions: ['file://private.js'],
    });
    const { user } = setup();
    await user.click(button('Plan with agent'));
    await send(user, 'Order bot');
    await send(user, 'ollama:chat:llama3');
    expect(screen.getByText(/Reviewing replaces your target/)).toBeInTheDocument();
    await user.click(button('Review setup'));
    expect(config().prompts).toEqual(['{{prompt}}']);
    expect(config().extensions).toBeUndefined();
    expect(config().defaultTest).toBeUndefined();
    expect(config().entities).toEqual([]);
    expect(config().purpose).not.toContain('@example.com');
  });

  it('keeps a mixed opening local until the user confirms the description without a URL', async () => {
    const { user } = setup();
    await send(user, 'A private order bot at https://private.example/chat');
    expect(postCalls()).toHaveLength(0);
    expect(input()).toHaveValue('A private order bot');
    await user.click(button('Send reply'));
    expect(payloads()).toEqual([{ messages: [userMessage('A private order bot')] }]);
    await user.click(button('{"prompt":"{{prompt}}"}'));
    await user.click(button('Plain text'));
    await user.click(button('No auth'));
    await user.click(button('Review setup'));
    expect(config().target.config).toMatchObject({
      url: 'https://private.example/chat',
      body: { prompt: '{{prompt}}' },
      transformResponse: 'text',
    });
  });

  it('accepts cURL without redundant questions, rejects a literal credential and edits the reply field locally', async () => {
    const { user } = setup();
    await send(user, 'Order lookups');
    const curl =
      'curl https://private.example/chat -H \'Authorization: Bearer $MY_API_TOKEN\' -d \'{"input":"hello"}\'';
    await send(user, curl.replace('$MY_API_TOKEN', 'secret-token-123'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('log')).not.toHaveTextContent('secret-token-123');
    await user.clear(input());
    await send(user, curl);
    await send(user, 'result.text');
    await send(user, 'The reply is at result.answer');
    await user.click(button('Review setup'));
    expect(config().target.config).toMatchObject({
      url: 'https://private.example/chat',
      body: { input: '{{prompt}}' },
      transformResponse: 'json.result.answer',
      headers: { Authorization: 'Bearer {{env.MY_API_TOKEN}}' },
    });
    expect(payloads()).toEqual([{ messages: [userMessage('Order lookups')] }]);
  });

  it('keeps a fresh plan when the user switches to manual setup for an unsupported connection', async () => {
    const { user, router } = setup();
    await send(user, 'Order bot');
    await user.click(button('Set up manually'));
    expect(router.state.location.hash).toBe('#0');
    expect(config().plugins).toEqual(['bola']);
    expect(config().target.config.url).toBe('');
  });

  it('keeps a completed connection when switching to manual setup before review', async () => {
    const { user } = setup();
    await send(user, 'Order bot');
    await send(user, 'ollama:chat:llama3');
    expect(button('Review setup')).toBeEnabled();
    await user.click(button('Set up manually'));
    expect(config().plugins).toEqual(['bola']);
    expect(config().target.id).toBe('ollama:chat:llama3');
  });

  it('carries a partial replacement connection into explicit manual setup without inheriting credentials', async () => {
    const { user, router } = setup();
    await send(user, 'Order bot');
    await send(
      user,
      'curl https://old.example/chat -H \'Authorization: Bearer $OLD_TOKEN\' -d \'{"message":"test"}\'',
    );
    await send(user, 'response');
    await user.click(button('Review setup'));
    await user.click(button('Continue conversation'));
    await send(user, 'https://new.example/chat');
    await send(user, 'input');
    await send(user, 'answer');
    await user.click(button('Use tests in manual setup'));
    expect(router.state.location.hash).toBe('#0');
    expect(config().target.config).toMatchObject({
      url: 'https://new.example/chat',
      body: { input: '{{prompt}}' },
      transformResponse: 'json.answer',
    });
    expect(config().target.config.headers).not.toHaveProperty('Authorization');
    expect(config().plugins).toEqual(['bola']);
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
    expect(payloads()).toEqual([{ messages: [userMessage('Order lookups')] }]);
    await user.click(button('Review setup'));
    expect(config().target).toEqual(target);
    expect(config().plugins).toEqual(['bola']);
  });

  it('does not overwrite later manual edits with stale chat settings', async () => {
    const { user } = setup();
    await send(user, 'Order lookups');
    await send(user, 'ollama:chat:llama3');
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
    api.mockResolvedValueOnce(Response.json({ ...plan, purpose: '{{env.SECRET}}' }));
    await user.click(button('Send reply'));
    expect(input()).toHaveValue('Customer assistant');
    await user.click(button('Send reply'));
    expect(input()).toHaveAccessibleName('Connection reply');
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
        ...plan,
        plugins: [...plan.plugins, { id: 'bfla', reason: 'Check unauthorized changes.' }],
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

  it('explains unsupported requests and offers a way back to the last usable plan', async () => {
    const { user } = setup();
    await user.click(button('Try the demo app'));
    await user.click(button('Send reply'));
    api.mockResolvedValueOnce(
      Response.json({
        purpose: plan.purpose,
        plugins: [],
        note: 'Starter tests cannot check this business rule.',
      }),
    );
    await send(user, 'Only check my custom rule');
    expect(screen.getByText(/Starter tests cannot check/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review setup' })).not.toBeInTheDocument();
    expect(config().plugins).toEqual([]);
    await user.click(button('Keep previous tests'));
    expect(button('Review setup')).toBeEnabled();
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
