const artifactPath = '/workspace/outputs/summary.csv';

async function request(url, method, signal) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'agents=v1',
    },
    redirect: 'error',
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${method} ${url.pathname} returned HTTP ${response.status}`);
  }
  return response;
}

async function findArtifact(sessionUrl, turnId, signal) {
  const url = new URL(`${sessionUrl}/artifacts?limit=100`);
  for (let page = 0; page < 5; page++) {
    const response = await request(url, 'GET', signal);
    const { data, has_more, last_id } = await response.json();
    const match = data.find((item) => item.turn_id === turnId && item.path === artifactPath);
    if (match) {
      return match;
    }
    if (!has_more || !last_id) {
      break;
    }
    url.searchParams.set('after', last_id);
  }
  throw new Error(`Could not find ${artifactPath} for turn ${turnId} in five pages or fewer`);
}

// Compare immutable bytes as they arrive, without buffering a generated file.
async function matchesBytes(response, expected) {
  let offset = 0;
  for await (const chunk of response.body) {
    const end = offset + chunk.length;
    if (!expected.subarray(offset, end).equals(chunk)) {
      return false;
    }
    offset = end;
  }
  return offset === expected.length;
}

export default async function verifyArtifact(_output, context) {
  const { sessionId, turnId } = context.providerResponse.metadata ?? {};
  if (!process.env.OPENAI_API_KEY || !/^sess_[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error('Expected OPENAI_API_KEY and a retained OpenAI session ID');
  }
  const sessionUrl = new URL(`https://api.openai.com/v1/agents/sessions/${sessionId}`);
  try {
    if (!turnId) {
      throw new Error('Missing root turn ID');
    }
    const signal = AbortSignal.timeout(30_000);
    const expected = Buffer.from(context.config.expectedCsv);
    const artifact = await findArtifact(sessionUrl, turnId, signal);
    const url = new URL(`${sessionUrl}/artifacts/${encodeURIComponent(artifact.id)}/content`);
    const pass =
      artifact.size_bytes === expected.length &&
      (await matchesBytes(await request(url, 'GET', signal), expected));
    return {
      pass,
      score: Number(pass),
      reason: `${artifactPath} ${pass ? 'matches' : 'differs from'} the expected CSV bytes`,
    };
  } finally {
    // Cleanup gets its own deadline, including when the content read timed out.
    const deleted = await request(sessionUrl, 'DELETE', AbortSignal.timeout(10_000));
    await deleted.body?.cancel();
  }
}
