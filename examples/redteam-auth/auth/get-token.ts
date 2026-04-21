type AuthContext = {
  vars: Record<string, string>;
};

type AuthResponse = {
  access_token: string;
  expires_in?: number;
};

export default async function getAuth(context: AuthContext) {
  const tokenUrl = 'https://example-app.promptfoo.app/oauth/token';
  const clientId = process.env.PROMPTFOO_TARGET_CLIENT_ID || context.vars.clientId;
  const clientSecret = process.env.PROMPTFOO_TARGET_CLIENT_SECRET || context.vars.clientSecret;
  const scopes = process.env.PROMPTFOO_TARGET_SCOPES || context.vars.scopes || '';

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (scopes) {
    body.set('scope', scopes);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token request failed with status ${response.status}`);
  }

  const data = (await response.json()) as AuthResponse;
  return {
    token: data.access_token,
    expiration: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

export async function buildAuth(context: AuthContext) {
  return getAuth(context);
}
