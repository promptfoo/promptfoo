import { isSecretEnvVarName, looksLikeSecret } from '../../util/sanitizer';
import { isInDenylist } from '../constants/filtering';

export function isShareablePath(file: string): boolean {
  return (
    !isInDenylist(file.toLowerCase(), true) &&
    file
      .split('/')
      .every(
        (part) =>
          part.length > 0 &&
          (!part.startsWith('.') || part === '.github') &&
          !/[\\:*?"<>|\p{Cc}\uFFFD]|[. ]$/u.test(part) &&
          !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part) &&
          !/(?:^|[_.-])(?:credentials?|secrets?|passwords?|passwd|tokens?|private[-_]?keys?)(?:[_.-]|$)|^id_(?:rsa|dsa|ecdsa|ed25519)|^(?:kubeconfig|keyring|keystore|shadow|netrc|authinfo|service[-_]?accounts?|auth\.json)(?:\.|$)/i.test(
            part.replace(/([a-z0-9])([A-Z])/g, '$1-$2'),
          ) &&
          !/\.(?:pem|key|ppk|p8|p12|pfx|jks|kdbx|keystore|tfstate|env)(?:\.|$)/i.test(part),
      )
  );
}

export function isShareableContent(text: string): boolean {
  // Inspect the whole file, including binary bytes between the diff processor's samples.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\uFFFD]/u.test(text)) {
    return false;
  }
  if (
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|glpat-|npm_)[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(
      text,
    ) ||
    /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/i.test(text)
  ) {
    return false;
  }
  for (const [value] of text.matchAll(
    /(?:sk-|key-|AKIA|AIza)[A-Za-z0-9_-]+|[A-Za-z0-9+/=_-]{64,}/g,
  )) {
    if (looksLikeSecret(value)) {
      return false;
    }
  }
  // Quoted literals may occur in source and config files. Limit unquoted
  // assignments to config lines so variable references in normal code remain readable.
  const assignments = [
    /\b([\w-]{1,100})["']?\s*[:=]\s*["']([^"'\s]{5,})["']/g,
    /^[ \t]*(?:export[ \t]+)?([\w-]{1,100})[ \t]*[=:][ \t]*([^"'\s#,;{}()[\]]{5,})[ \t]*(?:#.*)?$/gm,
  ];
  for (const pattern of assignments) {
    for (const [, name, value] of text.matchAll(pattern)) {
      if (
        isSecretEnvVarName(name.replaceAll('-', '_')) &&
        !/^(?:\$|process\.env\.|(?:string|boolean|number|null|undefined)$)/.test(value)
      ) {
        return false;
      }
    }
  }
  return true;
}
