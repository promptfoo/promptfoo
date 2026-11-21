import { client, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';
import { VERSION } from '../../version';
import type {
  ClientContext,
  NewSessionResponse,
  SendRequestOptions,
  Stream,
} from '@agentclientprotocol/sdk';

import type { ProviderResponse } from '../../types/providers';

export interface TurnOptions {
  cwd: string;
  prompt: string;
  authMethod?: string;
  model?: string;
  mode?: string;
  signal: AbortSignal;
}

const MAX_OUTPUT_CHARS = 4 * 1024 * 1024;

async function configureSession(
  agent: ClientContext,
  session: NewSessionResponse,
  options: TurnOptions,
  requestOptions: SendRequestOptions,
) {
  for (const category of ['mode', 'model'] as const) {
    const value = options[category];
    if (!value) {
      continue;
    }
    const selector = session.configOptions?.find(
      (option) => option.category === category && option.type === 'select',
    );
    if (selector) {
      await agent.request(
        'session/set_config_option',
        { sessionId: session.sessionId, configId: selector.id, value },
        requestOptions,
      );
    } else if (category === 'mode') {
      // Earlier v1 agents expose modes through a dedicated request.
      await agent.request(
        'session/set_mode',
        { sessionId: session.sessionId, modeId: value },
        requestOptions,
      );
    } else {
      throw new Error(
        'This ACP agent does not advertise a model selector. Configure the model in the agent.',
      );
    }
  }
}

export async function runAcpTurn(stream: Stream, options: TurnOptions): Promise<ProviderResponse> {
  let sessionId: string | undefined;
  let output = '';
  let toolCalls = 0;
  let permissionRequests = 0;
  const app = client()
    .onRequest('session/request_permission', ({ params }) => {
      permissionRequests++;
      const reject = params.options.find((option) => option.kind === 'reject_once');
      return {
        outcome: reject
          ? { outcome: 'selected', optionId: reject.optionId }
          : { outcome: 'cancelled' },
      };
    })
    .onNotification('session/update', ({ params }) => {
      if (params.sessionId !== sessionId) {
        return;
      }
      const { update } = params;
      if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
        if (output.length + update.content.text.length > MAX_OUTPUT_CHARS) {
          connection.close(new Error('ACP assistant output exceeds the text length limit'));
          return;
        }
        output += update.content.text;
      } else if (update.sessionUpdate === 'tool_call') {
        toolCalls++;
      }
    });

  const connection = app.connect(stream);
  const agent = connection.agent;
  const requestOptions = { cancellationSignal: options.signal, stopWaitingOnCancel: true };
  try {
    const initialized = await agent.request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: 'promptfoo', version: VERSION },
        clientCapabilities: {},
      },
      requestOptions,
    );
    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(`Unsupported ACP protocol version: ${initialized.protocolVersion}`);
    }
    if (options.authMethod) {
      if (!initialized.authMethods?.some((method) => method.id === options.authMethod)) {
        throw new Error(
          `ACP server did not advertise authentication method "${options.authMethod}"`,
        );
      }
      await agent.request('authenticate', { methodId: options.authMethod }, requestOptions);
    }

    const session = await agent.request(
      'session/new',
      { cwd: options.cwd, mcpServers: [] },
      requestOptions,
    );
    sessionId = session.sessionId;
    await configureSession(agent, session, options, requestOptions);
    const cancelTurn = () => {
      void agent.notify('session/cancel', { sessionId: session.sessionId }).catch(() => {});
    };
    options.signal.addEventListener('abort', cancelTurn, { once: true });
    const { stopReason } = await agent
      .request(
        'session/prompt',
        {
          sessionId,
          prompt: [{ type: 'text', text: options.prompt }],
        },
        requestOptions,
      )
      .finally(() => options.signal.removeEventListener('abort', cancelTurn));
    const metadata = { acp: { sessionId, stopReason, toolCalls, permissionRequests } };
    if (stopReason === 'cancelled' || !output.trim()) {
      return {
        error: `ACP turn ended with ${stopReason}${output.trim() ? '' : ' and no assistant text'}`,
        metadata,
      };
    }
    return { output, metadata };
  } catch (error) {
    if (error instanceof RequestError && error.code === -32000) {
      return {
        error:
          'Authentication required. Sign in with the agent CLI or configure its credentials before running the eval.',
      };
    }
    throw error;
  } finally {
    connection.close();
  }
}
