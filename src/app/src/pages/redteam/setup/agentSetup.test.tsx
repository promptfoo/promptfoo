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
  question: 'Can the bot change an order?',
};
const api = vi.mocked(callApi);
const postCalls = () => api.mock.calls.filter(([, options]) => options?.method === 'POST');
const config = () => useRedTeamConfig.getState().config;
const button = (name: string) => screen.getByRole('button', { name });
const input = () => screen.getByRole('textbox', { name: /what does your app do/i });

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

  it('drafts and refines before changing anything, then validates a local HTTP target and skips to Review', async () => {
    const { user, router } = setup();
    expect(button('Draft test plan')).toBeDisabled();
    await user.type(input(), 'Support bot');
    expect(postCalls()).toHaveLength(0);
    await user.click(button('Draft test plan'));
    expect(await screen.findByRole('heading', { name: 'Your test plan' })).toHaveFocus();
    expect(config().plugins).toEqual([]);
    expect(screen.getByText('3 requests')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Can the bot change an order/), 'Yes');
    const refined = {
      purpose: 'Answers questions and can make changes to orders.',
      plugins: [{ id: 'bfla', reason: 'Check for unauthorized changes.' }],
    };
    api.mockResolvedValueOnce(Response.json(refined));
    await user.click(button('Refine plan'));
    expect(await screen.findByText(refined.plugins[0].reason)).toBeInTheDocument();
    expect(config().plugins).toEqual([]);
    await user.click(button('Use plan & connect app'));
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Target Name/)).toHaveFocus();
    await user.tab();
    expect(button('Change target type')).toHaveFocus();
    await user.tab();
    expect(button('Configure target')).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(button('Review setup'));
    expect(router.state.location.hash).toBe('#1');
    await user.type(screen.getByRole('textbox', { name: /URL/i }), 'http://localhost:8888/chat');
    await user.click(button('Review setup'));
    expect(await screen.findByRole('heading', { name: 'Review & Run' })).toBeInTheDocument();
    expect(screen.getByText('localhost:8888')).toBeInTheDocument();
    expect(screen.getByText('Unauthorized actions')).toBeInTheDocument();
    expect(button('Save YAML')).toBeEnabled();
    expect(button('Run Now')).toBeEnabled();
    expect(load(generateOrderedYaml(config()))).toMatchObject({
      targets: [{ id: 'http', config: { url: 'http://localhost:8888/chat' } }],
      redteam: {
        plugins: [{ id: 'bfla' }],
        strategies: [{ id: 'basic' }],
        numTests: 3,
        purpose: expect.stringContaining(refined.purpose),
      },
    });
    await user.click(button('Edit target'));
    await user.clear(screen.getByRole('textbox', { name: /URL/i }));
    await act(() => router.navigate(-1));
    expect(button('Run Now')).toBeDisabled();
    expect(screen.getByText(/Edit the target to add its URL/)).toBeInTheDocument();
    expect(postCalls().map(([path, options]) => [path, JSON.parse(String(options?.body))])).toEqual(
      [
        ['/redteam/setup-plan', { description: 'Support bot' }],
        ['/redteam/setup-plan', { description: 'Support bot', refinement: 'Yes', previous: plan }],
      ],
    );
  });

  it('takes the demo directly to review and supports browser Back without requesting another plan', async () => {
    const { user, router } = setup();
    await user.click(button('Try the demo app'));
    expect(postCalls()).toHaveLength(0);
    await user.click(button('Draft test plan'));
    await user.click(button('Review demo setup'));
    expect(config().target).toEqual(EXAMPLE_CONFIG.target);
    expect(router.state.location.hash).toBe('#5');
    expect(screen.getByText('customer-service-chatbot-example.promptfoo.app')).toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(screen.getByText(plan.plugins[0].reason)).toBeInTheDocument();
    expect(postCalls()).toHaveLength(1);
  });

  it('keeps existing work in the editor, never sends it to Cloud, and keeps its target on apply', async () => {
    const target = {
      ...EXAMPLE_CONFIG.target,
      config: {
        ...EXAMPLE_CONFIG.target.config,
        url: EXAMPLE_CONFIG.target.config.url + '?token=private-token',
        headers: { Authorization: 'private' },
      },
    };
    useRedTeamConfig.getState().setFullConfig({ ...EXAMPLE_CONFIG, target });
    const { user } = setup();
    expect(api).not.toHaveBeenCalledWith('/redteam/setup-plan', expect.anything());
    await user.click(button('Plan with agent'));
    expect(input()).toHaveValue('');
    await user.type(input(), 'Order lookups');
    await user.click(button('Draft test plan'));
    expect(screen.getByText(/replaces the current purpose/)).toBeInTheDocument();
    expect(config().plugins).toEqual(EXAMPLE_CONFIG.plugins);
    expect(JSON.parse(String(postCalls()[0][1]?.body))).toEqual({ description: 'Order lookups' });
    await user.click(button('Use plan with current target'));
    expect(config().target).toEqual(target);
    expect(config().plugins).toEqual(['bola']);
    await user.click(button('Review setup'));
    expect(screen.getByText('customer-service-chatbot-example.promptfoo.app')).toBeInTheDocument();
    expect(screen.queryByText(/private-token/)).not.toBeInTheDocument();
  });

  it('keeps text on failure, supports retry and will not use malformed plans', async () => {
    const { user } = setup();
    await user.type(input(), 'Customer assistant');
    api.mockResolvedValueOnce(Response.json({ error: 'Agent is busy.' }, { status: 429 }));
    await user.click(button('Draft test plan'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent is busy.');
    expect(input()).toHaveValue('Customer assistant');
    api.mockResolvedValueOnce(Response.json({ ...plan, purpose: '{{env.SECRET}}' }));
    await user.click(button('Draft test plan'));
    expect(screen.queryByText('Your test plan')).not.toBeInTheDocument();
    await user.click(button('Draft test plan'));
    expect(await screen.findByText('Your test plan')).toBeInTheDocument();
  });

  it('aborts pending requests on manual fallback and ignores late results', async () => {
    const { user, router } = setup();
    await user.type(input(), 'Support bot');
    let resolve!: (value: Response) => void;
    api.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    await user.click(button('Draft test plan'));
    await user.click(button('Set up manually'));
    expect(postCalls()[0][1]?.signal?.aborted).toBe(true);
    await act(() => resolve(Response.json(plan)));
    await act(() => router.navigate(-1));
    expect(input()).toHaveValue('Support bot');
    expect(config().plugins).toEqual([]);
  });

  it('supports manual setup with remote generation disabled', async () => {
    api.mockResolvedValueOnce(Response.json({ enabled: false }));
    const { user, router } = setup();
    expect(await screen.findByText('Agent setup is turned off')).toBeInTheDocument();
    expect(screen.queryByText('Draft test plan')).not.toBeInTheDocument();
    await user.click(button('Set up manually'));
    expect(router.state.location.hash).toBe('#0');
    expect(postCalls()).toHaveLength(0);
  });

  it('lets users choose specific risks and shows the revised request count before apply', async () => {
    const { user } = setup();
    await user.click(button('Try the demo app'));
    const both = {
      ...plan,
      plugins: [...plan.plugins, { id: 'bfla', reason: 'Check for unauthorized changes.' }],
      note: 'This plan does not test indirect prompt injection.',
    };
    api.mockResolvedValueOnce(Response.json(both));
    await user.click(button('Draft test plan'));
    expect(screen.getByText(both.note)).toBeInTheDocument();
    expect(screen.getByText('6 requests')).toBeInTheDocument();
    const read = screen.getByRole('checkbox', { name: 'Access to other users’ records' });
    const write = screen.getByRole('checkbox', { name: 'Unauthorized actions' });
    await user.click(write);
    expect(screen.getByText('3 requests')).toBeInTheDocument();
    await user.click(read);
    expect(button('Review demo setup')).toBeDisabled();
    await user.click(read);
    await user.click(button('Review demo setup'));
    expect(config().plugins).toEqual(['bola']);
    expect(postCalls()).toHaveLength(1);
  });

  it('offers manual setup or refinement when no starter test covers the risk, without applying an empty plan', async () => {
    const { user, router } = setup();
    const unsupported = {
      purpose: 'Check a custom business rule.',
      plugins: [],
      note: 'Starter tests do not cover that rule. Add a custom policy in manual setup.',
    };
    await user.type(input(), 'Custom business rule');
    api.mockResolvedValueOnce(Response.json(unsupported));
    await user.click(button('Draft test plan'));
    expect(screen.getByRole('heading', { name: 'No matching starter tests' })).toHaveFocus();
    expect(screen.getByText(unsupported.note)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use plan/ })).not.toBeInTheDocument();
    expect(button('Edit description')).toBeEnabled();
    await user.click(button('Set up manually'));
    expect(router.state.location.hash).toBe('#0');
    expect(config()).toEqual(useRedTeamConfig.getInitialState().config);
    await act(() => router.navigate(-1));
    await user.type(screen.getByLabelText(/What else should we test/), 'Order privacy');
    await user.click(button('Refine plan'));
    expect(JSON.parse(String(postCalls()[1][1]?.body)).previous).toEqual(unsupported);
    expect(button('Use plan & connect app')).toBeEnabled();
    expect(config()).toEqual(useRedTeamConfig.getInitialState().config);
  });

  it('resets the approved plan and clears the demo so the next setup starts fresh', async () => {
    const { user } = setup();
    await user.click(button('Try the demo app'));
    await user.click(button('Draft test plan'));
    await user.click(button('Review demo setup'));
    await user.click(button('Reset Config'));
    await user.click(button('Reset'));
    expect(input()).toHaveValue('');
    expect(config()).toEqual(useRedTeamConfig.getInitialState().config);
    expect(screen.queryByRole('button', { name: 'Run Now' })).not.toBeInTheDocument();
  });

  it('opens numbered deep links directly even on first visit', () => {
    setup('#5');
    expect(screen.getByRole('heading', { name: 'Review & Run' })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith('/redteam/setup-plan', expect.anything());
  });
});
