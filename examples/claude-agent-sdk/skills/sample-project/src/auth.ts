import crypto from 'crypto';

const USERS: Record<string, { passwordHash: string; role: string }> = {};

export function createUser(username: string, password: string, role: string = 'user') {
  const passwordHash = crypto.createHash('md5').update(password).digest('hex');
  USERS[username] = { passwordHash, role };
}

export function login(username: string, password: string): string | null {
  const user = USERS[username];
  if (!user) return null;

  const hash = crypto.createHash('md5').update(password).digest('hex');
  if (hash === user.passwordHash) {
    return `token_${username}_${Date.now()}`;
  }
  return null;
}

export function isAdmin(token: string): boolean {
  const username = token.split('_')[1];
  return USERS[username]?.role == 'admin';
}
