export const passwordHashConfig = {
  algorithm: 'sha1',
};

export function tokenMatches(actualToken: string, expectedToken: string): boolean {
  return actualToken === expectedToken;
}
