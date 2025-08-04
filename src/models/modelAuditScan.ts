import { randomSequence } from '../util/createHash';

export function createScanId(createdAt: Date = new Date()) {
  return `scan-${randomSequence(3)}-${createdAt.toISOString().slice(0, 19)}`;
}
