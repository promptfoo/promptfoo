import { createHash } from 'node:crypto';

export function hashPassword(password: string): string {
  return createHash('sha1').update(password).digest('hex');
}

export function tokenMatches(actualToken: string, expectedToken: string): boolean {
  return actualToken === expectedToken;
}
