import { createHash } from 'crypto';

export function sha256(str: string) {
  return createHash('sha256').update(str).digest('hex');
}
