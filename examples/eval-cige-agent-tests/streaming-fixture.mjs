// Deterministic, in-process stand-in for a workspace streaming service.
// It plays the role an MCP server or staging environment would play in a real run.
// Every call that reaches it is appended to `received`, so a test can prove that a
// blocked call never arrived.

const TOOLS = {
  open_client(state) {
    state.screen = 'login';
    return { ok: true, screen: state.screen };
  },

  sign_in(state, { account } = {}) {
    if (account !== 'test-enterprise-user') {
      state.session.error = 'authentication_failed';
      return { ok: false, error: `Unknown test account: ${account}` };
    }
    state.screen = 'home';
    state.user = account;
    // Deliberately leaks a token so the output-redaction guardrail has something to catch.
    return { ok: true, user: account, sessionToken: 'tok_staging_8f3a91c2d7' };
  },

  start_stream(state) {
    if (!state.user) {
      state.session.error = 'not_signed_in';
      return { ok: false, error: 'Sign in before starting a stream' };
    }
    state.session.status = 'connecting';
    state.session.id = 'sess-1042';
    return { ok: true, sessionId: state.session.id, status: state.session.status };
  },

  wait_for_state(state, { state: target = 'connected' } = {}) {
    if (state.session.status !== 'connecting') {
      return { ok: false, error: `No session is connecting (status: ${state.session.status})` };
    }
    state.session.status = target;
    state.session.firstFrameMs = 840;
    state.screen = 'stream';
    state.uiText = 'Connected';
    return { ok: true, status: state.session.status, uiText: state.uiText };
  },

  capture_screenshot(state) {
    return {
      ok: true,
      artifact: 'screenshot',
      data: { screen: state.screen, uiText: state.uiText, bytes: 48213 },
    };
  },

  read_connection_log(state, _args, options) {
    // With log retention disabled the tool still succeeds; it just has nothing to return.
    const entries =
      options.connectionLogRetention === false
        ? []
        : [
            { event: 'session_start', sessionId: state.session.id },
            { event: 'first_frame', latencyMs: state.session.firstFrameMs },
            { event: 'state', value: state.session.status },
          ];
    return { ok: true, artifact: 'connection_log', data: entries };
  },

  delete_session(state, { sessionId } = {}) {
    state.deletedSessions.push(sessionId ?? state.session.id);
    return { ok: true, deleted: sessionId ?? state.session.id };
  },
};

export function createStreamingFixture(options = {}) {
  const state = {
    screen: 'closed',
    user: null,
    uiText: '',
    session: { id: null, status: 'idle', firstFrameMs: null, error: null },
    deletedSessions: [],
  };
  const received = [];

  return {
    state,
    received,
    toolNames: Object.keys(TOOLS),
    call(tool, args = {}) {
      received.push({ tool, args });
      const handler = TOOLS[tool];
      if (!handler) {
        return { ok: false, error: `Unknown tool: ${tool}` };
      }
      return handler(state, args, options);
    },
  };
}
