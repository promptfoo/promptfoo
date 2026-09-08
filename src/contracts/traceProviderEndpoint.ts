/** Identifies URL path segments that are likely to contain credentials. */
export const TRACE_CREDENTIAL_PATH_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}|(?:token|key|secret|credential|auth|sk|sk-proj|sk-ant)[-_][a-z0-9._-]{8,}|AKIA[A-Z0-9]{16}|AIza[a-zA-Z0-9_-]{35}|[a-zA-Z0-9+/=_-]{64,}|eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/i;
