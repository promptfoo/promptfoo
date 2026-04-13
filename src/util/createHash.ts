import { createHash } from 'crypto';

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function randomSequence(length: number = 3): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
