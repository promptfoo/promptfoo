// A stdio transport or command tool may pass a credential as a labelled argv value.
// Inspect explicit arguments only. Shell programs and positional values are opaque.
export function getHostedCredentialArgument(
  current: unknown,
  previous: unknown,
  isProtectedKey: (key: string) => boolean,
): { name: string; value: string } | undefined {
  if (typeof current !== 'string') {
    return undefined;
  }
  const header =
    previous === '-H' || previous === '--header' || previous === '--proxy-header'
      ? current
      : /^(?:-H|--(?:proxy-)?header=)(.+)$/s.exec(current)?.[1];
  if (header !== undefined) {
    const separator = header.indexOf(':');
    if (separator > 0) {
      const name = header.slice(0, separator).trim();
      if (isProtectedKey(name)) {
        return { name, value: header.slice(separator + 1).trim() };
      }
    }
  }
  const assignment = /^(?:--)?([A-Za-z_][\w.-]*)=/u.exec(current);
  if (assignment && isProtectedKey(assignment[1])) {
    return { name: assignment[1], value: current.slice(assignment[0].length) };
  }
  const flag = typeof previous === 'string' && /^--([A-Za-z][\w.-]*)$/u.exec(previous);
  return flag && isProtectedKey(flag[1]) ? { name: flag[1], value: current } : undefined;
}

// Raw authorization and cookie fields can embed the credential inside a public envelope.
export function* getHostedHeaderCredentialParts(
  label: string,
  text: string,
  onUnsupported: () => void,
): Iterable<string> {
  const field = label
    .slice(label.lastIndexOf('.') + 1)
    .toLowerCase()
    .replace(/[-_]/g, '');
  if (
    field !== 'authorization' &&
    field !== 'proxyauthorization' &&
    field !== 'cookie' &&
    field !== 'setcookie'
  ) {
    return;
  }
  if (/[\r\n]/.test(text)) {
    onUnsupported();
    return;
  }
  if (field === 'authorization' || field === 'proxyauthorization') {
    // HTTP auth-scheme followed by token68, including DPoP access tokens.
    const token = /^[!#$%&'*+.^_`|~\w-]+[ \t]+([a-z\d._~+/-]+=*)$/i.exec(text.trim());
    if (token) {
      yield token[1];
    } else if (/\s/.test(text.trim())) {
      onUnsupported(); // Parameterized schemes cannot safely be compared as a single token.
    }
    return;
  }
  // A Cookie header lists cookie-pairs. In Set-Cookie the semicolon introduces
  // public attributes. Some HTTP clients combine several Set-Cookie fields.
  const pairs =
    field === 'cookie'
      ? text.split(';')
      : text.split(/,(?=[ \t]*[!#$%&'*+.^_`|~\w-]+[ \t]*=)/).map((part) => part.split(';', 1)[0]);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const value = pair.slice(eq + 1).trim();
      yield value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    }
  }
}
